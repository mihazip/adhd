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
const delims = atom({ plugin: 'tangent', key: 'delims' } as const, DEFAULT_DELIMS)

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

// The defaults always work; a custom pair is added after them.
export function withCustom(custom: Delims | undefined): Delims {
  return custom ? [...DEFAULT_DELIMS, ...custom] : DEFAULT_DELIMS
}

function showDelims(pairs: Delims): string {
  return pairs.map(([o, c]) => `${o} question ${c}`).join('  or  ')
}

async function setDelims($: EngineInterface, args: string): Promise<{ text: string }> {
  const [first, second, ...extra] = args.trim().split(/\s+/).filter(Boolean)
  if (first === 'reset' && !second) {
    await $.store.delete('delims')
    await update($, delims, () => DEFAULT_DELIMS)
    return { text: `tangent custom delimiters removed. Active: ${showDelims(DEFAULT_DELIMS)}` }
  }
  const pair = first && !extra.length ? parseDelims([first, second ?? first]) : undefined
  if (!pair) {
    return {
      text: 'Usage: /tangent delims <open> [close] or /tangent delims reset. Each is 2+ characters, no letters or spaces, e.g. ;;; or >>> <<<.',
    }
  }
  const all = withCustom(pair)
  await update($, delims, () => all)
  await $.store.set('delims', pair[0])
  return { text: `tangent delimiters are now ${showDelims(all)}` }
}

async function setPreset($: EngineInterface, args: string): Promise<{ text: string }> {
  const code = args.trim().toLowerCase()
  if (/^delims(\s|$)/.test(code)) return setDelims($, args.trim().slice('delims'.length))
  if (!code) {
    const p = parseCode(await read($, preset))!
    return {
      text:
        `tangent default: ${p.model} ${p.effort}. Set with /tangent <code>, e.g. /tangent sm.\n` +
        `Delimiters: ${showDelims(await read($, delims))}. Change with /tangent delims <open> [close] or /tangent delims reset (removes only the custom pair).`,
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
    // One extra pair on top of the defaults: /tangent delims (store) beats the plugin options.
    const opened = options?.open
    const closed = options?.close
    const fromOptions = typeof opened === 'string' && opened ? parseDelims([opened, closed || opened]) : undefined
    const chosen = parseDelims(await $.store.get('delims')) ?? fromOptions
    if (chosen) await update($, delims, () => withCustom(chosen))
    await $.command.register({
      name: 'tangent',
      description: 'Show or set the default model+level for || inline questions || (e.g. /tangent hm)',
    })
    return next(e)
  })

  on('command.run', { command: 'tangent' }, async ($, e) => setPreset($, e.args))

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    if (e.inputText !== ' ') return r
    const end = r.cursor - 1
    const found = findQuery(r.text, end, await read($, delims))
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
