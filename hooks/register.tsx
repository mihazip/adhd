import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Exchange } from '../types'

const PANE = 'adhd'
const MODEL = 'haiku'
const SYSTEM =
  'You are a fast side-answer helper for a developer with scattered, casual questions. ' +
  'Always give a direct best-effort answer; never ask for clarification unless the question is truly unanswerable. ' +
  'Treat follow-ups ("all of them", "more") as continuing the previous exchange. ' +
  'Long lists are fine when asked: give them in full, compactly. Plain text or short markdown, no preamble, no filler.'
const LEVELS = ['low', 'medium', 'high'] as const

const log = atom({ plugin: 'adhd', key: 'log' } as const, [])
const isBusy = atom({ plugin: 'adhd', key: 'isBusy' } as const, false)
const isAuto = atom({ plugin: 'adhd', key: 'isAuto' } as const, false)
const effort = atom({ plugin: 'adhd', key: 'effort' } as const, 'medium')
const notice = atom({ plugin: 'adhd', key: 'notice' } as const, '')

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
    text: `(side note from /adhd — Q: ${item.q} A: ${item.synopsis}) `,
    mode: 'append',
  })
  await update($, notice, () =>
    out.isFilled ? 'Synopsis added to your prompt box.' : 'Could not fill the prompt box.',
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'adhd',
      description: 'Side pane: ask Haiku quick questions outside the main session',
    })

    return next(e)
  })

  on('command.run', { command: 'adhd' }, async $ => {
    await $.ui.open({ id: PANE, title: 'adhd (haiku)', focus: true })

    return { text: 'adhd pane opened. Type a question, Enter to ask.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Markdown } = $.ui.resolve(e)
    const items = await read($, log)
    const busy = await read($, isBusy)
    const auto = await read($, isAuto)
    const lvl = await read($, effort)
    const note = await read($, notice)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 8) / 3))
    const lastItem = items[items.length - 1]

    return (
      <Box flexDirection="column" backgroundColor="#06303A" height={e.viewport?.rows} paddingX={1}>
        {items.length === 0 && <Text color="#AEA79F">Ask anything. Enter sends to Haiku, main session untouched.</Text>}
        {items.slice(-room).map(it => (
          <Box flexDirection="column">
            <Text bold color="#E95420">? {it.q}</Text>
            <Markdown text={it.a} />
          </Box>
        ))}
        {busy && <Text color="#E9AD0C">Haiku is thinking...</Text>}
        {note !== '' && <Text color="#33C7DE">{note}</Text>}
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
          <Button
            key="return"
            label="Return synopsis to prompt"
            onPress={() => {
              if (lastItem) void giveBack($, lastItem)
            }}
          />
          <Button
            key="auto"
            label={auto ? 'Auto-return: on' : 'Auto-return: off'}
            onPress={() => update($, isAuto, v => !v)}
          />
          <Button
            key="effort"
            label={`Effort: ${lvl}`}
            onPress={() => update($, effort, v => LEVELS[(LEVELS.indexOf(v as (typeof LEVELS)[number]) + 1) % LEVELS.length])}
          />
          <Button key="clear" label="Clear" onPress={() => update($, log, () => [])} />
        </Box>
      </Box>
    )
  })
}
