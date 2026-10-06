import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

import type { ApiLogLine, WorkerObservability } from './deploy-verification.schema.ts'

const SETTINGS_PATCH_PATH = '/script-settings'

export class CleanRedeploy extends S.TaggedClass<CleanRedeploy>()('CleanRedeploy', {}) {}

export class SettingsDrift extends S.TaggedClass<SettingsDrift>()('SettingsDrift', {
  patchCount: S.Finite,
}) {}

export const DeployLogDecision = S.Union([CleanRedeploy, SettingsDrift])
export type DeployLogDecision = S.Schema.Type<typeof DeployLogDecision>

export const isSettingsPatch = (line: ApiLogLine): boolean =>
  Match.value(line.method).pipe(
    Match.when('PATCH', () => line.path.endsWith(SETTINGS_PATCH_PATH)),
    Match.orElse(() => false),
  )

export const decideDeployLog = (lines: ReadonlyArray<ApiLogLine>): DeployLogDecision => {
  const patchCount = Arr.filter(lines, isSettingsPatch).length
  return Match.value(patchCount === 0).pipe(
    Match.when(true, () => new CleanRedeploy({})),
    Match.when(false, () => new SettingsDrift({ patchCount })),
    Match.exhaustive,
  )
}

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
