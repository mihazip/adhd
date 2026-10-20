export type Exchange = { q: string; a: string; synopsis: string }

declare module 'claude-code' {
  interface PluginState {
    aside: {
      log: Exchange[]
      isBusy: boolean
      isAuto: boolean
      effort: string
      notice: string
      wing: number
      isMore: boolean
    }
  }
}
