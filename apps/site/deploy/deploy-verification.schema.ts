import * as S from 'effect/Schema'

export const WorkerIssues = S.Struct({ enabled: S.Boolean })
export type WorkerIssues = S.Schema.Type<typeof WorkerIssues>

export const WorkerObservability = S.Struct({
  issues: S.optional(WorkerIssues),
})
export type WorkerObservability = S.Schema.Type<typeof WorkerObservability>
