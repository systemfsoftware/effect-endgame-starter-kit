import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

import type { WorkerObservability } from './deploy-verification.schema.ts'

export class IssuesEnabled extends S.TaggedClass<IssuesEnabled>()('IssuesEnabled', {}) {}

export class IssuesDisabled extends S.TaggedClass<IssuesDisabled>()('IssuesDisabled', {}) {}

export const IssuesDecision = S.Union([IssuesEnabled, IssuesDisabled])
export type IssuesDecision = S.Schema.Type<typeof IssuesDecision>

export const decideIssues = (observability: WorkerObservability): IssuesDecision =>
  Match.value(observability.issues?.enabled === true).pipe(
    Match.when(true, () => new IssuesEnabled({})),
    Match.when(false, () => new IssuesDisabled({})),
    Match.exhaustive,
  )
