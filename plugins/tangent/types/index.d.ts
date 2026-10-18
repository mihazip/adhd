export type Job = {
  tag: string
  query: string
  model: string
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  before: string
  after: string
  answer: string
  failure: string
  isDone: boolean
}

declare module 'claude-code' {
  interface PluginState {
    tangent: {
      nextId: number
      jobs: Record<string, Job>
      preset: string
      held: string
    }
  }
}
