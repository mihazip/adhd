export type Exchange = { q: string; a: string; synopsis: string }

declare module 'claude-code' {
  interface PluginState {
    adhd: {
      log: Exchange[]
      isBusy: boolean
      isAuto: boolean
      effort: string
      notice: string
    }
  }
}
