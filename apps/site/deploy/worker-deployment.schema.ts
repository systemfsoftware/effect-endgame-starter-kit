import * as S from 'effect/Schema'

export const WorkerVersionId = S.String.pipe(S.check(S.isUUID()), S.brand('WorkerVersionId'))
export type WorkerVersionId = S.Schema.Type<typeof WorkerVersionId>

export const WorkerName = S.String.pipe(S.check(S.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)), S.brand('WorkerName'))
export type WorkerName = S.Schema.Type<typeof WorkerName>

export const DeployedVersion = S.Struct({
  version_id: WorkerVersionId,
  percentage: S.Number.pipe(S.check(S.isBetween({ minimum: 0.01, maximum: 100 }))),
})

export const CreateDeployment = S.Struct({
  strategy: S.Literal('percentage'),
  versions: S.Array(DeployedVersion),
  annotations: S.Struct({ 'workers/message': S.String }),
})
export type CreateDeployment = S.Schema.Type<typeof CreateDeployment>

const CloudflareMessage = S.Struct({ code: S.Number, message: S.String })

export const Deployment = S.Struct({ id: S.String, versions: S.Array(DeployedVersion) })

export const DeploymentAccepted = S.Struct({
  success: S.Literal(true),
  result: Deployment,
})

export const DeploymentRejected = S.Struct({
  success: S.Literal(false),
  errors: S.Array(CloudflareMessage),
})

export const DeploymentResponse = S.Union([DeploymentAccepted, DeploymentRejected])
export type DeploymentResponse = S.Schema.Type<typeof DeploymentResponse>
