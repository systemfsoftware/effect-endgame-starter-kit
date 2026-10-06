import { Context, Data, Duration, Effect, Layer, Schedule, Schema as S } from 'effect'
import { FetchHttpClient, HttpClient } from 'effect/http'
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare } from 'miniflare'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuilder } from 'vite'

import { sitePlugins } from '../../vite-plugins.ts'

const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))

export class WorkerdBuildFailed extends Data.TaggedError('WorkerdBuildFailed')<{ readonly detail: string }> {}

export class WorkerdStartupTimedOut extends Data.TaggedError('WorkerdStartupTimedOut')<{
  readonly scriptPath: string
  readonly timeoutMillis: number
}> {}

export class WorkerdStartupFailed extends Data.TaggedError('WorkerdStartupFailed')<{
  readonly detail: string
}> {}

const READINESS_PATH = '/llms.txt'

const builtWorkerConfig = S.Struct({
  main: S.String,
  compatibility_date: S.String,
  compatibility_flags: S.UndefinedOr(S.Array(S.String)),
})

export interface BuiltWorker {
  readonly scriptPath: string
  readonly compatibilityDate: string
  readonly compatibilityFlags: ReadonlyArray<string>
}

export class WorkerdWorker extends Context.Service<WorkerdWorker, {
  readonly origin: string
  readonly logs: Effect.Effect<ReadonlyArray<string>>
}>()('WorkerdWorker') {}

export interface WorkerdWorkerOptions {
  readonly entry: string
  readonly outDir: string
  readonly bindings?: Readonly<Record<string, string>>
  readonly define?: Readonly<Record<string, string>>
  readonly startupTimeout?: Duration.Input
}

class CapturingLog extends Log {
  readonly lines: Array<string> = []

  constructor() {
    super(LogLevel.DEBUG)
  }

  protected override log(message: string): void {
    this.lines.push(message)
  }
}

const filesNamed = (directory: string, name: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? filesNamed(path, name)
      : entry.name === name
      ? [path]
      : []
  })

const allFilesIn = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? allFilesIn(path) : [path]
  })

type ModuleType = 'ESModule' | 'CommonJS' | 'Text' | 'Data' | 'CompiledWasm'

const MODULE_TYPE_BY_EXTENSION: Readonly<Record<string, ModuleType>> = {
  '.js': 'ESModule',
  '.mjs': 'ESModule',
  '.cjs': 'CommonJS',
  '.txt': 'Text',
  '.html': 'Text',
  '.bin': 'Data',
  '.wasm': 'CompiledWasm',
}

const modulesAlongside = (
  scriptPath: string,
): Array<{ readonly path: string; readonly type: ModuleType }> => {
  const workerDir = dirname(scriptPath)
  const mainName = basename(scriptPath)
  const siblings = allFilesIn(workerDir).flatMap((file) => {
    const name = relative(workerDir, file).split(sep).join('/')
    if (name === mainName) return []
    const type = MODULE_TYPE_BY_EXTENSION[extname(name)]
    return type === undefined ? [] : [{ path: name, type }]
  })
  return [{ path: mainName, type: 'ESModule' as const }, ...siblings]
}

const builtWorkerAt = (outDir: string): Effect.Effect<BuiltWorker, WorkerdBuildFailed> =>
  Effect.gen(function*() {
    const [configPath] = filesNamed(outDir, 'wrangler.json')
    if (configPath === undefined) {
      return yield* new WorkerdBuildFailed({ detail: `no wrangler.json under ${outDir}` })
    }
    const configText = yield* Effect.try({
      try: () => readFileSync(configPath, 'utf8'),
      catch: (cause) =>
        new WorkerdBuildFailed({ detail: cause instanceof Error ? cause.message : 'unreadable worker config' }),
    })
    const config = yield* S.decodeEffect(S.fromJsonString(builtWorkerConfig))(configText).pipe(
      Effect.mapError((issue) => new WorkerdBuildFailed({ detail: `unreadable worker config: ${issue.message}` })),
    )
    return {
      scriptPath: join(dirname(configPath), config.main),
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags ?? [],
    }
  })

const buildWorker = (options: WorkerdWorkerOptions) =>
  Effect.gen(function*() {
    yield* Effect.tryPromise({
      try: () =>
        createBuilder({
          root: SITE_ROOT,
          configFile: false,
          plugins: sitePlugins(options.entry),
          define: { ...options.define },
          build: { outDir: options.outDir, emptyOutDir: true },
          logLevel: 'warn',
        }).then((builder) => builder.buildApp()),
      catch: (cause) => new WorkerdBuildFailed({ detail: cause instanceof Error ? cause.message : 'build failed' }),
    })
    return yield* builtWorkerAt(join(SITE_ROOT, options.outDir))
  })

const serveProbe = (origin: URL): Effect.Effect<void, WorkerdStartupFailed> =>
  HttpClient.get(new URL(READINESS_PATH, origin).toString()).pipe(
    Effect.flatMap((response) =>
      response.status >= 200 && response.status < 300
        ? Effect.void
        : Effect.fail(new WorkerdStartupFailed({ detail: `readiness answered ${response.status}` }))
    ),
    Effect.catchTag('HttpClientError', (error) => Effect.fail(new WorkerdStartupFailed({ detail: error.message }))),
    Effect.provide(FetchHttpClient.layer),
  )

export const workerdWorkerLayer = (options: WorkerdWorkerOptions) =>
  Layer.effect(
    WorkerdWorker,
    Effect.gen(function*() {
      const built = yield* buildWorker(options)
      const log = new CapturingLog()
      const miniflare = yield* Effect.acquireRelease(
        Effect.sync(() =>
          new Miniflare(convertV4MiniflareOptions({
            host: '127.0.0.1',
            port: 0,
            rootPath: dirname(built.scriptPath),
            modules: modulesAlongside(built.scriptPath),
            modulesRoot: dirname(built.scriptPath),
            compatibilityDate: built.compatibilityDate,
            compatibilityFlags: [...built.compatibilityFlags],
            bindings: { ...options.bindings },
            log,
          }))
        ),
        (instance) => Effect.promise(() => instance.dispose()),
      )
      const timeoutMillis = Duration.toMillis(options.startupTimeout ?? Duration.seconds(60))
      const origin = yield* Effect.gen(function*() {
        const url = yield* Effect.tryPromise({
          try: () => miniflare.ready,
          catch: (cause) =>
            new WorkerdStartupFailed({ detail: cause instanceof Error ? cause.message : 'runtime failed to start' }),
        })
        yield* serveProbe(url).pipe(Effect.retry({ schedule: Schedule.spaced('100 millis') }))
        return url
      }).pipe(
        Effect.timeoutOrElse({
          duration: Duration.millis(timeoutMillis),
          orElse: () => Effect.fail(new WorkerdStartupTimedOut({ scriptPath: built.scriptPath, timeoutMillis })),
        }),
      )
      return { origin: origin.origin, logs: Effect.sync(() => [...log.lines]) }
    }),
  )
