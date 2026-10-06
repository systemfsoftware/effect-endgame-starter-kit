import { NodeFileSystem } from '@effect/platform-node'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Exit, FileSystem, Layer, Redacted, Result } from 'effect'
import { FetchHttpClient } from 'effect/http'
import * as S from 'effect/Schema'

import { verifyDeployment } from '../deploy/verify-deployment.ts'
import { WorkerName } from '../deploy/worker-deployment.schema.ts'

const Feature = makeFeature({ it })

const WORKER = Result.getOrThrow(S.decodeResult(WorkerName)('endgame-site-nodrift'))
const SCRIPT = `/accounts/acct/workers/scripts/${WORKER}`

const line = (method: string, path: string): string => JSON.stringify({ method, path, status: 200 })

const CLEAN_REDEPLOY_LOG = [
  line('GET', `${SCRIPT}/settings`),
  line('PUT', SCRIPT),
].join('\n')

const DRIFTING_REDEPLOY_LOG = [
  line('GET', `${SCRIPT}/settings`),
  line('PATCH', `${SCRIPT}/script-settings`),
].join('\n')

const settings = (observability: object): Response =>
  new Response(
    JSON.stringify({ success: true, result: { observability }, errors: [], messages: [] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

const ISSUES_ENABLED_HARNESS = Layer.merge(
  NodeFileSystem.layer,
  FetchHttpClient.layer.pipe(
    Layer.provide(
      Layer.succeed(FetchHttpClient.Fetch, () => Promise.resolve(settings({ issues: { enabled: true } }))),
    ),
  ),
)

const ISSUES_DISABLED_HARNESS = Layer.merge(
  NodeFileSystem.layer,
  FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, () => Promise.resolve(settings({})))),
  ),
)

const runVerification = (log: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectory({ prefix: 'deploy-verification-' })
    const logPath = `${directory}/deploy-2.jsonl`
    yield* fs.writeFileString(logPath, log)
    return yield* verifyDeployment({
      accountId: 'acct',
      token: Redacted.make('token'),
      worker: WORKER,
      logPath,
    }).pipe(
      Effect.ensuring(Effect.ignore(fs.remove(directory, { recursive: true, force: true }))),
      Effect.exit,
    )
  })

Feature('Verifying a Worker after its redeploy')
  .live(
    'the deploy check reads its redeploy log through the real file system and calls the Cloudflare API through the real HTTP client, whose transport is a stub',
  )
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A redeploy that patches the script settings is rejected',
      { scenarioLayer: ISSUES_ENABLED_HARNESS },
      Gherkin.Do.pipe(
        When('the deployment check runs over a redeploy log that patches script settings')(
          'exit',
          () => runVerification(DRIFTING_REDEPLOY_LOG),
        ),
        Then('the check is rejected')((s, expect) =>
          expect(s.exit).toSatisfy(Exit.isFailure, 'the deployment check rejects the redeploy')
        ),
      ),
    )

    scenario(
      'A Worker reported without the Issues setting is rejected',
      { scenarioLayer: ISSUES_DISABLED_HARNESS },
      Gherkin.Do.pipe(
        When('the deployment check runs over a clean redeploy log and a Worker without Issues')(
          'exit',
          () => runVerification(CLEAN_REDEPLOY_LOG),
        ),
        Then('the check is rejected')((s, expect) =>
          expect(s.exit).toSatisfy(Exit.isFailure, 'the deployment check rejects the redeploy')
        ),
      ),
    )

    scenario(
      'A clean redeploy of a Worker with Issues enabled is accepted',
      { scenarioLayer: ISSUES_ENABLED_HARNESS },
      Gherkin.Do.pipe(
        When('the deployment check runs over a clean redeploy log and a Worker with Issues')(
          'exit',
          () => runVerification(CLEAN_REDEPLOY_LOG),
        ),
        Then('the check is accepted')((s, expect) =>
          expect(s.exit).toSatisfy(Exit.isSuccess, 'the deployment check accepts the redeploy')
        ),
      ),
    )
  })
