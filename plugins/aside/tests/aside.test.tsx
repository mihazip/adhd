import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'aside',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, bodyColumns: 80 },
} as const

test('the band keeps what is below and adds the aside button', async ($, on) => {
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine weather</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /engine weather/ }))?.text).toBe('engine weather')
  expect(await ui.find({ type: 'Button', key: 'open' })).toBeTruthy()
  await ui.unmount()
})

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
