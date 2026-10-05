import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { measureStatic } from './families/static.ts'
import { arrayAt, numberAt, parseJson, type JsonValue } from './harness/decode.ts'
import { runCheck } from './harness/gates.ts'
import { git, type Instrument, loadInstrument } from './harness/instrument.ts'
import { familyResultOf, mainBaselineOf } from './harness/scorecard-codec.ts'
import { runJourneys } from './journeys.ts'
import { familyTimeoutMinutes, rowDefinitions } from './metrics/registry.ts'
import { ratstackCacheKey } from './model/cache-key.ts'
import type { Family, MainBaseline, MeasuredCell, RowId, Side } from './model/cell.ts'
import { planPinBump } from './model/plan-pin-bump.workflow.ts'
import { assembleScorecard, type CellsByRow, type FamilyResult, type SideCell } from './model/scorecard-document.ts'
import { renderSummary } from './model/summary-table.ts'

const usage = [
  'usage:',
  '  scorecard plan',
  '  scorecard measure --family <family> [--side ratstack|starter] [--out <file>] [--checkout <dir>]',
  '  scorecard aggregate --families <dir> [--main <scorecard.json>] --out <scorecard.json> --summary <file>',
  '  scorecard latest-main-run',
  '  scorecard pin check',
  '  scorecard pin write --commit <sha> --nar-hash <hash> [--checkout <dir>]',
  '  scorecard journeys [--checkout <dir>]',
  '  scorecard check [--checkout <dir>]   (import-graph rules, then journeys)',
].join('\n')

type FamilyRunner = (instrument: Instrument, work: string, sides: readonly Side[]) => Promise<FamilyResult>

const familyRunners: readonly (readonly [Family, FamilyRunner])[] = [['static', measureStatic]]

const implementedFamilies: readonly Family[] = familyRunners.map(([family]) => family)

const fail = (message: string): never => {
  throw new Error(`${message}\n${usage}`)
}

const writeOut = async (path: string | undefined, text: string): Promise<void> => {
  if (path === undefined) await Deno.stdout.write(new TextEncoder().encode(text))
  else await Deno.writeTextFile(path, text)
}

const firstHead = (lsRemote: string): string => {
  const first = lsRemote.split(/\s/u)[0]
  return first === undefined ? fail('ls-remote refs/heads/main printed nothing') : first
}

const sidesOf = (side: string | undefined): readonly Side[] => {
  if (side === undefined) return ['ratstack', 'starter']
  if (side === 'ratstack' || side === 'starter') return [side]
  return fail(`unknown side ${side}`)
}

const plan = async (): Promise<void> => {
  const instrument = await loadInstrument(undefined)
  const matrix = implementedFamilies.map((family) => ({
    family,
    timeoutMinutes: familyTimeoutMinutes[family],
    cacheKey: ratstackCacheKey({
      family,
      ratstackCommit: instrument.pin.commit,
      instrumentHash: instrument.instrumentHash,
      nixpkgsRev: instrument.nixpkgsRev,
    }),
  }))
  await writeOut(undefined, `${JSON.stringify({ include: matrix })}\n`)
}

const measure = async (args: readonly string[]): Promise<void> => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      family: { type: 'string' },
      side: { type: 'string' },
      out: { type: 'string' },
      checkout: { type: 'string' },
    },
    strict: true,
  })
  const family = values.family ?? fail('--family is required')
  const run = familyRunners.find(([name]) => name === family)?.[1] ?? fail(`unknown or unbuilt family ${family}`)
  const instrument = await loadInstrument(values.checkout)
  const work = await Deno.makeTempDir({ prefix: `scorecard-${family}-` })
  try {
    const result = await run(instrument, work, sidesOf(values.side))
    await writeOut(values.out, `${JSON.stringify(result, null, 2)}\n`)
  } finally {
    await Deno.remove(work, { recursive: true })
  }
}

const journeys = async (args: readonly string[]): Promise<void> => {
  const { values } = parseArgs({ args: [...args], options: { checkout: { type: 'string' } }, strict: true })
  const instrument = await loadInstrument(values.checkout)
  Deno.exit(await runJourneys(instrument, join(instrument.checkout, 'evals/ratstack-scorecard')))
}

const check = async (args: readonly string[]): Promise<void> => {
  const { values } = parseArgs({ args: [...args], options: { checkout: { type: 'string' } }, strict: true })
  const instrument = await loadInstrument(values.checkout)
  const root = join(instrument.checkout, 'evals/ratstack-scorecard')
  Deno.exit(await runCheck(instrument, root))
}

const readFamilyResults = async (dir: string): Promise<readonly FamilyResult[]> => {
  const results: FamilyResult[] = []
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith('.json')) continue
    const path = join(dir, entry.name)
    results.push(familyResultOf(parseJson(await Deno.readTextFile(path)), path))
  }
  return results
}

const mainBaseline = async (path: string | undefined): Promise<MainBaseline> => {
  if (path === undefined) return { _tag: 'Missing' }
  return mainBaselineOf(parseJson(await Deno.readTextFile(path)), path)
}

