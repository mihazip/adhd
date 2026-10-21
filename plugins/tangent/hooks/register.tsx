import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelEffort, Register } from 'claude-code'

import type { Job } from '../types'

// || question || is the primary form; \\\ question \\\ and /// question /// are aliases. Users can add their own.
export type Delims = [open: string, close: string][]
export const DEFAULT_DELIMS: Delims = [
  ['||', '||'],
  ['\\\\\\', '\\\\\\'],
  ['///', '///'],
]
// The aliases are never typed by accident; every other pair needs a query of 2+ words.
const ALIASES = new Set(['\\\\\\', '///'])
const MIN_WORDS = 2
const MODELS: Record<string, string> = { h: 'haiku', s: 'sonnet', o: 'opus', f: 'fable' }
const LEVELS: Record<string, ModelEffort> = { l: 'low', m: 'medium', h: 'high', x: 'xhigh', xx: 'max' }
const CODE = /^([hsof])(xx|[lmhx])?$/
const DEFAULT = 'hh'
// Whole side session stays near 10k tokens: ~5k of draft in, 3k out.
const CONTEXT_CHARS = 20000
const MAX_TOKENS = 3000

export const SYSTEM =
  'You fill in one spot inside a draft the user is typing. ' +
  'You get the draft before the spot, the spot itself (a question or an instruction), and the draft after it. ' +
  'The draft around the spot is context only: never continue, finish or rephrase it, and never repeat the spot. ' +
  'If the spot is a question or a request for information, your reply is the ANSWER: the actual facts, ' +
  'compact, one to three sentences unless it asks for more. ' +
  'Never answer by completing or restating the question, even when the draft around it is itself a question. ' +
  'If the spot is an instruction to write something (for example "a friendly closing line"), write that text ' +
  'so it flows into the draft: same language, voice and register, matching case and punctuation. ' +
  'If it could be either, prefer answering. ' +
  'Reply with only the text for the spot: no preamble, no quotes around it, no markdown, no notes to the user.'

const nextId = atom({ plugin: 'tangent', key: 'nextId' } as const, 1)
const jobs = atom({ plugin: 'tangent', key: 'jobs' } as const, {})
const preset = atom({ plugin: 'tangent', key: 'preset' } as const, DEFAULT)
const held = atom({ plugin: 'tangent', key: 'held' } as const, '')
// Pairs the user added (store key 'pairs'), built-in opens switched off (store key 'off'), and the options pair.
const custom = atom({ plugin: 'tangent', key: 'custom' } as const, [])
const off = atom({ plugin: 'tangent', key: 'off' } as const, [])
const extra = atom({ plugin: 'tangent', key: 'extra' } as const, [])
const notice = atom({ plugin: 'tangent', key: 'notice' } as const, '')
// Windows Terminal 'Ubuntu' scheme; change here for another palette
const THEME = { bg: '#300A24', fg: '#EEEEEC', dim: '#D0CFCC', accent: '#E9AD0C', info: '#33C7DE', error: '#F66151' }

const PANE = 'tangent-delims'

export function parseCode(code: string): { model: string; effort: ModelEffort } | undefined {
  const m = CODE.exec(code)
  const model = MODELS[m?.[1] ?? '']
  const effort = LEVELS[m?.[2] ?? 'h']
  return model && effort ? { model, effort } : undefined
}

export function tag(id: number, q: string): string {
  const short = q.length > 24 ? q.slice(0, 23).trimEnd() + '…' : q
  return `⟦${id} ${short}⟧`
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&')
}

// A delimiter is 2+ characters with no letters and no whitespace.
export function checkDelim(d: string): boolean {
  return d.length >= 2 && !/[\p{L}\s]/u.test(d)
}

export function parseDelims(raw: unknown): Delims | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined
  const [open, close] = raw
  if (typeof open !== 'string' || typeof close !== 'string') return undefined
  return checkDelim(open) && checkDelim(close) ? [[open, close]] : undefined
}

