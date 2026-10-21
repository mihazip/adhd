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
