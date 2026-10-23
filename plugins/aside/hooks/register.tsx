import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Exchange } from '../types'

const PANE = 'aside'
// Empty start screen: bird 6 + intro 1 + spacer 1 + input 1 + spacer 1 + more 1, with room for the opened options.
const PANE_ROWS = 14
const MODELS = ['haiku', 'sonnet', 'opus', 'fable'] as const
const DEFAULT_MODEL = 'haiku'
// The synopsis call is bookkeeping, so it stays cheap whatever model answers the questions.
const SYNOPSIS_MODEL = 'haiku'
const SYSTEM =
  'You are a fast side-answer helper for a developer with scattered, casual questions. ' +
  'Always give a direct best-effort answer; never ask for clarification unless the question is truly unanswerable. ' +
  'Treat follow-ups ("all of them", "more") as continuing the previous exchange. ' +
  'Long lists are fine when asked: give them in full, compactly. Plain text or short markdown, no preamble, no filler.'
// Windows Terminal 'Ubuntu' scheme; change here for another palette.
const THEME = {
  bg: '#300A24',
  fg: '#EEEEEC',
  dim: '#D0CFCC',
  accent: '#E9AD0C',
  info: '#33C7DE',
  select: '#4E1E3F',
} as const
// Every Text carries explicit colors, so a focused element (drawn as the inverse of its label) stays readable.
const TEXT = { color: THEME.fg, backgroundColor: THEME.bg } as const
const HINT = { color: THEME.dim, backgroundColor: THEME.bg } as const
const LEVELS = ['low', 'medium', 'high'] as const

// Hummingbird in braille, 6 rows x 20 columns per frame.
const FRAMES = {
  up: [
    '         ⣾⣿⡇        ',
    '         ⣿⣿⠁        ',
    '     ⣰⣚⣷⣶⣿⡃         ',
    '⠉⠉⠉⠉⠉⠙⠻⢿⣿⣿⣿⣦        ',
    '       ⠈⠻⣿⣿⣿⡇       ',
    '         ⠈⠙⣿⣧⡀      ',
  ],
  mid: [
    '             ⣠⣤⣶    ',
    '          ⢀⣴⣿⣿⠟⠁    ',
    '     ⣰⣚⣷⣶⣴⡿⠟⠋⠁      ',
    '⠉⠉⠉⠉⠉⠙⠻⢿⣿⣿⣿⣦        ',
    '       ⠈⠻⣿⣿⣿⡇       ',
    '         ⠈⠙⣿⣧⡀      ',
  ],
  down: [
    '                    ',
    '                    ',
    '     ⣰⣚⣷⣶⣤⣴⣶⣶⣶⣤⣄⡀   ',
    '⠉⠉⠉⠉⠉⠙⠻⢿⣿⣿⣿⣿⠛⠛⠛⠛⠁   ',
    '       ⠈⠻⣿⣿⣿⡇       ',
    '         ⠈⠙⣿⣧⡀      ',
  ],
  rest: [
    '                    ',
    '           ⢀⣠⣤⣤⡄    ',
    '     ⣰⣚⣷⣶⣤⣾⣿⠿⠟⠋     ',
    '⠉⠉⠉⠉⠉⠙⠻⢿⣿⣿⣿⣦        ',
    '       ⠈⠻⣿⣿⣿⡇       ',
    '         ⠈⠙⣿⣧⡀      ',
  ],
} as const
// Colour of one cell of a frame, by region (the same for every frame); unpainted cells stay dim.
function birdColor(row: number, col: number): string {
  if (row <= 1 || (row === 2 && col >= 10) || (row === 3 && col >= 12)) return THEME.bird.wing
  if (row === 2 && col >= 5) return THEME.bird.head
  if (row === 3 && col <= 4) return THEME.bird.beak
  if (row === 3 && col <= 7) return THEME.bird.throat
  if (row === 4 && col >= 7 && col <= 8) return THEME.bird.throat
  if (row === 3 || (row === 4 && col >= 9 && col <= 12)) return THEME.bird.body
  if (row === 5) return THEME.bird.tail
  return THEME.dim
}

// One frame row as runs of equally coloured cells.
function birdRuns(row: number, text: string): { color: string; text: string }[] {
  const runs: { color: string; text: string }[] = []
  Array.from(text).forEach((ch, col) => {
    const color = ch === ' ' ? THEME.bg : birdColor(row, col)
    const last = runs[runs.length - 1]
    if (last && last.color === color) last.text += ch
    else runs.push({ color, text: ch })
  })
  return runs
}