// Finds a closed <open>query<close>code just before `end` (where the space was typed).
export function findQuery(
  text: string,
  end: number,
  pairs: Delims = DEFAULT_DELIMS,
): { start: number; query: string; code: string } | undefined {
  const head = text.slice(0, end)
  for (const [mark, shut] of pairs) {
    const tail = new RegExp(`${escapeRegex(shut)}([a-z]{0,3})$`).exec(head)
    if (!tail) continue
    const found = between(head, mark, tail.index, tail[1] ?? '', !(ALIASES.has(mark) && mark === shut))
    if (found) return found
  }
  return undefined
}

// True when `at` sits inside an unclosed ``` fence or `inline` span (spans end at a newline).
export function inCode(text: string, at: number): boolean {
  let fence = false
  let inline = false
  for (let i = 0; i < at; i++) {
    if (text.startsWith('```', i)) {
      fence = !fence
      inline = false
      i += 2
    } else if (fence) continue
    else if (text[i] === '`') inline = !inline
    else if (text[i] === '\n') inline = false
  }
  return fence || inline
}

function between(
  head: string,
  mark: string,
  close: number,
  tailCode: string,
  needWords: boolean,
): { start: number; query: string; code: string } | undefined {
  const open = head.lastIndexOf(mark, close - 1)
  if (open < 0 || open + mark.length > close) return undefined
  if (inCode(head, open)) return undefined
  let query = head.slice(open + mark.length, close).trim()
  let code = tailCode
  // The code may also lead the query: \\\sh question\\\
  const lead = /^([a-z]{1,3})\s+/.exec(query)
  if (!code && lead?.[1] && parseCode(lead[1])) {
    code = lead[1]
    query = query.slice(lead[0].length)
  }
  if (!query || (code && !parseCode(code))) return undefined
  // `a || b || ` is code, not a question.
  if (needWords && query.split(/\s+/).length < MIN_WORDS) return undefined
  return { start: open, query, code }
}

export function buildPrompt(job: Pick<Job, 'before' | 'query' | 'after'>): string {
  return (
    `<draft_before>\n${job.before}\n</draft_before>\n` +
    `<spot>\n${job.query}\n</spot>\n` +
    `<draft_after>\n${job.after}\n</draft_after>\n` +
    'The draft is context only. If the spot asks a question or for information, reply with the answer, ' +
    'not a continuation or rephrasing of the question. If it asks you to write text, write it so it fits the draft. ' +
    'Reply with only the text for the spot.'
  )
}

async function run($: EngineInterface, id: number): Promise<void> {
  const job = (await read($, jobs))[String(id)]
  if (!job) return
  await showStatus($)
  const r = await $.model.complete({
    model: job.model,
    system: SYSTEM,
    prompt: buildPrompt(job),
    maxTokens: MAX_TOKENS,
    effort: job.effort,
    timeoutMs: 90000,
  })
  const answer = r.isAnswered ? r.text.trim() : ''
  await update($, jobs, all => ({
    ...all,
    [String(id)]: { ...job, answer, isDone: true, failure: r.isAnswered ? '' : r.reason },
  }))
  await place($, id)
  await sendHeld($)
  await showStatus($)
}

// Swaps the tag in the prompt box for the answer, or says where it went.
async function place($: EngineInterface, id: number): Promise<void> {
  const job = (await read($, jobs))[String(id)]
  if (!job?.isDone) return
  if ((await read($, held)).includes(job.tag)) return
  const box = await $.prompt.read()
  const at = box.text.indexOf(job.tag)
  if (at < 0) {
    if (job.answer) $.ui.toast(`tangent ${id}: ${job.answer.slice(0, 200)}`, { timeoutMs: 15000 })
    return
  }
  const text = job.answer || `[${job.query}: ${job.failure}]`
  await $.prompt.fill({
    text: box.text.slice(0, at) + text + box.text.slice(at + job.tag.length),
    mode: 'replace',
  })
  if (!job.answer) $.ui.toast(`tangent ${id} failed: ${job.failure}`)
  await forget($, id)
}

async function forget($: EngineInterface, id: number): Promise<void> {
  await update($, jobs, all => {
    const rest = { ...all }
    delete rest[String(id)]
    return rest
  })
}

