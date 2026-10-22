import { expect, test } from 'claude-code/testing'

import { SYSTEM, buildPrompt, findQuery, parseCode, parseDelims, activePairs, tag } from '../hooks/register'

const B = '\\'.repeat(3)

test('codes map to model and level', () => {
  expect(parseCode('hm')).toEqual({ model: 'haiku', effort: 'medium' })
  expect(parseCode('sh')).toEqual({ model: 'sonnet', effort: 'high' })
  expect(parseCode('fl')).toEqual({ model: 'fable', effort: 'low' })
  expect(parseCode('ox')).toEqual({ model: 'opus', effort: 'xhigh' })
  expect(parseCode('hxx')).toEqual({ model: 'haiku', effort: 'max' })
  expect(parseCode('s')).toEqual({ model: 'sonnet', effort: 'high' })
  expect(parseCode('zz')).toBeUndefined()
})

test('finds a closed backslash query before the typed space', () => {
  const text = `The capital is ${B}capital of Slovenia${B} `
  expect(findQuery(text, text.length - 1)).toEqual({ start: 15, query: 'capital of Slovenia', code: '' })
})

test('slash form and trailing code', () => {
  const text = 'so ///best sort for nearly sorted data///sm '
  expect(findQuery(text, text.length - 1)).toEqual({ start: 3, query: 'best sort for nearly sorted data', code: 'sm' })
})

test('leading code inside the stripes', () => {
  const text = `${B}fl why is the sky blue${B} `
  expect(findQuery(text, text.length - 1)?.code).toBe('fl')
  expect(findQuery(text, text.length - 1)?.query).toBe('why is the sky blue')
})

test('ignores an opener alone, mixed marks, URLs and bad codes', () => {
  for (const text of [`start ${B}hm `, `${B}q/// `, 'see https://x.com/a ', `${B}q${B}zz `]) {
    expect(findQuery(text, text.length - 1)).toBeUndefined()
  }
})

test('|| is the primary delimiter and needs two words', () => {
  const ok = 'so || what is the capital of France || '
  expect(findQuery(ok, ok.length - 1)).toEqual({ start: 3, query: 'what is the capital of France', code: '' })
  const coded = 'so || what is 2+2 ||sm '
  expect(findQuery(coded, coded.length - 1)?.code).toBe('sm')
  // logical OR in code must not fire
  for (const text of ['x || y || ', 'if (a || b || ', 'a ||b|| ']) {
    expect(findQuery(text, text.length - 1)).toBeUndefined()
  }
  // aliases and a one-word query still fire
  const alias = `${B}capital${B} `
  expect(findQuery(alias, alias.length - 1)?.query).toBe('capital')
})

test('no query opens inside an unclosed backtick span or fence', () => {
  for (const text of [
    'use `a || what is the capital of France || ',
    '```js\nlet z = 1 || what is the capital of France || ',
    'try `x ///what is the capital of France/// ',
  ]) {
    expect(findQuery(text, text.length - 1)).toBeUndefined()
  }
  // a closed span or fence before the opener is fine
  const closed = 'use `x` then || what is the capital of France || '
  expect(findQuery(closed, closed.length - 1)?.query).toBe('what is the capital of France')
  const fenced = '```\ncode\n```\n|| what is the capital of France || '
  expect(findQuery(fenced, fenced.length - 1)?.query).toBe('what is the capital of France')
})

test('prompt asks for an answer, not a continuation', () => {
  const p = buildPrompt({ before: 'how does it work, ', query: 'how many tokens?', after: ' thanks' })
  expect(p).toContain('<spot>\nhow many tokens?\n</spot>')
  expect(p).toContain('<draft_before>\nhow does it work, \n</draft_before>')
  expect(p).toContain('answer')
  expect(SYSTEM).toContain('ANSWER')
  expect(SYSTEM).toContain('prefer answering')
})

