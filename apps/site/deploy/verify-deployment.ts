import { NodeFileSystem, NodeRuntime } from '@effect/platform-node'
import { Config, ConfigProvider, Console, Effect, FileSystem, Layer, Match, Redacted } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from 'effect/http'
import * as S from 'effect/Schema'

import { ApiLogLineJson, WorkerObservability } from './deploy-verification.schema.ts'
import { decideDeployLog, decideIssues } from './deploy-verification.ts'
import { WorkerName } from './worker-deployment.schema.ts'

const API_BASE_URL = 'https://api.cloudflare.com/client/v4'

class DeployLogUnreadable extends S.TaggedError<DeployLogUnreadable>()('DeployLogUnreadable', {
  logPath: S.String,
  line: S.String,
}) {
  override get message(): string {
    return `the deploy log at ${this.logPath} holds an unparsable line: ${this.line}`
  }
}

class SettingsDriftDetected extends S.TaggedError<SettingsDriftDetected>()('SettingsDriftDetected', {
  worker: S.String,
  patchCount: S.Finite,
}) {
  override get message(): string {
    return `the redeploy of ${this.worker} sent ${this.patchCount} script-settings PATCH request(s); Workers Issues must not be re-sent`
  }
}

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

const CloudflareMessage = S.Struct({ code: S.Finite, message: S.String })

const SettingsAccepted = S.Struct({
  success: S.Literal(true),
  result: S.Struct({ observability: WorkerObservability }),
})

const SettingsRejected = S.Struct({
  success: S.Literal(false),
  errors: S.Array(CloudflareMessage),
})

const SettingsResponse = S.Union([SettingsAccepted, SettingsRejected])

const verificationConfig = Config.all({
  accountId: Config.String('CLOUDFLARE_ACCOUNT_ID'),
  token: Config.Redacted('CLOUDFLARE_API_TOKEN'),
  worker: Config.schema(WorkerName, 'DEPLOY_WORKER'),
  logPath: Config.String('DEPLOY_LOG'),
})

export const verifyDeployment = (config: {
  readonly accountId: string
  readonly token: Redacted.Redacted<string>
  readonly worker: WorkerName
  readonly logPath: string
}) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const client = yield* HttpClient.HttpClient

    const raw = yield* fs.readFileString(config.logPath)
    const lines = yield* Effect.forEach(
      raw.split('\n').filter((line) => line.length > 0),
      (line) =>
        S.decodeEffect(ApiLogLineJson)(line).pipe(
          Effect.mapError(() => new DeployLogUnreadable({ logPath: config.logPath, line })),
        ),
    )

    yield* Match.value(decideDeployLog(lines)).pipe(
      Match.when({ _tag: 'CleanRedeploy' }, () => Effect.void),
      Match.orElse((drift) =>
        Effect.fail(new SettingsDriftDetected({ worker: config.worker, patchCount: drift.patchCount }))
      ),
    )

    const request = HttpClientRequest.bearerToken(
      HttpClientRequest.get(`${API_BASE_URL}/accounts/${config.accountId}/workers/scripts/${config.worker}/settings`),
      Redacted.value(config.token),
    )
    const response = yield* client.execute(request)
    const settings = yield* HttpIncomingMessage.schemaBodyJson(SettingsResponse)(response)

    const observability = yield* Match.value(settings).pipe(
      Match.when({ success: true }, (accepted) => Effect.succeed(accepted.result.observability)),
      Match.when({ success: false }, (rejected) =>
        Effect.fail(
          new SettingsReadRejected({
            worker: config.worker,
            reason: rejected.errors.map((error) => `${error.code} ${error.message}`).join('; '),
          }),
        )),
      Match.exhaustive,
    )

    yield* Match.value(decideIssues(observability)).pipe(
      Match.when({ _tag: 'IssuesEnabled' }, () => Effect.void),
      Match.orElse(() => Effect.fail(new IssuesNotEnabled({ worker: config.worker }))),
    )

    yield* Console.log(`Workers Issues enabled and the redeploy sent no script-settings PATCH for ${config.worker}`)
  })

const main = Effect.gen(function*() {
  const config = yield* verificationConfig.parse(ConfigProvider.fromEnv())
  yield* verifyDeployment(config)
})

if (import.meta.main) {
  main.pipe(
    Effect.provide(Layer.merge(NodeFileSystem.layer, FetchHttpClient.layer)),
    NodeRuntime.runMain,
  )
}
