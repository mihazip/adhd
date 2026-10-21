import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Exchange } from '../types'

const PANE = 'aside'
const PANE_ROWS = 10
const MODEL = 'haiku'
const SYSTEM =
  'You are a fast side-answer helper for a developer with scattered, casual questions. ' +
  'Always give a direct best-effort answer; never ask for clarification unless the question is truly unanswerable. ' +
  'Treat follow-ups ("all of them", "more") as continuing the previous exchange. ' +
  'Long lists are fine when asked: give them in full, compactly. Plain text or short markdown, no preamble, no filler.'
const LEVELS = ['low', 'medium', 'high'] as const

// Claude's orange (hsl 15, 63%, 60%) rotated 165 degrees to teal at the same lightness, so the pane reads as related but distinct.
const THEME = {
  accent: '#59D9D9',
  dim: 'inactive',
  busy: 'warning',
} as const

// Hummingbird, 3 rows of quadrant blocks. Frames 0-2 are wings up, level, down; REST has them folded.
const BIRD = [
  ['  ▟▙       ', ' ▝████▄▄▖─ ', '   ▀▀▀▘    '],
  ['           ', '▗▄████▄▄▖─ ', '   ▀▀▀▘    '],
  ['           ', ' ▝████▄▄▖─ ', '  ▜█▛▘     '],
] as const
const REST = ['           ', '  ▗████▄▄▖─', '    ▀▀▀▘   '] as const
const FLUTTER_MS = 1500
const BEAT_MS = 70
const BIRD_MIN_ROWS = 9

const log = atom({ plugin: 'aside', key: 'log' } as const, [])
const isBusy = atom({ plugin: 'aside', key: 'isBusy' } as const, false)
const isAuto = atom({ plugin: 'aside', key: 'isAuto' } as const, false)
const effort = atom({ plugin: 'aside', key: 'effort' } as const, 'medium')
const notice = atom({ plugin: 'aside', key: 'notice' } as const, '')
// -1 = resting, 0-2 = wing frame; a timer drives it while the bird flutters.
const wing = atom({ plugin: 'aside', key: 'wing' } as const, -1)
const isMore = atom({ plugin: 'aside', key: 'isMore' } as const, false)

// The pressed button vanishes, so hand the ring to the one that takes its place.
async function setMore($: EngineInterface, on: boolean): Promise<void> {
  await update($, isMore, () => on)
  await $.ui.focus({ requestId: PANE, key: on ? 'return' : 'more' })
}

