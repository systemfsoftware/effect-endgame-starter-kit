import { Cause, Duration, Effect, Exit, Match, Option, Schedule, Schema } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientRequest, type HttpClientResponse } from 'effect/http'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { inflateRawSync } from 'node:zlib'
import { rowDefinitions } from '../src/metrics/registry.ts'
import type { MainBaseline, MeasuredCell, Side } from '../src/model/cell.ts'
import {
  assembleScorecard,
  type CellsByRow,
  type FamilyResult,
  type SideCell,
} from '../src/model/scorecard-document.ts'
import { renderSummary } from '../src/model/summary-table.ts'
import { mainBaselineOf, type WorkflowRun } from './main-scorecard.ts'
import { ArtifactsSchema, FamilyResultSchema, ScorecardDocumentSchema, WorkflowRunsSchema } from './schema.ts'

class MalformedInput extends Schema.TaggedError<MalformedInput>()('MalformedInput', {
  what: Schema.String,
  issue: Schema.String,
}) {}

class DuplicateCell extends Schema.TaggedError<DuplicateCell>()('DuplicateCell', {
  id: Schema.String,
  side: Schema.String,
}) {}

class GithubApiError extends Schema.TaggedError<GithubApiError>()('GithubApiError', {
  request: Schema.String,
  detail: Schema.String,
}) {}

class RatchetFailed extends Schema.TaggedError<RatchetFailed>()('RatchetFailed', {
  rows: Schema.Array(Schema.String),
}) {}

class CacheUnusable extends Schema.TaggedError<CacheUnusable>()('CacheUnusable', {
  reason: Schema.String,
}) {}

type DecideError = MalformedInput | DuplicateCell | GithubApiError | RatchetFailed | CacheUnusable

const issueOf = (cause: Error | string): string => cause instanceof Error ? cause.message : cause

const malformed = (what: string, issue: string): MalformedInput => new MalformedInput({ what, issue })

const unknownFailure = 'unknown failure'

const readText = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, 'utf8'),
    catch: (cause) => malformed(path, issueOf(cause instanceof Error ? cause : unknownFailure)),
  })

const writeText = (path: string, text: string) =>
  Effect.promise(async () => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  })

const decodeFile = <A>(schema: Schema.Codec<A>, path: string) =>
  readText(path).pipe(
    Effect.flatMap((text) => Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text)),
    Effect.mapError((cause) => malformed(path, issueOf(cause instanceof Error ? cause : unknownFailure))),
  )

type Keyed = Readonly<Record<string, Readonly<Partial<Record<Side, MeasuredCell>>>>>

const noCells: Keyed = {}

const keyCells = (cells: readonly SideCell[]): Effect.Effect<CellsByRow, DuplicateCell> =>
  Effect.reduce(cells, () => noCells, (keyed: Keyed, cell: SideCell) =>
    keyed[cell.id]?.[cell.side] === undefined
      ? Effect.succeed<Keyed>({ ...keyed, [cell.id]: { ...keyed[cell.id], [cell.side]: cell.measured } })
      : Effect.fail(new DuplicateCell({ id: cell.id, side: cell.side })))

const familyResults = (dir: string) =>
  Effect.promise(() => readdir(dir)).pipe(
    Effect.flatMap((names) =>
      Effect.forEach(
        names.filter((name) => name.endsWith('.json')).sort(),
        (name) => decodeFile(FamilyResultSchema, join(dir, name)),
      )
    ),
  )

const mainBaseline = (path: string | undefined): Effect.Effect<MainBaseline, MalformedInput> =>
  path === undefined
    ? Effect.succeed({ _tag: 'Missing' })
    : decodeFile(ScorecardDocumentSchema, path).pipe(
      Effect.map((doc) => ({ _tag: 'Found', commit: doc.provenance.commit, rows: doc.rows })),
    )

