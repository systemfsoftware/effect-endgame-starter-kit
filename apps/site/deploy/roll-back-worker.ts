import { NodeRuntime } from '@effect/platform-node'
import { Config, ConfigProvider, Console, Effect, Match, Redacted } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from 'effect/http'
import * as S from 'effect/Schema'

import { CreateDeployment, DeploymentResponse, WorkerName, WorkerVersionId } from './worker-deployment.schema.ts'

const API_BASE_URL = 'https://api.cloudflare.com/client/v4'

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
  const client = yield* HttpClient.HttpClient
  const request = yield* HttpClientRequest.schemaBodyJson(CreateDeployment)(
    HttpClientRequest.bearerToken(
      HttpClientRequest.post(
        `${API_BASE_URL}/accounts/${config.accountId}/workers/scripts/${config.worker}/deployments`,
      ),
      Redacted.value(config.token),
    ),
    {
      strategy: 'percentage',
      versions: [{ version_id: config.to, percentage: 100 }],
      annotations: { 'workers/message': `rollback: QA failed on ${config.from}` },
    },
  )
  const response = yield* client.execute(request)
  const outcome = yield* HttpIncomingMessage.schemaBodyJson(DeploymentResponse)(response)
  const deployment = yield* Match.value(outcome).pipe(
    Match.when({ success: true }, (accepted) => Effect.succeed(accepted.result)),
    Match.when({ success: false }, (rejected) =>
      Effect.fail(
        new RollbackRejected({
          worker: config.worker,
          from: config.from,
          to: config.to,
          reason: rejected.errors.map((error) => `${error.code} ${error.message}`).join('; '),
        }),
      )),
    Match.exhaustive,
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
