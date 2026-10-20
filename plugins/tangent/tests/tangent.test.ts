import { expect, test } from 'claude-code/testing'

import { SYSTEM, buildPrompt, findQuery, parseCode, tag } from '../hooks/register'

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

test('prompt asks for an answer, not a continuation', () => {
  const p = buildPrompt({ before: 'how does it work, ', query: 'how many tokens?', after: ' thanks' })
  expect(p).toContain('<spot>\nhow many tokens?\n</spot>')
  expect(p).toContain('<draft_before>\nhow does it work, \n</draft_before>')
  expect(p).toContain('answer')
  expect(SYSTEM).toContain('ANSWER')
  expect(SYSTEM).toContain('prefer answering')
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
