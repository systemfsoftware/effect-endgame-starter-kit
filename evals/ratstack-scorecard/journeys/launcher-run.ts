import { Effect, Schema } from 'effect'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const instrument = join(import.meta.dirname, '..')

const Manifest = Schema.Struct({
  journeys: Schema.Array(Schema.Struct({ id: Schema.String, inputs: Schema.Array(Schema.String) })),
})

export const LauncherRecord = Schema.Struct({
  id: Schema.String,
  inputHash: Schema.String,
  argv: Schema.Array(Schema.String),
  code: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  files: Schema.Record(Schema.String, Schema.String),
  egressLog: Schema.Null,
  wallMs: Schema.Number,
})
export type LauncherRecord = typeof LauncherRecord.Type

export class MissingLauncherRecord extends Schema.TaggedError<MissingLauncherRecord>()('MissingLauncherRecord', {
  journey: Schema.String,
}) {
  override get message(): string {
    return `journey ${this.journey} has no launcher record: run \`scorecard journeys\`, which produces it before vitest`
  }
}

export class StaleLauncherRecord extends Schema.TaggedError<StaleLauncherRecord>()('StaleLauncherRecord', {
  journey: Schema.String,
  recorded: Schema.String,
  current: Schema.String,
}) {
  override get message(): string {
    return `journey ${this.journey}'s launcher record is stale (inputs ${this.recorded} recorded, ${this.current} now)`
  }
}

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex')

const filesUnder = async (path: string): Promise<readonly string[]> => {
  const root = join(instrument, path)
  if ((await stat(root)).isFile()) return [path]
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => `${path}/${join(entry.parentPath, entry.name).slice(root.length + 1)}`)
}

const inputHashOf = async (inputs: readonly string[], launcher: string): Promise<string> => {
  const files = (await Promise.all(inputs.map(filesUnder))).flat().sort()
  const parts = await Promise.all(
    files.map(async (file) => `${file}\0${sha256(await readFile(join(instrument, file)))}`),
  )
  return sha256([launcher, ...parts].join('\n'))
}

const readJson = (path: string) => Effect.promise(async () => JSON.parse(await readFile(path, 'utf8')) as unknown)

const launcherRunEffect = (journey: string) =>
  Effect.gen(function*() {
    const manifest = yield* Schema.decodeUnknownEffect(Manifest)(
      yield* readJson(join(instrument, 'journeys/manifest.json')),
    )
    const entry = manifest.journeys.find((candidate) => candidate.id === journey)
    if (entry === undefined) return yield* new MissingLauncherRecord({ journey })
    const raw = yield* Effect.tryPromise({
      try: async () => JSON.parse(await readFile(join(instrument, 'journeys/__records__', `${journey}.json`), 'utf8')),
      catch: () => new MissingLauncherRecord({ journey }),
    })
    const record = yield* Schema.decodeUnknownEffect(LauncherRecord)(raw)
    const current = yield* Effect.promise(() => inputHashOf(entry.inputs, process.env['SCORECARD_LAUNCHER'] ?? ''))
    if (record.inputHash !== current) {
      return yield* new StaleLauncherRecord({ journey, recorded: record.inputHash, current })
    }
    return record
  })

export const launcherRun = (journey: string): Promise<LauncherRecord> => Effect.runPromise(launcherRunEffect(journey))