const aggregate = (args: readonly string[]) =>
  Effect.gen(function*() {
    const { values } = parseArgs({
      args: [...args],
      options: {
        families: { type: 'string' },
        implemented: { type: 'string' },
        main: { type: 'string' },
        commit: { type: 'string' },
        out: { type: 'string' },
        summary: { type: 'string' },
      },
      strict: true,
    })
    const results: readonly FamilyResult[] = yield* familyResults(yield* required(values.families, '--families'))
    const implemented: readonly string[] = (yield* required(values.implemented, '--implemented')).split(',')
    const cells = results.flatMap((result) => result.cells)
    const hashes = results.flatMap((result) => result.definitionHashes)
    const provenanceOf = (side: Side) => cells.find((cell) => cell.side === side)?.measured.provenance
    const any = provenanceOf('starter') ?? provenanceOf('ratstack')
    if (any === undefined) return yield* malformed(values.families ?? '', 'no cells')
    const doc = assembleScorecard({
      rows: rowDefinitions
        .filter((definition) => implemented.includes(definition.family))
        .map((definition) => ({
          definition,
          hash: hashes.find((hash) => hash.id === definition.id)?.hash ?? `no ${definition.family} result`,
        })),
      cells: yield* keyCells(cells),
      flags: results.flatMap((result) => result.flags),
      provenance: {
        commit: provenanceOf('starter')?.commit ?? (yield* required(values.commit, '--commit')),
        ratstackCommit: provenanceOf('ratstack')?.commit ?? 'unknown',
        instrumentHash: any.instrumentHash,
        nixpkgsRev: any.nixpkgsRev,
        runner: any.runner,
        generatedAt: new Date().toISOString(),
      },
      main: yield* mainBaseline(values.main),
    })
    yield* writeText(yield* required(values.out, '--out'), `${JSON.stringify(doc, null, 2)}\n`)
    yield* writeText(yield* required(values.summary, '--summary'), renderSummary(doc))
    if (doc.ratchet.failures.length > 0) {
      return yield* new RatchetFailed({ rows: doc.ratchet.failures.map((failure) => failure.id) })
    }
  })

const isInstrumentError = (cell: SideCell): boolean =>
  Match.value(cell.measured.cell).pipe(
    Match.tag('InstrumentError', () => true),
    Match.orElse(() => false),
  )

const cacheCheck = (args: readonly string[]) =>
  Effect.gen(function*() {
    const { values } = parseArgs({ args: [...args], options: { file: { type: 'string' } }, strict: true })
    const result = yield* decodeFile(FamilyResultSchema, yield* required(values.file, '--file')).pipe(
      Effect.mapError((error) => new CacheUnusable({ reason: error.what })),
    )
    const broken = result.cells.filter((cell) => cell.side === 'ratstack' && isInstrumentError(cell))
    if (broken.length > 0) {
      return yield* new CacheUnusable({
        reason: `rat-stack instrument errors on ${broken.map((c) => c.id).join(', ')}`,
      })
    }
  })

const apiError = (request: string, detail: string): GithubApiError => new GithubApiError({ request, detail })

const githubGet = (path: string) =>
  Effect.gen(function*() {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient({ schedule: Schedule.exponential(Duration.seconds(1)), times: 3 }),
    )
    const token = process.env['GITHUB_TOKEN']
    const request = HttpClientRequest.get(path.startsWith('https://') ? path : `https://api.github.com${path}`).pipe(
      (r) => token === undefined || token === '' ? r : HttpClientRequest.bearerToken(r, token),
    )
    return yield* client.execute(request).pipe(Effect.timeout(Duration.seconds(15)))
  }).pipe(
    Effect.mapError((cause) => apiError(`GET ${path}`, issueOf(cause instanceof Error ? cause : unknownFailure))),
    Effect.provide(FetchHttpClient.layer),
  )

