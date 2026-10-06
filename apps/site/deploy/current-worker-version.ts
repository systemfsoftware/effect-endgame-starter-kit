import { NodeRuntime } from '@effect/platform-node'
import { Config, ConfigProvider, Console, Effect, Match, Option, Redacted } from 'effect'
import * as Arr from 'effect/Array'
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from 'effect/http'
import * as S from 'effect/Schema'

import { WorkerName, WorkerVersionId } from './worker-deployment.schema.ts'

const API_BASE_URL = 'https://api.cloudflare.com/client/v4'

class DeploymentsReadRejected extends S.TaggedError<DeploymentsReadRejected>()('DeploymentsReadRejected', {
  worker: S.String,
  reason: S.String,
}) {
  override get message(): string {
    return `reading the deployments of ${this.worker} was rejected: ${this.reason}`
  }
}

const DeployedVersion = S.Struct({
  version_id: WorkerVersionId,
  percentage: S.Finite,
})

const Deployment = S.Struct({
  id: S.String,
  created_on: S.String,
  versions: S.Array(DeployedVersion),
})
type Deployment = S.Schema.Type<typeof Deployment>

const DeploymentsAccepted = S.Struct({
  success: S.Literal(true),
  result: S.Struct({ deployments: S.Array(Deployment) }),
})

const DeploymentsRejected = S.Struct({
  success: S.Literal(false),
  errors: S.Array(S.Struct({ code: S.Finite, message: S.String })),
})

const DeploymentsResponse = S.Union([DeploymentsAccepted, DeploymentsRejected])

const versionConfig = Config.all({
  accountId: Config.String('CLOUDFLARE_ACCOUNT_ID'),
  token: Config.Redacted('CLOUDFLARE_API_TOKEN'),
  worker: Config.schema(WorkerName, 'DEPLOY_WORKER'),
})

const newestDeployment = (deployments: ReadonlyArray<Deployment>): Option.Option<Deployment> =>
  Arr.reduce(
    Option.none<Deployment>(),
    (held: Option.Option<Deployment>, deployment: Deployment) =>
      Option.match(held, {
        onNone: () => Option.some(deployment),
        onSome: (current) => Option.some(deployment.created_on > current.created_on ? deployment : current),
      }),
  )(deployments)

const main = Effect.gen(function*() {
  const config = yield* versionConfig.parse(ConfigProvider.fromEnv())
  const client = yield* HttpClient.HttpClient
  const request = HttpClientRequest.bearerToken(
    HttpClientRequest.get(`${API_BASE_URL}/accounts/${config.accountId}/workers/scripts/${config.worker}/deployments`),
    Redacted.value(config.token),
  )
  const response = yield* client.execute(request)
  const listed = yield* HttpIncomingMessage.schemaBodyJson(DeploymentsResponse)(response)

  const deployments = yield* Match.value(listed).pipe(
    Match.when({ success: true }, (accepted) => Effect.succeed(accepted.result.deployments)),
    Match.when({ success: false }, (rejected) =>
      Effect.fail(
        new DeploymentsReadRejected({
          worker: config.worker,
          reason: rejected.errors.map((error) => `${error.code} ${error.message}`).join('; '),
        }),
      )),
    Match.exhaustive,
  )

  const version = Option.flatMap(
    newestDeployment(deployments),
    (deployment) =>
      Option.map(Arr.findFirst(deployment.versions, (entry) => entry.percentage >= 100), (entry) => entry.version_id),
  )

  yield* Option.match(version, {
    onNone: () => Console.log(''),
    onSome: (versionId) => Console.log(versionId),
  })
})

if (import.meta.main) {
  main.pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain)
}