const cellsByRow = (cells: readonly SideCell[]): CellsByRow => {
  const byRow = new Map<RowId, Partial<Record<Side, MeasuredCell>>>()
  for (const cell of cells) {
    const row = byRow.get(cell.id) ?? {}
    row[cell.side] = cell.measured
    byRow.set(cell.id, row)
  }
  return Object.fromEntries(byRow)
}

const aggregate = async (args: readonly string[]): Promise<void> => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      families: { type: 'string' },
      main: { type: 'string' },
      out: { type: 'string' },
      summary: { type: 'string' },
    },
    strict: true,
  })
  const results = await readFamilyResults(values.families ?? fail('--families is required'))
  const cells = results.flatMap((result) => result.cells)
  const hashes = results.flatMap((result) => result.definitionHashes)
  const provenanceOf = (side: Side) => cells.find((cell) => cell.side === side)?.measured.provenance
  const starter = provenanceOf('starter')
  const ratstack = provenanceOf('ratstack')
  const any = starter ?? ratstack ?? fail(`no family results with cells in ${values.families}`)
  const doc = assembleScorecard({
    rows: rowDefinitions
      .filter((definition) => implementedFamilies.includes(definition.family))
      .map((definition) => ({
        definition,
        hash: hashes.find((hash) => hash.id === definition.id)?.hash ?? `no ${definition.family} result`,
      })),
    cells: cellsByRow(cells),
    flags: results.flatMap((result) => result.flags),
    provenance: {
      commit: starter?.commit ?? Deno.env.get('GITHUB_SHA') ?? 'unknown',
      ratstackCommit: ratstack?.commit ?? 'unknown',
      instrumentHash: any.instrumentHash,
      nixpkgsRev: any.nixpkgsRev,
      runner: any.runner,
      generatedAt: new Date().toISOString(),
    },
    main: await mainBaseline(values.main),
  })
  await writeOut(values.out ?? fail('--out is required'), `${JSON.stringify(doc, null, 2)}\n`)
  await writeOut(values.summary ?? fail('--summary is required'), renderSummary(doc))
  const failures = doc.ratchet.failures
  if (failures.length > 0) {
    console.error(`scorecard: ${failures.length} failing rows: ${failures.map((failure) => failure.id).join(', ')}`)
    Deno.exit(1)
  }
}

const runIdsOf = (value: JsonValue, what: string): readonly number[] =>
  arrayAt(value, ['workflow_runs'], what).map((run, index) => numberAt(run, ['id'], `${what}.workflow_runs[${index}].id`))

const latestMainRun = async (): Promise<void> => {
  const api = Deno.env.get('GITHUB_API_URL') ?? 'https://api.github.com'
  const repository = Deno.env.get('GITHUB_REPOSITORY') ?? fail('GITHUB_REPOSITORY is unset')
  const token = Deno.env.get('GITHUB_TOKEN') ?? fail('GITHUB_TOKEN is unset')
  const response = await fetch(
    `${api}/repos/${repository}/actions/workflows/scorecard.yml/runs?branch=main&event=push&status=success&per_page=1`,
    { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } },
  )
  if (response.status === 404) {
    await response.body?.cancel()
    await writeOut(undefined, '\n')
    return
  }
  if (!response.ok) fail(`listing scorecard runs failed: ${response.status} ${await response.text()}`)
  const runs = runIdsOf(parseJson(await response.text()), 'GitHub workflow runs')
  await writeOut(undefined, `${runs.join('')}\n`)
}

const pinCommand = async (args: readonly string[]): Promise<void> => {
  const [action, ...rest] = args
  const { values } = parseArgs({
    args: rest,
    options: { 'commit': { type: 'string' }, 'nar-hash': { type: 'string' }, 'checkout': { type: 'string' } },
    strict: true,
  })
  const instrument = await loadInstrument(values.checkout)
  if (action === 'check') {
    const remote = new TextDecoder().decode(
      await git(instrument.checkout, [
        'ls-remote',
        `https://github.com/${instrument.pin.owner}/${instrument.pin.repo}`,
        'refs/heads/main',
      ]),
    )
    await writeOut(undefined, `${JSON.stringify(planPinBump({ pinned: instrument.pin.commit, remoteHead: firstHead(remote) }))}\n`)
    return
  }
  if (action === 'write') {
    const pin = {
      ...instrument.pin,
      commit: values.commit ?? fail('--commit is required'),
      narHash: values['nar-hash'] ?? fail('--nar-hash is required'),
    }
    const path = join(instrument.checkout, 'evals/ratstack-scorecard/ratstack.pin.json')
    await Deno.writeTextFile(path, `${JSON.stringify(pin, null, 2)}\n`)
    return
  }
  fail(`unknown pin action ${action}`)
}

const commands: Readonly<Record<string, (args: readonly string[]) => Promise<void>>> = {
  'plan': () => plan(),
  'measure': measure,
  'aggregate': aggregate,
  'latest-main-run': () => latestMainRun(),
  'pin': pinCommand,
  'journeys': journeys,
  'check': check,
}

const [command, ...rest] = Deno.args
const handler = commands[command ?? '']
if (handler === undefined) {
  console.error(usage)
  Deno.exit(2)
}
await handler(rest)