const ok = (path: string) =>
(
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<HttpClientResponse.HttpClientResponse, GithubApiError> =>
  response.status >= 200 && response.status < 300
    ? Effect.succeed(response)
    : Effect.fail(apiError(`GET ${path}`, `status ${response.status}`))

const githubJson = <A>(schema: Schema.Codec<A>, path: string) =>
  githubGet(path).pipe(
    Effect.flatMap(ok(path)),
    Effect.flatMap((response) => response.json),
    Effect.flatMap((body) => Schema.decodeUnknownEffect(schema)(body)),
    Effect.mapError((cause) => apiError(`GET ${path}`, issueOf(cause instanceof Error ? cause : unknownFailure))),
  )

const findZipEntry = (zip: Buffer, name: string): string => {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  const scan = (entry: number, remaining: number): string => {
    if (remaining === 0) throw new Error(`no ${name} in the archive`)
    const nameLength = zip.readUInt16LE(entry + 28)
    const extraLength = zip.readUInt16LE(entry + 30)
    const commentLength = zip.readUInt16LE(entry + 32)
    if (zip.toString('utf8', entry + 46, entry + 46 + nameLength) === name) {
      const method = zip.readUInt16LE(entry + 10)
      const size = zip.readUInt32LE(entry + 20)
      const local = zip.readUInt32LE(entry + 42)
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const data = zip.subarray(start, start + size)
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    }
    return scan(entry + 46 + nameLength + extraLength + commentLength, remaining - 1)
  }
  return scan(zip.readUInt32LE(end + 16), count)
}

const zipEntry = (zip: Buffer, name: string) =>
  Effect.try({
    try: () => findZipEntry(zip, name),
    catch: (cause) => apiError(`unzip ${name}`, issueOf(cause instanceof Error ? cause : unknownFailure)),
  })

const artifactText = (run: WorkflowRun, repository: string) =>
  Effect.gen(function*() {
    const artifactsPath = `/repos/${repository}/actions/runs/${run.id}/artifacts?name=scorecard`
    const artifacts = yield* githubJson(ArtifactsSchema, artifactsPath)
    const artifact = artifacts.artifacts[0]
    if (artifact === undefined) {
      return yield* apiError(artifactsPath, `run ${run.id} has no scorecard artifact`)
    }
    const url = artifact.archive_download_url
    const zip = yield* githubGet(url).pipe(
      Effect.flatMap(ok(url)),
      Effect.flatMap((response) => response.arrayBuffer),
      Effect.mapError((cause) =>
        apiError('artifact download', issueOf(cause instanceof Error ? cause : unknownFailure))
      ),
    )
    return yield* zipEntry(Buffer.from(zip), 'scorecard.json')
  })

const successfulRuns = (repository: string): Effect.Effect<readonly WorkflowRun[] | undefined, GithubApiError> =>
  Effect.gen(function*() {
    const runsPath =
      `/repos/${repository}/actions/workflows/scorecard.yml/runs?branch=main&event=push&status=success&per_page=1`
    const listing = yield* githubGet(runsPath)
    if (listing.status === 404) return undefined
    const runs = yield* githubJson(WorkflowRunsSchema, runsPath)
    return runs.workflow_runs
  })

const mainScorecard = (args: readonly string[]) =>
  Effect.gen(function*() {
    const { values } = parseArgs({
      args: [...args],
      options: { repository: { type: 'string' }, out: { type: 'string' } },
      strict: true,
    })
    const repository = yield* required(values.repository, '--repository')
    const out = yield* required(values.out, '--out')
    const runs = yield* successfulRuns(repository)
    if (runs === undefined) return yield* Effect.log('main has no scorecard workflow yet: first baseline')
    const baseline = yield* mainBaselineOf(runs, (run) => artifactText(run, repository))
    if (Option.isNone(baseline)) return yield* Effect.log('no successful scorecard run on main: first baseline')
    const { run, text } = Option.getOrThrow(baseline)
    yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ScorecardDocumentSchema))(text).pipe(
      Effect.mapError((cause) =>
        malformed(`main's scorecard (run ${run.id})`, issueOf(cause instanceof Error ? cause : unknownFailure))
      ),
    )
    yield* writeText(out, text)
    yield* Effect.log(`main's scorecard from run ${run.id} (${run.head_sha})`)
  })

const required = (value: string | undefined, flag: string) =>
  value === undefined
    ? Effect.fail(malformed(flag, 'is required'))
    : Effect.succeed(value)

const commands: Readonly<Record<string, (args: readonly string[]) => Effect.Effect<void, DecideError>>> = {
  'aggregate': aggregate,
  'cache-check': cacheCheck,
  'main-scorecard': mainScorecard,
}

const [command = '', ...rest] = process.argv.slice(2)
const run = commands[command]
if (run === undefined) {
  process.stderr.write(`decide: unknown command ${command}; one of ${Object.keys(commands).join(', ')}\n`)
  process.exit(2)
}
const exit = await Effect.runPromiseExit(run(rest))
if (Exit.isFailure(exit)) {
  const detail = JSON.stringify(Cause.squash(exit.cause))
  process.stderr.write(`decide ${command}: ${Cause.pretty(exit.cause)} ${detail}\n`)
  process.exit(1)
}