async function showStatus($: EngineInterface): Promise<void> {
  const busy = Object.values(await read($, jobs)).filter(j => !j.isDone).length
  $.ui.status(busy ? `tangent: ${busy} running` : undefined)
}

async function start($: EngineInterface, text: string, found: { start: number; query: string; code: string }, end: number) {
  const id = await read($, nextId)
  await update($, nextId, n => n + 1)
  const picked = parseCode(found.code || (await read($, preset))) ?? parseCode(DEFAULT)!
  const job: Job = {
    tag: tag(id, found.query),
    query: found.query,
    model: picked.model,
    effort: picked.effort,
    before: text.slice(0, found.start).slice(-CONTEXT_CHARS),
    after: text.slice(end).slice(0, 2000),
    answer: '',
    failure: '',
    isDone: false,
  }
  await update($, jobs, all => ({ ...all, [String(id)]: job }))
  $.clock.after(0, () => void run($, id))
  return job.tag
}

// Built-ins that are not switched off, then the user's pairs, then the options pair.
export function activePairs(mine: Delims = [], disabled: string[] = [], fromOptions: Delims = []): Delims {
  const all = [...DEFAULT_DELIMS.filter(([o]) => !disabled.includes(o)), ...mine, ...fromOptions]
  return all.filter(([o], i) => all.findIndex(([p]) => p === o) === i)
}

async function active($: EngineInterface): Promise<Delims> {
  return activePairs(await read($, custom), await read($, off), await read($, extra))
}

function showDelims(pairs: Delims): string {
  return pairs.map(([o, c]) => `${o} question ${c}`).join('  or  ')
}

function isBuiltin(open: string): boolean {
  return DEFAULT_DELIMS.some(([o]) => o === open)
}

async function saveCustom($: EngineInterface, pairs: Delims): Promise<void> {
  await update($, custom, () => pairs)
  if (pairs.length) await $.store.set('pairs', pairs)
  else await $.store.delete('pairs')
}

async function saveOff($: EngineInterface, opens: string[]): Promise<void> {
  await update($, off, () => opens)
  if (opens.length) await $.store.set('off', opens)
  else await $.store.delete('off')
}

// "open close" (close optional) to a pair: adds it, or says why not.
export async function addPair($: EngineInterface, open: string, close = open): Promise<string> {
  const pair = parseDelims([open, close])
  if (!pair) return 'Each delimiter is 2+ characters, no letters, digits or spaces, e.g. ;;; or >>> <<<.'
  if (isBuiltin(open)) return `${open} is built in: switch it on instead.`
  const mine = (await read($, custom)).filter(([o]) => o !== open)
  await saveCustom($, [...mine, ...pair])
  return `Added ${open} question ${close}.`
}

export async function removePair($: EngineInterface, open: string): Promise<string> {
  const mine = await read($, custom)
  if (!mine.some(([o]) => o === open)) return `No custom pair opens with ${open}.`
  await saveCustom($, mine.filter(([o]) => o !== open))
  return `Removed ${open}.`
}

// Switches a built-in on or off; at least one pair must stay enabled.
export async function toggleBuiltin($: EngineInterface, open: string, on?: boolean): Promise<string> {
  if (!isBuiltin(open)) return `${open} is not a built-in pair.`
  const disabled = await read($, off)
  const turnOn = on ?? disabled.includes(open)
  if (!turnOn) {
    const rest = activePairs(await read($, custom), [...disabled, open], await read($, extra))
    if (!rest.length) return 'At least one pair must stay on.'
  }
  await saveOff($, turnOn ? disabled.filter(o => o !== open) : [...new Set([...disabled, open])])
  return `${open} is ${turnOn ? 'on' : 'off'}.`
}

async function resetDelims($: EngineInterface): Promise<string> {
  await saveCustom($, [])
  await saveOff($, [])
  return 'Custom pairs removed, built-ins all on.'
}

async function openPicker($: EngineInterface): Promise<void> {
  await update($, notice, () => '')
  await $.ui.open({ id: PANE, title: 'tangent delimiters', focus: true, rows: 14 })
}

