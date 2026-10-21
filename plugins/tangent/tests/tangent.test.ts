import { expect, test } from 'claude-code/testing'

import { SYSTEM, buildPrompt, findQuery, parseCode, parseDelims, withCustom, tag } from '../hooks/register'

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
  expect(findQuery(old, old.length - 1, withCustom([[';;;', ';;;']]))?.query).toBe('q')
  const sl = 'a ///q/// '
  expect(findQuery(sl, sl.length - 1, withCustom([[';;;', ';;;']]))?.query).toBe('q')
  expect(findQuery(same, same.length - 1, withCustom([[';;;', ';;;']]))?.query).toBe('why is it so')
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

test('/tangent delims sets, shows and resets', async ($, on) => {
  const run = async (args: string) => (await $.command.run({ command: 'tangent', args } as never)).text
  const saved = new Map<string, unknown>()
  on('store.set', (_$, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.get', (_$, e) => ({ value: saved.get(e.key) }))
  on('store.delete', (_$, e) => {
    saved.delete(e.key)
    return { value: undefined }
  })
  expect(await run('delims ;;;')).toContain('/// question ///  or  ;;; question ;;;')
  expect(saved.get('delims')).toEqual([';;;', ';;;'])
  expect(await run('delims >>> <<<')).toContain('>>> question <<<')
  const shown = await run('')
  expect(shown).toContain('>>> question <<<')
  expect(shown).toContain('/// question ///')
  expect(shown).not.toContain(';;; question')
  expect(await run('delims a')).toContain('Usage')
  expect(await run('delims reset')).toContain('removed')
  expect(saved.has('delims')).toBe(false)
  expect(await run('')).toContain('/// question ///')
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
})

test('a prompt with no tags passes untouched', async ($, on) => {
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  expect(await $.prompt.submit({ text: 'plain ///x' } as never)).toMatchObject({ text: 'plain ///x' })
})