test('custom delimiters, same or paired, with regex specials', () => {
  const same = 'a ;;;why is it so;;; '
  expect(findQuery(same, same.length - 1, [[';;;', ';;;']])).toEqual({ start: 2, query: 'why is it so', code: '' })
  const pair = 'a [[what is 2+2]]h '
  expect(findQuery(pair, pair.length - 1, [['[[', ']]']])).toEqual({ start: 2, query: 'what is 2+2', code: 'h' })
  const arrows = 'x >>>q r<<< '
  expect(findQuery(arrows, arrows.length - 1, [['>>>', '<<<']])?.query).toBe('q r')
  // defaults still match next to a custom pair
  const old = `${B}q${B} `
  expect(findQuery(old, old.length - 1, activePairs([], [], [[';;;', ';;;']]))?.query).toBe('q')
  const sl = 'a ///q/// '
  expect(findQuery(sl, sl.length - 1, activePairs([], [], [[';;;', ';;;']]))?.query).toBe('q')
  expect(findQuery(same, same.length - 1, activePairs([], [], [[';;;', ';;;']]))?.query).toBe('why is it so')
  // without defaults in the list, they do not match
  expect(findQuery(old, old.length - 1, [[';;;', ';;;']])).toBeUndefined()
  expect(findQuery('a .*.q r.*. ', 11, [['.*.', '.*.']])?.query).toBe('q r')
})

test('delimiter validation', () => {
  expect(parseDelims([';;;', ';;;'])).toEqual([[';;;', ';;;']])
  expect(parseDelims(['>>>', '<<<'])).toEqual([['>>>', '<<<']])
  expect(parseDelims([';', ';'])).toBeUndefined()
  expect(parseDelims(['ab;', 'ab;'])).toBeUndefined()
  expect(parseDelims([';; ', ';;;'])).toBeUndefined()
  expect(parseDelims(['   ', '   '])).toBeUndefined()
  expect(parseDelims('nope')).toBeUndefined()
})

