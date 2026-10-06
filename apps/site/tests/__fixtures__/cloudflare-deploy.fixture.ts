import { Schema } from 'effect'

export const ApiLogLine = Schema.Struct({
  method: Schema.String,
  path: Schema.String,
  status: Schema.Finite,
})
export type ApiLogLine = Schema.Schema.Type<typeof ApiLogLine>

export const ApiLogLineJson = Schema.fromJsonString(ApiLogLine)

export const PatchObservability = Schema.Struct({
  observability: Schema.Struct({
    issues: Schema.Struct({ enabled: Schema.Boolean }),
  }),
})
export type PatchObservability = Schema.Schema.Type<typeof PatchObservability>

export const PatchObservabilityJson = Schema.fromJsonString(PatchObservability)