const FLUTTER = [FRAMES.up, FRAMES.mid, FRAMES.down, FRAMES.mid] as const
const FLUTTER_MS = 1500
const BEAT_MS = 60
const BIRD_ROWS = 6
const BIRD_MIN_BODY = BIRD_ROWS + 4

const log = atom({ plugin: 'aside', key: 'log' } as const, [])
const isBusy = atom({ plugin: 'aside', key: 'isBusy' } as const, false)
const isAuto = atom({ plugin: 'aside', key: 'isAuto' } as const, false)
const effort = atom({ plugin: 'aside', key: 'effort' } as const, 'medium')
const model = atom({ plugin: 'aside', key: 'model' } as const, DEFAULT_MODEL)
const notice = atom({ plugin: 'aside', key: 'notice' } as const, '')
// -1 = resting, otherwise an index into FLUTTER; a timer drives it while the bird flutters.
const wing = atom({ plugin: 'aside', key: 'wing' } as const, -1)
// The unsent text in the input, so it survives closing and reopening the pane.
const draft = atom({ plugin: 'aside', key: 'draft' } as const, '')
const isMore = atom({ plugin: 'aside', key: 'isMore' } as const, false)
// The breakout game fills the top two thirds of a tall pane; off by default.
const isGame = atom({ plugin: 'aside', key: 'isGame' } as const, false)
const GAME_MIN_BODY = 20

// "more" and "less" share one key, so the focus ring stays where the person pressed.
async function setMore($: EngineInterface, on: boolean): Promise<void> {
  await update($, isMore, () => on)
  await $.ui.focus({ requestId: PANE, key: 'toggle' })
}

