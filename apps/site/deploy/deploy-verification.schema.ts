import * as S from 'effect/Schema'

export const ApiLogLine = S.Struct({
  method: S.String,
  path: S.String,
  status: S.Finite,
})
export type ApiLogLine = S.Schema.Type<typeof ApiLogLine>

export const ApiLogLineJson = S.fromJsonString(ApiLogLine)

export const WorkerIssues = S.Struct({ enabled: S.Boolean })
export type WorkerIssues = S.Schema.Type<typeof WorkerIssues>

export const WorkerObservability = S.Struct({
  issues: S.optional(WorkerIssues),
})
export type WorkerObservability = S.Schema.Type<typeof WorkerObservability>
