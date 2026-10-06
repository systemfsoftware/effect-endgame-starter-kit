import { NodeChildProcessSpawner, NodeHttpServer } from '@effect/platform-node'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Config, Effect, FileSystem, Layer, Option, Path, Schema, Stream } from 'effect'
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'

import {
  type ApiLogLine,
  ApiLogLineJson,
  type PatchObservability,
  PatchObservabilityJson,
} from './__fixtures__/cloudflare-deploy.fixture'

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef'
const API_TOKEN = 'fake-token'
const STAGE = 'nodrift'
const PUBLIC_SITE = new URL('..', import.meta.url).pathname
const REPO_ROOT_GITIGNORE = new URL('../../../.gitignore', import.meta.url).pathname
const ALCHEMY_BIN = new URL(import.meta.resolve('alchemy/bin/alchemy.js')).pathname

const SCRIPT_PATH = /^\/accounts\/[^/]+\/workers\/scripts\/([^/]+)/

interface DeployState {
  readonly scripts: Record<string, true>
  readonly settings: Record<string, PatchObservability>
  readonly patches: Array<PatchObservability>
  readonly issues: Array<boolean>
  readonly recorded: Array<string>
}

const apiEnvelope = (result: object) => ({ success: true, result, errors: [], messages: [] })

const json = (payload: object, status = 200) =>
  HttpServerResponse.jsonUnsafe(payload, { contentType: 'application/json', status })

const readBody = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function*() {
    const web = yield* Effect.orDie(HttpServerRequest.toWeb(request))
    return yield* Effect.promise(() => web.text())
  })

const scriptOf = (path: string): string | undefined => {
  const match = SCRIPT_PATH.exec(path)
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1])
}

const OBSERVABILITY_DEFAULTS = {
  enabled: true,
  headSamplingRate: 1,
  redactQueryString: false,
  logs: { enabled: true, invocationLogs: true, headSamplingRate: 1, persist: true },
  traces: { enabled: true, headSamplingRate: 1, persist: true },
} as const

const readSettings = (state: DeployState, script: string) => {
  const issues = state.settings[script]?.observability.issues
  return {
    observability: {
      ...OBSERVABILITY_DEFAULTS,
      ...(issues === undefined ? {} : { issues }),
    },
  }
}

const app = (state: DeployState) =>
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const method = request.method
    const path = new URL(request.url, 'http://127.0.0.1').pathname
    state.recorded.push(`${method} ${path}`)
    const script = scriptOf(path)

    if (/^\/accounts\/[^/]+\/workers\/scripts$/.test(path) && method === 'GET') {
      return json(apiEnvelope(Object.keys(state.scripts).map((id) => ({ id }))))
    }
    if (/^\/accounts\/[^/]+\/workers\/scripts\/[^/]+\/settings$/.test(path) && method === 'GET') {
      if (script === undefined || state.scripts[script] !== true) {
        return json({
          success: false,
          result: null,
          errors: [{ code: 10007, message: 'script not found' }],
          messages: [],
        }, 404)
      }
      return json(apiEnvelope(readSettings(state, script)))
    }
    if (/^\/accounts\/[^/]+\/workers\/scripts\/[^/]+\/script-settings$/.test(path)) {
      if (script === undefined || state.scripts[script] !== true) {
        return json({
          success: false,
          result: null,
          errors: [{ code: 10007, message: 'script not found' }],
          messages: [],
        }, 404)
      }
      if (method === 'GET') return json(apiEnvelope(readSettings(state, script)))
      if (method === 'PATCH') {
        const parsed = yield* Effect.orDie(Schema.decodeEffect(PatchObservabilityJson)(yield* readBody(request)))
        state.patches.push(parsed)
        state.issues.push(parsed.observability.issues.enabled)
        state.settings[script] = parsed
        return json(apiEnvelope(parsed))
      }
    }
    if (/^\/accounts\/[^/]+\/workers\/scripts\/[^/]+\/subdomain$/.test(path)) {
      if (script === undefined || state.scripts[script] !== true) {
        return json({
          success: false,
          result: null,
          errors: [{ code: 10007, message: 'script not found' }],
          messages: [],
        }, 404)
      }
      if (method === 'GET') return json(apiEnvelope({ enabled: false, previewsEnabled: false }))
      if (method === 'POST') return json(apiEnvelope({ enabled: true, previewsEnabled: false }))
      if (method === 'DELETE') return json(apiEnvelope({}))
    }
    if (/^\/accounts\/[^/]+\/workers\/scripts\/[^/]+\/assets-upload-session$/.test(path) && method === 'POST') {
      return json(apiEnvelope({ buckets: [], jwt: 'completion-jwt' }))
    }
    if (/^\/accounts\/[^/]+\/workers\/subdomain$/.test(path) && method === 'GET') {
      return json(apiEnvelope({ subdomain: 'testsub' }))
    }
    if (/^\/accounts\/[^/]+\/workers\/scripts\/[^/]+$/.test(path) && method === 'PUT') {
      if (script !== undefined) state.scripts[script] = true
      return json(apiEnvelope({ id: script, tag: `tag-${script ?? ''}`, logpush: false }))
    }
    if (method === 'GET') return json(apiEnvelope([]))
    return json(apiEnvelope({}))
  })