function fakeStore($: any, on: any, initial: Record<string, unknown> = {}) {
  const saved = new Map<string, unknown>(Object.entries(initial))
  on('store.set', (_$: unknown, e: any) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.get', (_$: unknown, e: any) => ({ value: saved.get(e.key) }))
  on('store.delete', (_$: unknown, e: any) => {
    saved.delete(e.key)
    return { value: undefined }
  })
  return saved
}

test('/tangent delims adds, removes, switches and resets', async ($, on) => {
  const run = async (args: string) => (await $.command.run({ command: 'tangent', args } as never)).text
  const saved = fakeStore($, on)
  expect(await run('delims add ;;;')).toContain('/// question ///  or  ;;; question ;;;')
  expect(await run('delims add >>> <<<')).toContain('>>> question <<<')
  expect(saved.get('pairs')).toEqual([
    [';;;', ';;;'],
    ['>>>', '<<<'],
  ])
  const shown = await run('')
  expect(shown).toContain('>>> question <<<')
  expect(shown).toContain(';;; question ;;;')
  expect(shown).toContain('|| question ||')
  expect(await run('delims add a')).toContain('2+ characters')
  expect(await run('delims add ||')).toContain('built in')
  expect(await run('delims remove ;;;')).not.toContain(';;; question')
  expect(await run('delims remove nope')).toContain('No custom pair')
  expect(saved.get('pairs')).toEqual([['>>>', '<<<']])
  // built-ins switch off, persisted
  expect(await run('delims off ||')).not.toContain('|| question ||')
  expect(saved.get('off')).toEqual(['||'])
  expect(await run('delims on ||')).toContain('|| question ||')
  expect(saved.has('off')).toBe(false)
  expect(await run('delims bogus')).toContain('Usage')
  expect(await run('delims reset')).toContain('removed')
  expect(saved.has('pairs')).toBe(false)
  expect(await run('')).toContain('/// question ///')
})

test('at least one pair stays enabled', async ($, on) => {
  const run = async (args: string) => (await $.command.run({ command: 'tangent', args } as never)).text
  const saved = fakeStore($, on)
  await run('delims off ||')
  await run('delims off ///')
  expect(await run('delims off \\\\\\')).toContain('At least one pair')
  expect(saved.get('off')).toEqual(['||', '///'])
  // a custom pair counts as enabled
  await run('delims add ;;;')
  expect(await run('delims off \\\\\\')).toContain('is off')
})

test('active pairs follow switches, custom pairs and the options pair', () => {
  expect(activePairs()).toEqual([
    ['||', '||'],
    [B, B],
    ['///', '///'],
  ])
  expect(activePairs([[';;;', ';;;']], ['||'], [['[[', ']]']])).toEqual([
    [B, B],
    ['///', '///'],
    [';;;', ';;;'],
    ['[[', ']]'],
  ])
  // a duplicate opener is kept once
  expect(activePairs([[';;;', ';;;']], [], [[';;;', ';;;']])).toHaveLength(4)
})

test('session start moves the old single pair into the list once', async ($, on) => {
  const saved = fakeStore($, on, { delims: [';;;', ';;;'], pairs: [['>>>', '<<<']] })
  on('command.register', () => ({ value: { command: 'tangent' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(saved.has('delims')).toBe(false)
  expect(saved.get('pairs')).toEqual([
    ['>>>', '<<<'],
    [';;;', ';;;'],
  ])
})

const PICKER = {
  plugin: 'tangent',
  component: 'Pane',
  requestId: 'tangent-delims',
  props: {
    title: 'tangent delimiters',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 14 },
    view: {},
  },
} as const

test('/tangent delims with no args opens the picker pane', async ($, on) => {
  fakeStore($, on)
  const opened: unknown[] = []
  on('ui.open', (_$, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  const r = await $.command.run({ command: 'tangent', args: 'delims' } as never)
  expect(r.text).toContain('pane opened')
  expect(opened[0]).toMatchObject({ id: 'tangent-delims', title: 'tangent delimiters', focus: true })
  expect(opened[0]).not.toHaveProperty('closeOnEscape')
})

test('the picker toggles built-ins, adds and removes pairs, and closes', async ($, on) => {
  const saved = fakeStore($, on)
  const closed: unknown[] = []
  on('ui.close', (_$, e) => {
    closed.push(e)
    return { value: undefined }
  })
  const ui = await $.ui.mount({ ...PICKER, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /\|\| question \|\|/ })).toBeDefined()

  await ui.press({ key: 'toggle:||' })
  expect(saved.get('off')).toEqual(['||'])
  await ui.input({ key: 'add', text: ';;; ;;;' })
  expect(saved.get('pairs')).toEqual([[';;;', ';;;']])
  await ui.input({ key: 'add', text: 'a' })
  expect((await ui.find({ type: 'Text', text: /2\+ characters/ }))?.text).toContain('2+ characters')
  await ui.press({ key: 'remove:;;;' })
  expect(saved.has('pairs')).toBe(false)

  await ui.press({ key: 'done' })
  expect(closed[0]).toMatchObject({ id: 'tangent-delims' })
  await ui.unmount()
})

test('tag is short and numbered', () => {
  expect(tag(3, 'a very long question about many many things')).toBe('⟦3 a very long question ab…⟧')
})

test('/tangent sets and shows the default', async ($, on) => {
  const run = async (args: string) => (await $.command.run({ command: 'tangent', args } as never)).text
  const saved = new Map<string, unknown>()
  on('store.set', (_$, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.get', (_$, e) => ({ value: saved.get(e.key) }))
  expect((await run('sm'))).toContain('sonnet medium')
  expect(saved.get('preset')).toBe('sm')
  expect((await run(''))).toContain('sonnet medium')
  expect((await run('qq'))).toContain('model letter')
  expect((await run('qq'))).toContain('/tangent delims')
})

test('/tangent delim, delims, delimiter and delimiters are the same subcommand', async ($, on) => {
  const run = async (args: string) => (await $.command.run({ command: 'tangent', args } as never)).text
  fakeStore($, on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  for (const word of ['delim', 'delims', 'delimiter', 'delimiters', 'Delimiters']) {
    expect(await run(word)).toContain('pane opened')
    expect(await run(`${word} bogus`)).toContain('Usage')
  }
  expect(await run('delimiter add ;;;')).toContain(';;; question ;;;')
  expect(await run('delim remove ;;;')).toContain('Removed')
  expect(await run('delimsx')).toContain('model letter')
})

test('a prompt with no tags passes untouched', async ($, on) => {
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  expect(await $.prompt.submit({ text: 'plain ///x' } as never)).toMatchObject({ text: 'plain ///x' })
})