// Runs a picker action and shows what it said in the pane's notice line.
async function say($: EngineInterface, doing: Promise<string>): Promise<void> {
  const said = await doing
  await update($, notice, () => said)
}

// The Input holds "open close" (close optional).
async function addFromInput($: EngineInterface, value: string): Promise<void> {
  const [open, close, ...rest] = value.trim().split(/\s+/).filter(Boolean)
  if (!open || rest.length) {
    await update($, notice, () => 'Type an opening and optional closing delimiter, e.g. ;;; or >>> <<<.')
    return
  }
  await say($, addPair($, open, close))
}

async function setDelims($: EngineInterface, args: string): Promise<{ text: string }> {
  const [verb, first, second, ...rest] = args.trim().split(/\s+/).filter(Boolean)
  let said = ''
  if (!verb) {
    await openPicker($)
    return { text: 'tangent delimiters pane opened.' }
  }
  if (verb === 'reset' && !first) said = await resetDelims($)
  else if (verb === 'add' && first && !rest.length) said = await addPair($, first, second)
  else if (verb === 'remove' && first && !second) said = await removePair($, first)
  else if ((verb === 'on' || verb === 'off') && first && !second) said = await toggleBuiltin($, first, verb === 'on')
  else {
    return {
      text:
        `Delimiters: ${showDelims(await active($))}\n` +
        'Usage: /tangent delims (picker) | add <open> [close] | remove <open> | on <builtin> | off <builtin> | reset. ' +
        'Each is 2+ characters, no letters or spaces, e.g. ;;; or >>> <<<.',
    }
  }
  return { text: `tangent: ${said} Active: ${showDelims(await active($))}` }
}

// Reads the saved pairs and switches, moves an old single 'delims' pair into 'pairs' once,
// and takes the plugin options as one more pair.
async function loadDelims($: EngineInterface, opened: unknown, closed: unknown): Promise<void> {
  const keep = (raw: unknown): Delims =>
    Array.isArray(raw) ? raw.flatMap(p => parseDelims(p) ?? []).filter(([o]) => !isBuiltin(o)) : []
  let mine = keep(await $.store.get('pairs'))
  const rawOld = await $.store.get('delims')
  if (rawOld !== undefined) {
    const old = parseDelims(rawOld)
    if (old && !isBuiltin(old[0][0]) && !mine.some(([o]) => o === old[0][0])) mine = [...mine, ...old]
    await saveCustom($, mine)
    await $.store.delete('delims')
  } else {
    await update($, custom, () => mine)
  }
  const saved = await $.store.get('off')
  const disabled = Array.isArray(saved) ? saved.filter((o): o is string => typeof o === 'string' && isBuiltin(o)) : []
  await update($, off, () => disabled)
  const fromOptions = typeof opened === 'string' && opened ? parseDelims([opened, closed || opened]) : undefined
  await update($, extra, () => (fromOptions && !isBuiltin(fromOptions[0][0]) ? fromOptions : []))
  // never leave nothing enabled
  if (!(await active($)).length) await saveOff($, [])
}

async function setPreset($: EngineInterface, args: string): Promise<{ text: string }> {
  const code = args.trim().toLowerCase()
  if (/^delims(\s|$)/.test(code)) return setDelims($, args.trim().slice('delims'.length))
  if (!code) {
    const p = parseCode(await read($, preset))!
    return {
      text:
        `tangent default: ${p.model} ${p.effort}. Set with /tangent <code>, e.g. /tangent sm.\n` +
        `Delimiters: ${showDelims(await active($))}. Edit them with /tangent delims (opens a picker), or add <open> [close], remove <open>, on/off <builtin>, reset.`,
    }
  }
  const p = parseCode(code)
  if (!p) return { text: 'Code is a model letter (h s o f) plus a level (l m h x, or xx for max), e.g. hm, sh, fxx.' }
  await update($, preset, () => code)
  await $.store.set('preset', code)
  return { text: `tangent default is now ${p.model} ${p.effort}.` }
}

