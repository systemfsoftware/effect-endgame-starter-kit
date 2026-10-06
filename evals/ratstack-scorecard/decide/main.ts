import { Cause, Duration, Effect, Schedule, Schema } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { rowDefinitions } from '../src/metrics/registry.ts'
import type { Family, FamilyResult, MainBaseline, MeasuredCell, Side, SideCell } from '../src/model/cell.ts'
import { planPinBump } from '../src/model/plan-pin-bump.workflow.ts'
import { assembleScorecard, type CellsByRow } from '../src/model/scorecard-document.ts'
import { renderSummary } from '../src/model/summary-table.ts'
import { FamilyResultSchema, GitRefSchema, ScorecardDocumentSchema, WorkflowRunsSchema } from './schema.ts'

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

const writeText = (path: string, text: string) => Effect.promise(() => writeFile(path, text))

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

const github = (path: string) =>
  Effect.gen(function*() {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({ schedule: Schedule.exponential(Duration.seconds(1)), times: 3 }),
    )
    const token = process.env['GITHUB_TOKEN']
    const request = HttpClientRequest.get(`https://api.github.com${path}`).pipe(
      HttpClientRequest.acceptJson,
      (r) => token === undefined || token === '' ? r : HttpClientRequest.bearerToken(r, token),
    )
    return yield* client.execute(request).pipe(
      Effect.flatMap((response) => response.json),
      Effect.timeout(Duration.seconds(15)),
    )
  }).pipe(
    Effect.mapError((error) => new GithubApiError({ request: `GET ${path}`, cause: String(error) })),
    Effect.provide(FetchHttpClient.layer),
  )

const decodeBody = <A>(schema: Schema.Codec<A>, what: string) => (body: unknown) =>
  Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError((error) => new GithubApiError({ request: what, cause: String(error) })),
  )

const latestMainRun = (args: readonly string[]) =>
  Effect.gen(function*() {
    const { values } = parseArgs({ args: [...args], options: { repository: { type: 'string' } }, strict: true })
    const repository = yield* required(values.repository, '--repository')
    const path =
      `/repos/${repository}/actions/workflows/scorecard.yml/runs?branch=main&event=push&status=success&per_page=1`
    const runs = yield* github(path).pipe(Effect.flatMap(decodeBody(WorkflowRunsSchema, `GET ${path}`)))
    yield* Effect.sync(() => process.stdout.write(`${runs.workflow_runs.map((run) => run.id).join('')}\n`))
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
  'latest-main-run': latestMainRun,
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
