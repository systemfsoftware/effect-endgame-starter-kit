import { Schema } from 'effect'
import * as Config from 'effect/Config'
import { ConfigError } from 'effect/Config'
import * as Crypto from 'effect/Crypto'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'
import type { SchemaError } from 'effect/Schema'

const instrument = `${import.meta.dirname ?? '.'}/../..`

const Manifest = Schema.Struct({
  journeys: Schema.Array(Schema.Struct({ id: Schema.String, inputs: Schema.Array(Schema.String) })),
})

export const LauncherRecord = Schema.Struct({
  id: Schema.String,
  inputHash: Schema.String,
  argv: Schema.Array(Schema.String),
  code: Schema.Finite,
  stdout: Schema.String,
  stderr: Schema.String,
  files: Schema.Record(Schema.String, Schema.String),
  egressLog: Schema.Null,
  wallMs: Schema.Finite,
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

export type LauncherError = MissingLauncherRecord | StaleLauncherRecord | SchemaError | ConfigError | PlatformError

const encoder = new TextEncoder()

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const sha256 = (data: Uint8Array): Effect.Effect<string, PlatformError, Crypto.Crypto> =>
  Crypto.Crypto.pipe(Effect.flatMap((crypto) => crypto.digest('SHA-256', data)), Effect.map(hex))

const filesUnder = (path: string): Effect.Effect<readonly string[], PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = `${instrument}/${path}`
    const info = yield* fs.stat(root)
    if (info.type === 'File') return [path]
    const entries = yield* fs.readDirectory(root, { recursive: true })
    const named = yield* Effect.forEach(
      entries,
      (entry) => Effect.map(fs.stat(`${root}/${entry}`), (entryInfo) => ({ entry, entryInfo })),
    )
    return named.filter(({ entryInfo }) => entryInfo.type === 'File').map(({ entry }) => `${path}/${entry}`)
  })

const inputHashOf = (
  inputs: readonly string[],
  launcher: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Crypto.Crypto> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const files = (yield* Effect.forEach(inputs, filesUnder)).flat().sort()
    const parts = yield* Effect.forEach(files, (file) =>
      Effect.gen(function*() {
        const bytes = yield* fs.readFile(`${instrument}/${file}`)
        return `${file}\0${yield* sha256(bytes)}`
      }))
    return yield* sha256(encoder.encode([launcher, ...parts].join('\n')))
  })

export const launcherRun = (
  journey: string,
): Effect.Effect<LauncherRecord, LauncherError, FileSystem.FileSystem | Crypto.Crypto> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(Manifest))(
      yield* fs.readFileString(`${instrument}/journeys/manifest.json`),
    )
    const entry = manifest.journeys.find((candidate) => candidate.id === journey)
    if (entry === undefined) return yield* new MissingLauncherRecord({ journey })
    const text = yield* fs.readFileString(`${instrument}/journeys/__records__/${journey}.json`).pipe(
      Effect.orElseSucceed(() => null),
    )
    if (text === null) return yield* new MissingLauncherRecord({ journey })
    const record = yield* Schema.decodeEffect(Schema.fromJsonString(LauncherRecord))(text)
    const launcher = yield* Config.String('SCORECARD_LAUNCHER').pipe(Config.withDefault(''))
    const current = yield* inputHashOf(entry.inputs, launcher)
    if (record.inputHash !== current) {
      return yield* new StaleLauncherRecord({ journey, recorded: record.inputHash, current })
    }
    return record
  })