// Puts finished answers in place of their tags; says how many still run.
async function fillDone($: EngineInterface, text: string): Promise<{ text: string; running: number }> {
  let out = text
  let running = 0
  for (const [id, j] of Object.entries(await read($, jobs))) {
    if (!out.includes(j.tag)) continue
    if (!j.isDone) {
      running += 1
      continue
    }
    out = out.replace(j.tag, j.answer || `[${j.query}]`)
    await forget($, Number(id))
  }
  return { text: out, running }
}

// A prompt sent while answers ran is held; the last answer sends it.
async function sendHeld($: EngineInterface): Promise<void> {
  const draft = await read($, held)
  if (!draft) return
  const r = await fillDone($, draft)
  if (r.running) return
  await update($, held, () => '')
  const box = await $.prompt.read()
  if (box.text === draft) await $.prompt.fill({ text: '', mode: 'replace' })
  await $.prompt.submit({ text: r.text, asUser: true })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('preset')
    if (typeof saved === 'string' && parseCode(saved)) await update($, preset, () => saved)
    await loadDelims($, options?.open, options?.close)
    await $.command.register({
      name: 'tangent',
      description: 'Show or set the default model+level for || inline questions || (e.g. /tangent hm)',
    })
    return next(e)
  })

  on('command.run', { command: 'tangent' }, async ($, e) => setPreset($, e.args))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const disabled = await read($, off)
    const mine = await read($, custom)
    const fromOptions = await read($, extra)
    const note = await read($, notice)

    const fg = { color: THEME.fg, backgroundColor: THEME.bg }

    return (
      <Box flexDirection="column" paddingX={1} backgroundColor={THEME.bg}>
        <Text color={THEME.dim} backgroundColor={THEME.bg}>
          Type || question || (a space after the closing mark asks). Tab or arrows move, Enter presses.
        </Text>
        {DEFAULT_DELIMS.map(([o, c]) => (
          <Box flexDirection="row" backgroundColor={THEME.bg}>
            <Text {...fg}>{`${o} question ${c}  `}</Text>
            <Button
              key={`toggle:${o}`}
              onPress={() => {
                void say($, toggleBuiltin($, o))
              }}
            >
              <Text {...fg}>{disabled.includes(o) ? 'off' : 'on'}</Text>
            </Button>
          </Box>
        ))}
        {mine.map(([o, c]) => (
          <Box flexDirection="row" backgroundColor={THEME.bg}>
            <Text {...fg}>{`${o} question ${c}  `}</Text>
            <Button
              key={`remove:${o}`}
              onPress={() => {
                void say($, removePair($, o))
              }}
            >
              <Text {...fg}>remove</Text>
            </Button>
          </Box>
        ))}
        {fromOptions.map(([o, c]) => (
          <Text color={THEME.dim} backgroundColor={THEME.bg}>{`${o} question ${c}  (from plugin options)`}</Text>
        ))}
        <Input
          key="add"
          placeholder="add a pair: open [close], e.g. ;;; or >>> <<<"
          submitLabel="add"
          autoFocus
          value=""
          onSubmit={(value: string) => {
            void addFromInput($, value)
          }}
        />
        {note !== '' && <Text color={THEME.error} backgroundColor={THEME.bg}>{note}</Text>}
        <Button
          key="done"
          onPress={() => {
            void $.ui.close({ id: PANE })
          }}
        >
          <Text {...fg}>done</Text>
        </Button>
      </Box>
    )
  })

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    if (e.inputText !== ' ') return r
    const end = r.cursor - 1
    const found = findQuery(r.text, end, await active($))
    if (!found) return r
    const label = await start($, r.text, found, end + 1)
    const text = r.text.slice(0, found.start) + label + ' ' + r.text.slice(end + 1)
    return { text, cursor: found.start + label.length + 1 }
  })

  // The main thread waits for answers still running when the prompt is sent.
  on('prompt.submit', async ($, e, next) => {
    if (!e.text.includes('⟦')) return next(e)
    const r = await fillDone($, e.text)
    if (!r.running) return next({ ...e, text: r.text })
    await update($, held, () => r.text)
    return { drop: `tangent: waiting for ${r.running} answer(s), sends when done` }
  }).catch(($, e, next) => next(e))
}
