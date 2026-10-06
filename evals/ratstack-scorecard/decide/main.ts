import { Cause, Duration, Effect, Schedule, Schema } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { inflateRawSync } from 'node:zlib'
import { rowDefinitions } from '../src/metrics/registry.ts'
import type { Family, FamilyResult, MainBaseline, MeasuredCell, Side, SideCell } from '../src/model/cell.ts'
import { planPinBump } from '../src/model/plan-pin-bump.workflow.ts'
import { assembleScorecard, type CellsByRow } from '../src/model/scorecard-document.ts'
import { renderSummary } from '../src/model/summary-table.ts'
import {
  ArtifactsSchema,
  FamilyResultSchema,
  GitRefSchema,
  ScorecardDocumentSchema,
  WorkflowRunsSchema,
} from './schema.ts'

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
  cause: Schema.String,
}) {}

class RatchetFailed extends Schema.TaggedError<RatchetFailed>()('RatchetFailed', {
  rows: Schema.Array(Schema.String),
}) {}

class CacheUnusable extends Schema.TaggedError<CacheUnusable>()('CacheUnusable', {
  reason: Schema.String,
}) {}

const readText = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, 'utf8'),
    catch: (error) => new MalformedInput({ what: path, issue: String(error) }),
  })

const writeText = (path: string, text: string) =>
  Effect.promise(async () => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  })

const decodeFile = <A>(schema: Schema.Codec<A>, path: string) =>
  readText(path).pipe(
    Effect.flatMap((text) => Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text)),
    Effect.mapError((error) => new MalformedInput({ what: path, issue: String(error) })),
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
    if (any === undefined) return yield* new MalformedInput({ what: values.families ?? '', issue: 'no cells' })
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

const cacheCheck = (args: readonly string[]) =>
  Effect.gen(function*() {
    const { values } = parseArgs({ args: [...args], options: { file: { type: 'string' } }, strict: true })
    const result = yield* decodeFile(FamilyResultSchema, yield* required(values.file, '--file')).pipe(
      Effect.mapError((error) => new CacheUnusable({ reason: `${error.what}: ${error.issue}` })),
    )
    const broken = result.cells.filter((cell) =>
      cell.side === 'ratstack' && cell.measured.cell._tag === 'InstrumentError'
    )
    if (broken.length > 0) {
      return yield* new CacheUnusable({
        reason: `rat-stack instrument errors on ${broken.map((c) => c.id).join(', ')}`,
      })
    }
  })

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
    Effect.mapError((error) => new GithubApiError({ request: `GET ${path}`, cause: String(error) })),
    Effect.provide(FetchHttpClient.layer),
  )

const ok = (path: string) =>
(
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<HttpClientResponse.HttpClientResponse, GithubApiError> =>
  response.status >= 200 && response.status < 300
    ? Effect.succeed(response)
    : Effect.fail(new GithubApiError({ request: `GET ${path}`, cause: `status ${response.status}` }))

const github = (path: string) =>
  githubGet(path).pipe(
    Effect.flatMap(ok(path)),
    Effect.flatMap((response) => response.json),
    Effect.mapError((error) => new GithubApiError({ request: `GET ${path}`, cause: String(error) })),
  )

const decodeBody = <A>(schema: Schema.Codec<A>, what: string) => (body: unknown) =>
  Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError((error) => new GithubApiError({ request: what, cause: String(error) })),
  )

const zipEntry = (zip: Buffer, name: string) =>
  Effect.try({
    try: () => {
      const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
      const count = zip.readUInt16LE(end + 10)
      let entry = zip.readUInt32LE(end + 16)
      for (let index = 0; index < count; index++) {
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
        entry += 46 + nameLength + extraLength + commentLength
      }
      throw new Error(`no ${name} in the archive`)
    },
    catch: (error) => new GithubApiError({ request: `unzip ${name}`, cause: String(error) }),
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
    const runsPath =
      `/repos/${repository}/actions/workflows/scorecard.yml/runs?branch=main&event=push&status=success&per_page=1`
    const listing = yield* githubGet(runsPath)
    if (listing.status === 404) return yield* Effect.log('main has no scorecard workflow yet: first baseline')
    const runs = yield* ok(runsPath)(listing).pipe(
      Effect.flatMap((response) => response.json),
      Effect.mapError((error) => new GithubApiError({ request: `GET ${runsPath}`, cause: String(error) })),
      Effect.flatMap(decodeBody(WorkflowRunsSchema, `GET ${runsPath}`)),
    )
    const run = runs.workflow_runs[0]
    if (run === undefined) return yield* Effect.log('no successful scorecard run on main: first baseline')
    const artifactsPath = `/repos/${repository}/actions/runs/${run.id}/artifacts?name=scorecard`
    const artifacts = yield* github(artifactsPath).pipe(Effect.flatMap(decodeBody(ArtifactsSchema, artifactsPath)))
    const artifact = artifacts.artifacts[0]
    if (artifact === undefined) {
      return yield* new GithubApiError({ request: artifactsPath, cause: `run ${run.id} has no scorecard artifact` })
    }
    const zip = yield* githubGet(artifact.archive_download_url).pipe(
      Effect.flatMap(ok(artifact.archive_download_url)),
      Effect.flatMap((response) => response.arrayBuffer),
      Effect.mapError((error) => new GithubApiError({ request: 'artifact download', cause: String(error) })),
    )
    const text = yield* zipEntry(Buffer.from(zip), 'scorecard.json')
    yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ScorecardDocumentSchema))(text).pipe(
      Effect.mapError((error) =>
        new MalformedInput({ what: `main's scorecard (run ${run.id})`, issue: String(error) })
      ),
    )
    yield* writeText(out, text)
    yield* Effect.log(`main's scorecard from run ${run.id} (${run.head_sha})`)
  })

const pinCheck = (args: readonly string[]) =>
  Effect.gen(function*() {
    const { values } = parseArgs({
      args: [...args],
      options: { owner: { type: 'string' }, repo: { type: 'string' }, pinned: { type: 'string' } },
      strict: true,
    })
    const path = `/repos/${yield* required(values.owner, '--owner')}/${yield* required(
      values.repo,
      '--repo',
    )}/git/ref/heads/main`
    const ref = yield* github(path).pipe(Effect.flatMap(decodeBody(GitRefSchema, `GET ${path}`)))
    const plan = planPinBump({ pinned: yield* required(values.pinned, '--pinned'), remoteHead: ref.object.sha })
    yield* Effect.sync(() => process.stdout.write(`${JSON.stringify(plan)}\n`))
  })

const required = (value: string | undefined, flag: string) =>
  value === undefined
    ? Effect.fail(new MalformedInput({ what: flag, issue: 'is required' }))
    : Effect.succeed(value)

const commands: Readonly<Record<string, (args: readonly string[]) => Effect.Effect<void, unknown>>> = {
  'aggregate': aggregate,
  'cache-check': cacheCheck,
  'main-scorecard': mainScorecard,
  'pin-check': pinCheck,
}

const [command = '', ...rest] = process.argv.slice(2)
const run = commands[command]
if (run === undefined) {
  process.stderr.write(`decide: unknown command ${command}; one of ${Object.keys(commands).join(', ')}\n`)
  process.exit(2)
}
const exit = await Effect.runPromiseExit(run(rest))
if (exit._tag === 'Failure') {
  const error = Cause.squash(exit.cause)
  process.stderr.write(`decide ${command}: ${String(error)} ${JSON.stringify(error)}\n`)
  process.exit(1)
}