// Wing beats for FLUTTER_MS, then back to rest.
function flutter($: EngineInterface): void {
  const beat = $.clock.every(BEAT_MS, () => {
    void update($, wing, w => (w + 1) % BIRD.length)
  })
  $.clock.after(FLUTTER_MS, () => {
    beat.cancel()
    void update($, wing, () => -1)
  })
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

// Shared by /aside and the band button; never stacks a second pane.
async function openPane($: EngineInterface): Promise<void> {
  if (await isPaneOpen($)) return
  await $.ui.open({ id: PANE, title: 'aside (haiku)', focus: true, closeOnEscape: true, rows: PANE_ROWS })
  flutter($)
  $.ui.invalidate('ui.render')
}

async function ask($: EngineInterface, q: string): Promise<void> {
  const text = q.trim()
  if (!text || (await read($, isBusy))) return

  await update($, isBusy, () => true)
  await update($, notice, () => '')
  const past = (await read($, log))
    .slice(-6)
    .map(x => `Q: ${x.q}\nA: ${x.a}`)
    .join('\n\n')
  const level = (await read($, effort)) as (typeof LEVELS)[number]
  const r = await $.model.complete({
    model: MODEL,
    system: SYSTEM,
    prompt: past ? `Earlier in this side chat:\n${past}\n\nNew question: ${text}` : text,
    maxTokens: 4000,
    effort: level,
    timeoutMs: 90000,
  })

  if (!r.isAnswered) {
    await update($, notice, () => `Haiku failed: ${r.reason}`)
    await update($, isBusy, () => false)
    return
  }

  // A short answer is its own synopsis; a long one gets squeezed.
  let synopsis = r.text.trim()
  if (synopsis.length > 400) {
    const s = await $.model.complete({
      model: MODEL,
      prompt: `Compress to at most 2 short sentences, keep every key fact:\n\n${synopsis}`,
      maxTokens: 200,
      effort: 'low',
      timeoutMs: 20000,
    })
    if (s.isAnswered) synopsis = s.text.trim()
  }
  if (synopsis.length > 300) synopsis = synopsis.slice(0, 297).trimEnd() + '...'

  const item: Exchange = { q: text, a: r.text.trim(), synopsis }
  await update($, log, list => [...list, item].slice(-20))

  if (await read($, isAuto)) await giveBack($, item)
  await update($, isBusy, () => false)
}

async function giveBack($: EngineInterface, item: Exchange): Promise<void> {
  const out = await $.prompt.fill({
    text: `(side note from /aside — Q: ${item.q} A: ${item.synopsis}) `,
    mode: 'append',
  })
  await update($, notice, () =>
    out.isFilled ? 'Synopsis added to your prompt box.' : 'Could not fill the prompt box.',
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'aside',
      description: 'Side pane: ask Haiku quick questions outside the main session',
    })

    return next(e)
  })

  // One dim row above the prompt with a single button; yields to surveys and to an open pane.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await isPaneOpen($))) return next(e)

    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box justifyContent="flex-end">
        <Button key="open" label="aside" onPress={() => openPane($)} />
      </Box>
    )
  })

  on('command.run', { command: 'aside' }, async $ => {
    await openPane($)

    return { text: 'aside pane opened. Type a question, Enter to ask.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Markdown } = $.ui.resolve(e)
    const items = await read($, log)
    const busy = await read($, isBusy)
    const auto = await read($, isAuto)
    const lvl = await read($, effort)
    const note = await read($, notice)
    const more = await read($, isMore)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 8) / 3))
    const lastItem = items[items.length - 1]
    const w = await read($, wing)
    const bird = BIRD[w] ?? REST
    const showBird = (e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 24) >= BIRD_MIN_ROWS

    return (
      <Box flexDirection="column" paddingX={1}>
        {showBird && (
          <Box flexDirection="column">
            {bird.map(row => (
              <Text color={THEME.accent}>{row}</Text>
            ))}
          </Box>
        )}
        {items.length === 0 && <Text color={THEME.dim}>Ask anything. Enter sends to Haiku, main session untouched.</Text>}
        {items.slice(-room).map(it => (
          <Box flexDirection="column">
            <Text bold color={THEME.accent}>? {it.q}</Text>
            <Markdown text={it.a} />
          </Box>
        ))}
        {busy && <Text color={THEME.busy}>Haiku is thinking...</Text>}
        {note !== '' && <Text color={THEME.accent}>{note}</Text>}
        <Text> </Text>
        <Input
          key="q"
          placeholder="question"
          submitLabel="ask"
          autoFocus
          value=""
          onSubmit={(value: string) => {
            void ask($, value)
          }}
        />
        <Text> </Text>
        <Box flexDirection="column">
          {!more && <Button key="more" label="more" onPress={() => setMore($, true)} />}
          {more && (
            <Button
              key="return"
              label="Return synopsis to prompt"
              onPress={() => {
                if (lastItem) void giveBack($, lastItem)
              }}
            />
          )}
          {more && (
            <Button
              key="auto"
              label={auto ? 'Auto-return: on' : 'Auto-return: off'}
              onPress={() => update($, isAuto, v => !v)}
            />
          )}
          {more && (
            <Button
              key="effort"
              label={`Effort: ${lvl}`}
              onPress={() => update($, effort, v => LEVELS[(LEVELS.indexOf(v as (typeof LEVELS)[number]) + 1) % LEVELS.length])}
            />
          )}
          {more && <Button key="clear" label="Clear" onPress={() => update($, log, () => [])} />}
          {more && <Button key="less" label="less" onPress={() => setMore($, false)} />}
        </Box>
      </Box>
    )
  })
}
