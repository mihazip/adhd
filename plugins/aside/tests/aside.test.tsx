import { expect, test } from 'claude-code/testing'

test('the empty pane shows the bird, the intro and the buttons', async ($, on) => {
  on('ui.panes', () => ({ value: [] }))

  const ui = await $.ui.mount({
    plugin: 'aside',
    component: 'Pane',
    requestId: 'aside',
    surface: 'terminal',
    props: {
      title: 'aside (haiku)',
      isFocused: true,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 14 },
      view: {},
    },
  })

  expect(await ui.find({ type: 'Text', text: /Enter asks haiku/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /⣰⣚⣷/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'return' })).toBeFalsy()
  await ui.unmount()
})
