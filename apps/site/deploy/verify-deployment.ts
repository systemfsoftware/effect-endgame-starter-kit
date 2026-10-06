import * as Credentials from '@distilled.cloud/cloudflare/Credentials'
import * as workers from '@distilled.cloud/cloudflare/workers'
import { NodeRuntime } from '@effect/platform-node'
import { Config, ConfigProvider, Console, Effect, Match, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'
import * as S from 'effect/Schema'

import { WorkerObservability } from './deploy-verification.schema.ts'
import { decideIssues } from './deploy-verification.ts'
import { WorkerName } from './worker-deployment.schema.ts'

class SettingsReadRejected extends S.TaggedError<SettingsReadRejected>()('SettingsReadRejected', {
  worker: S.String,
  reason: S.String,
}) {
  override get message(): string {
    return `reading the settings of ${this.worker} was rejected: ${this.reason}`
  }
}

class IssuesNotEnabled extends S.TaggedError<IssuesNotEnabled>()('IssuesNotEnabled', {
  worker: S.String,
}) {
  override get message(): string {
    return `${this.worker} does not have Workers Issues enabled`
  }
}

const verificationConfig = Config.all({
  accountId: Config.String('CLOUDFLARE_ACCOUNT_ID'),
  token: Config.Redacted('CLOUDFLARE_API_TOKEN'),
  worker: Config.schema(WorkerName, 'DEPLOY_WORKER'),
})

export const verifyDeployment = (config: {
  readonly accountId: string
  readonly token: Redacted.Redacted<string>
  readonly worker: WorkerName
}) =>
  Effect.gen(function*() {
    const settings = yield* workers.getScriptSetting({ accountId: config.accountId, scriptName: config.worker }).pipe(
      Effect.mapError((error) => new SettingsReadRejected({ worker: config.worker, reason: error.message })),
      Effect.provide(Credentials.fromApiToken({ apiToken: Redacted.value(config.token) })),
    )
    const observability = yield* S.decodeUnknownEffect(WorkerObservability)(settings.observability ?? {}).pipe(
      Effect.mapError((issue) => new SettingsReadRejected({ worker: config.worker, reason: issue.message })),
    )

    yield* Match.value(decideIssues(observability)).pipe(
      Match.when({ _tag: 'IssuesEnabled' }, () => Effect.void),
      Match.orElse(() => Effect.fail(new IssuesNotEnabled({ worker: config.worker }))),
    )

    yield* Console.log(`Workers Issues enabled for ${config.worker}`)
  })

const main = Effect.gen(function*() {
  const config = yield* verificationConfig.parse(ConfigProvider.fromEnv())
  yield* verifyDeployment(config)
})

if (import.meta.main) {
  main.pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain)
}
