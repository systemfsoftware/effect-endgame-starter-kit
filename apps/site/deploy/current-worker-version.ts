import * as Credentials from '@distilled.cloud/cloudflare/Credentials'
import * as workers from '@distilled.cloud/cloudflare/workers'
import { NodeRuntime } from '@effect/platform-node'
import { Config, ConfigProvider, Console, Effect, Option, Redacted } from 'effect'
import * as Arr from 'effect/Array'
import { FetchHttpClient } from 'effect/http'
import * as S from 'effect/Schema'

import { WorkerName } from './worker-deployment.schema.ts'

class DeploymentsReadRejected extends S.TaggedError<DeploymentsReadRejected>()('DeploymentsReadRejected', {
  worker: S.String,
  reason: S.String,
}) {
  override get message(): string {
    return `reading the deployments of ${this.worker} was rejected: ${this.reason}`
  }
}

type Deployment = workers.ListScriptDeploymentsResponse['deployments'][number]

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
        onSome: (current) => Option.some(deployment.createdOn > current.createdOn ? deployment : current),
      }),
  )(deployments)

const main = Effect.gen(function*() {
  const config = yield* versionConfig.parse(ConfigProvider.fromEnv())
  const { deployments } = yield* workers.listScriptDeployments({
    accountId: config.accountId,
    scriptName: config.worker,
  }).pipe(
    Effect.mapError((error) => new DeploymentsReadRejected({ worker: config.worker, reason: error.message })),
    Effect.provide(Credentials.fromApiToken({ apiToken: Redacted.value(config.token) })),
  )

  const version = Option.flatMap(
    newestDeployment(deployments),
    (deployment) =>
      Option.map(Arr.findFirst(deployment.versions, (entry) => entry.percentage >= 100), (entry) => entry.versionId),
  )

  yield* Option.match(version, {
    onNone: () => Console.log(''),
    onSome: (versionId) => Console.log(versionId),
  })
})

if (import.meta.main) {
  main.pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain)
}