const makeProject = Effect.fn(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const rootDir = yield* fs.makeTempDirectory({ prefix: 'alchemy-drift-' })
  const projectDir = path.join(rootDir, 'project')
  const homeDir = path.join(rootDir, 'home')
  yield* fs.makeDirectory(projectDir, { recursive: true })
  yield* fs.makeDirectory(homeDir, { recursive: true })
  yield* fs.copyFile(REPO_ROOT_GITIGNORE, path.join(rootDir, '.gitignore'))
  for (const entry of yield* fs.readDirectory(PUBLIC_SITE)) {
    if (entry === '.alchemy' || entry === 'dist') continue
    yield* fs.symlink(path.join(PUBLIC_SITE, entry), path.join(projectDir, entry))
  }
  return { rootDir, projectDir, homeDir }
})

const DEPLOY_TIMEOUT = '120 seconds'

const childEnv = (options: {
  readonly port: number
  readonly logPath: string
  readonly homeDir: string
  readonly path: string
}): Record<string, string> => ({
  PATH: options.path,
  HOME: options.homeDir,
  CLOUDFLARE_API_BASE_URL: `http://127.0.0.1:${options.port}`,
  CLOUDFLARE_API_TOKEN: API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  ALCHEMY_CLOUDFLARE_API_LOG: options.logPath,
  ALCHEMY_HOME: options.homeDir,
})

const runDeploy = Effect.fn(function*(options: {
  readonly projectDir: string
  readonly homeDir: string
  readonly port: number
  readonly logPath: string
  readonly force: boolean
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const path = yield* Config.String('PATH')
  const command = ChildProcess.make(
    process.execPath,
    [ALCHEMY_BIN, 'deploy', '--stage', STAGE, '--no-input', '--yes', ...(options.force ? ['--force'] : [])],
    {
      cwd: options.projectDir,
      env: childEnv({ port: options.port, logPath: options.logPath, homeDir: options.homeDir, path }),
      killSignal: 'SIGKILL',
    },
  )
  return yield* Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* spawner.spawn(command)
      const [exitCode, output] = yield* Effect.all(
        [handle.exitCode, Stream.mkString(Stream.decodeText(handle.all))],
        { concurrency: 2 },
      )
      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* Effect.die(new Error(`alchemy deploy exited ${exitCode}:\n${output.slice(-6000)}`))
      }
      return output
    }),
  ).pipe(Effect.timeout(DEPLOY_TIMEOUT))
})

const readLog = Effect.fn(function*(logPath: string, output: string) {
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs
    .readFileString(logPath)
    .pipe(Effect.orElseSucceed(() => ''))
  if (raw.length === 0 && output.length > 0) {
    return yield* Effect.die(new Error(`deploy produced no request log:\n${output.slice(-4000)}`))
  }
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) =>
      Option.getOrThrowWith(Schema.decodeOption(ApiLogLineJson)(line), () => new Error(`unparsable log line: ${line}`))
    )
})

const countPatches = (lines: ReadonlyArray<ApiLogLine>): number =>
  lines.filter((line) => line.method === 'PATCH' && line.path.endsWith('/script-settings')).length

const DeployHarness = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(NodeHttpServer.layerTest.pipe(Layer.orDie)),
)

const Feature = makeFeature({ it })

Feature('Redeploying the site does not re-send the Workers Issues setting', { timeout: 180_000 })
  .withLayer(DeployHarness)
  .live(
    'the real alchemy deploy CLI is spawned as a child process and drives its own Cloudflare reconcile path against an in-process Node HttpServer recording the API, so the no-drift behaviour is proven end to end rather than through a stand-in for the provider',
  )
  .body(({ scenario }) => {
    scenario(
      'A settings patch is sent once, on the first deploy, and never again on a forced redeploy',
      Gherkin.Do.pipe(
        When('the site is deployed and then force-redeployed against a recording API')(
          'deploys',
          () =>
            Effect.gen(function*() {
              const fs = yield* FileSystem.FileSystem
              const server = yield* HttpServer.HttpServer
              const address = HttpServer.formatAddress(server.address)
              const portMatch = /:(\d+)$/.exec(address)
              const port = portMatch === null ? 0 : Number(portMatch[1])
              const state: DeployState = {
                scripts: {},
                settings: {},
                patches: [],
                issues: [],
                recorded: [],
              }
              yield* Effect.forkScoped(server.serve(app(state)))

              const { rootDir, projectDir, homeDir } = yield* makeProject()
              const logOne = `${homeDir}/deploy-one.jsonl`
              const logTwo = `${homeDir}/deploy-two.jsonl`

              const firstOutput = yield* runDeploy({ projectDir, homeDir, port, logPath: logOne, force: false })
              const secondOutput = yield* runDeploy({ projectDir, homeDir, port, logPath: logTwo, force: true })

              const firstLog = yield* readLog(logOne, firstOutput)
              const secondLog = yield* readLog(logTwo, secondOutput)
              yield* Effect.ignore(fs.remove(rootDir, { recursive: true, force: true }))

              return {
                firstPatchCount: countPatches(firstLog),
                secondPatchCount: countPatches(secondLog),
                recordedIssues: state.issues,
              }
            }),
        ),
        Then('deploy one patches Issues on and deploy two sends no settings patch')((s, expect) =>
          expect({
            firstPatchCount: s.deploys.firstPatchCount,
            secondPatchCount: s.deploys.secondPatchCount,
            recordedIssues: s.deploys.recordedIssues,
          }).toEqual({
            firstPatchCount: 1,
            secondPatchCount: 0,
            recordedIssues: [true],
          })
        ),
      ),
    )
  })
