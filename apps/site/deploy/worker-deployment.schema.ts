import * as S from 'effect/Schema'

export const WorkerVersionId = S.String.pipe(S.check(S.isUUID()), S.brand('WorkerVersionId'))
export type WorkerVersionId = S.Schema.Type<typeof WorkerVersionId>

export const WorkerName = S.String.pipe(S.check(S.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)), S.brand('WorkerName'))
export type WorkerName = S.Schema.Type<typeof WorkerName>
