import * as Credentials from '@distilled.cloud/cloudflare/Credentials'
import * as workers from '@distilled.cloud/cloudflare/workers'
import { NodeRuntime } from '@effect/platform-node'
import { Config, ConfigProvider, Console, Effect, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'
import * as S from 'effect/Schema'

import { WorkerName, WorkerVersionId } from './worker-deployment.schema.ts'

class RollbackRejected extends S.TaggedError<RollbackRejected>()('RollbackRejected', {
  worker: S.String,
  from: S.String,
  to: S.String,
  reason: S.String,
}) {
  override get message(): string {
    return `rolling ${this.worker} back from ${this.from} to ${this.to} was rejected: ${this.reason}`
  }
}

const rollbackConfig = Config.all({
  accountId: Config.String('CLOUDFLARE_ACCOUNT_ID'),
  token: Config.Redacted('CLOUDFLARE_API_TOKEN'),
  worker: Config.schema(WorkerName, 'ROLLBACK_WORKER'),
  from: Config.schema(WorkerVersionId, 'ROLLBACK_FROM_VERSION'),
  to: Config.schema(WorkerVersionId, 'ROLLBACK_TO_VERSION'),
})

const rollBack = Effect.gen(function*() {
  const config = yield* rollbackConfig.parse(ConfigProvider.fromEnv())
  const deployment = yield* workers.createScriptDeployment({
    accountId: config.accountId,
    scriptName: config.worker,
    strategy: 'percentage',
    versions: [{ versionId: config.to, percentage: 100 }],
    annotations: { workersMessage: `rollback: QA failed on ${config.from}` },
  }).pipe(
    Effect.mapError((error) =>
      new RollbackRejected({ worker: config.worker, from: config.from, to: config.to, reason: error.message })
    ),
    Effect.provide(Credentials.fromApiToken({ apiToken: Redacted.value(config.token) })),
  )
  yield* Console.log(
    [
      `### Rolled back \`${config.worker}\``,
      '',
      `- QA failed on version \`${config.from}\``,
      `- Now serving version \`${config.to}\` (deployment \`${deployment.id}\`)`,
    ].join('\n'),
  )
})

rollBack.pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain)