// Wing beats for FLUTTER_MS, then back to rest.
function flutter($: EngineInterface): void {
  const beat = $.clock.every(BEAT_MS, () => {
    void update($, wing, w => (w + 1) % FLUTTER.length)
  })
  $.clock.after(FLUTTER_MS, () => {
    beat.cancel()
    void update($, wing, () => -1)
  })
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

// Opening an id that is already open only retitles it.
async function openPane($: EngineInterface, focus: boolean): Promise<void> {
  const name = await read($, model)
  await $.ui.open({ id: PANE, title: `aside (${name})`, focus, rows: PANE_ROWS })
}

// Never stacks a second pane.
async function showPane($: EngineInterface): Promise<void> {
  if (await isPaneOpen($)) return
  await openPane($, true)
  flutter($)
  $.ui.invalidate('ui.render')
}

// Keep model and effort across sessions.
async function loadSettings($: EngineInterface): Promise<void> {
  const m = await $.store.get('model')
  const l = await $.store.get('effort')
  if (typeof m === 'string' && (MODELS as readonly string[]).includes(m)) await update($, model, () => m)
  if (typeof l === 'string' && (LEVELS as readonly string[]).includes(l)) await update($, effort, () => l)
}

async function nextModel($: EngineInterface): Promise<void> {
  const cur = await read($, model)
  const name = MODELS[(MODELS.indexOf(cur as (typeof MODELS)[number]) + 1) % MODELS.length]
  await update($, model, () => name)
  await $.store.set('model', name)
  if (await isPaneOpen($)) await openPane($, false)
}

async function nextEffort($: EngineInterface): Promise<void> {
  const cur = await read($, effort)
  const next = LEVELS[(LEVELS.indexOf(cur as (typeof LEVELS)[number]) + 1) % LEVELS.length]
  await update($, effort, () => next)
  await $.store.set('effort', next)
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
  const name = await read($, model)
  const r = await $.model.complete({
    model: name,
    system: SYSTEM,
    prompt: past ? `Earlier in this side chat:\n${past}\n\nNew question: ${text}` : text,
    maxTokens: 4000,
    effort: level,
    timeoutMs: 90000,
  })

  if (!r.isAnswered) {
    await update($, notice, () => `${name} failed: ${r.reason}`)
    await update($, isBusy, () => false)
    return
  }

  // A short answer is its own synopsis; a long one gets squeezed.
  let synopsis = r.text.trim()
  if (synopsis.length > 400) {
    const s = await $.model.complete({
      model: SYNOPSIS_MODEL,
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
    await loadSettings($)
    await $.command.register({
      name: 'aside',
      description: 'Side pane: quick questions to a side model, outside the main session',
    })

    return next(e)
  })

  on('command.run', { command: 'aside' }, async $ => {
    await showPane($)

    return { text: 'aside pane opened. Type a question, Enter to ask.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Markdown, Client } = $.ui.resolve(e)
    const items = await read($, log)
    const busy = await read($, isBusy)
    const auto = await read($, isAuto)
    const lvl = await read($, effort)
    const name = await read($, model)
    const note = await read($, notice)
    const more = await read($, isMore)
    const typed = await read($, draft)
    const game = await read($, isGame)
    const lastItem = items[items.length - 1]
    const w = await read($, wing)
    const bird = FLUTTER[w] ?? FRAMES.rest
    const body = e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 24
    const gameRows = game && body >= GAME_MIN_BODY ? Math.floor((body * 2) / 3) : 0
    const room = Math.max(1, Math.floor((body - gameRows - 8) / 3))
    const showBird = items.length === 0 && gameRows === 0 && body >= BIRD_MIN_BODY

    return (
      <Box
        flexDirection="column"
        paddingX={1}
        width={e.props.bodyColumns}
        minHeight={body}
        backgroundColor={THEME.bg}
      >
        {gameRows > 0 && <Client key="breakout" module="./breakout.tsx" height={gameRows} />}
        {showBird && (
          <Box flexDirection="column">
            {bird.map(row => (
              <Text {...HINT}>{row}</Text>
            ))}
          </Box>
        )}
        {items.length === 0 && <Text {...HINT}>Ask anything. Enter asks {name}, main session untouched.</Text>}
        {items.slice(-room).map(it => (
          <Box flexDirection="column">
            <Text bold color={THEME.accent} backgroundColor={THEME.bg}>
              ? {it.q}
            </Text>
            <Markdown text={it.a} />
          </Box>
        ))}
        {busy && <Text color={THEME.accent} backgroundColor={THEME.bg}>
            {name} is thinking...
          </Text>}
        {note !== '' && <Text color={THEME.info} backgroundColor={THEME.bg}>
            {note}
          </Text>}
        <Text {...TEXT}> </Text>
        <Input
          key="q"
          placeholder="question"
          submitLabel="ask"
          autoFocus
          value={typed}
          onInput={(value: string) => {
            void update($, draft, () => value)
          }}
          onSubmit={(value: string) => {
            void update($, draft, () => '')
            void ask($, value)
          }}
        />
        <Text {...TEXT}> </Text>
        <Box flexDirection="column">
          {lastItem && (
            <Button plain
              key="return"
              label="Return synopsis to prompt"
              onPress={() => {
                void giveBack($, lastItem)
              }}
            >
              <Text {...TEXT}>Return synopsis to prompt</Text>
            </Button>
          )}
          <Button plain key="toggle" label={more ? 'less' : 'more'} onPress={() => setMore($, !more)}>
            <Text {...TEXT}>{more ? 'less' : 'more'}</Text>
          </Button>
          {more && (
            <Button plain key="model" label={`Model: ‹ ${name} ›`} onPress={() => nextModel($)}>
              <Text {...TEXT}>{`Model: ‹ ${name} ›`}</Text>
            </Button>
          )}
          {more && (
            <Button plain key="effort" label={`Effort: ‹ ${lvl} ›`} onPress={() => nextEffort($)}>
              <Text {...TEXT}>{`Effort: ‹ ${lvl} ›`}</Text>
            </Button>
          )}
          {more && (
            <Button plain
              key="auto"
              label={auto ? 'Auto-return: on' : 'Auto-return: off'}
              onPress={() => update($, isAuto, v => !v)}
            >
              <Text {...TEXT}>{auto ? 'Auto-return: on' : 'Auto-return: off'}</Text>
            </Button>
          )}
          {more && (
            <Button plain key="clear" label="Clear" onPress={() => update($, log, () => [])}>
              <Text {...TEXT}>Clear</Text>
            </Button>
          )}
          {more && (
            <Button plain key="game" label={game ? 'Game: on' : 'Game: off'} onPress={() => update($, isGame, v => !v)}>
              <Text {...TEXT}>{game ? 'Game: on' : 'Game: off'}</Text>
            </Button>
          )}
          <Button plain key="close" label="Close" onPress={() => $.ui.close({ id: PANE })}>
            <Text {...TEXT}>Close</Text>
          </Button>
        </Box>
      </Box>
    )
  })
}
