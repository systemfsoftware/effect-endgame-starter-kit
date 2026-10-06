import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { measureStatic } from './families/static.ts'
import { decide, type DecideWork, prepareDecide } from './harness/decide.ts'
import { runCheck } from './harness/gates.ts'
import { type Instrument, loadInstrument, walkFiles } from './harness/instrument.ts'
import { runJourneys } from './journeys.ts'
import { ratstackCacheKey } from './model/cache-key.ts'
import type { Family, Side } from './model/cell.ts'
import type { FamilyResult } from './model/scorecard-document.ts'

const usage = [
  'usage:',
  '  scorecard ci [--checkout <dir>] --cache <dir> --out <dir> [--main <scorecard.json>] [--title <text>]',
  '  scorecard measure --family <family> [--side ratstack|starter] [--out <file>] [--checkout <dir>]',
  '  scorecard aggregate --families <dir> [--main <scorecard.json>] --out <scorecard.json> --summary <file>',
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

const required = (value: string | undefined, message: string): string => value ?? fail(message)

const writeOut = async (path: string | undefined, text: string): Promise<void> => {
  if (path === undefined) await Deno.stdout.write(new TextEncoder().encode(text))
  else await Deno.writeTextFile(path, text)
}

const sideSets: Readonly<Record<string, readonly Side[]>> = {
  'ratstack': ['ratstack'],
  'starter': ['starter'],
  'all': ['ratstack', 'starter'],
}

const sideSet = (key: string): readonly Side[] => sideSets[key] ?? fail(`unknown side ${key}`)

const sidesOf = (side: string | undefined): readonly Side[] => sideSet(side ?? 'all')

const findRunner = (family: string): FamilyRunner | undefined => familyRunners.find(([name]) => name === family)?.[1]

const runnerFor = (family: string): FamilyRunner => findRunner(family) ?? fail(`unknown or unbuilt family ${family}`)

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
  const family = required(values.family, '--family is required')
  const run = runnerFor(family)
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

const exists = (path: string): Promise<boolean> => Deno.stat(path).then(() => true, () => false)

const copyInto = async (from: string, to: string): Promise<void> => {
  await Deno.mkdir(join(to, '..'), { recursive: true })
  await Deno.copyFile(from, to)
}

const copyIfExists = async (from: string, to: string): Promise<void> => {
  if (await exists(from)) await copyInto(from, to)
}

const withDecide = async <T>(instrument: Instrument, run: (work: DecideWork) => Promise<T>): Promise<T> => {
  const work = await Deno.makeTempDir({ prefix: 'scorecard-decide-' })
  try {
    return await run(await prepareDecide(instrument, work))
  } finally {
    await Deno.remove(work, { recursive: true })
  }
}

const mainArgs = (main: boolean): readonly string[] => main ? ['--main', 'main/scorecard.json'] : []

const aggregateIn = (work: DecideWork, instrument: Instrument, main: boolean): Promise<number> =>
  decide(
    work,
    [
      'aggregate',
      '--families',
      'families',
      '--implemented',
      implementedFamilies.join(','),
      '--commit',
      Deno.env.get('GITHUB_SHA') ?? instrument.starterCommit,
      ...mainArgs(main),
      '--out',
      'out/scorecard.json',
      '--summary',
      'out/summary.md',
    ],
    { github: false },
  )

const copyFamilies = async (families: string, work: string): Promise<void> => {
  for (const file of await walkFiles(families)) await copyInto(join(families, file), join(work, 'families', file))
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
  const families = required(values.families, '--families is required')
  const out = required(values.out, '--out is required')
  const summary = required(values.summary, '--summary is required')
  const instrument = await loadInstrument(undefined)
  Deno.exit(
    await withDecide(instrument, async (work) => {
      await copyFamilies(families, work.work)
      if (values.main !== undefined) await copyInto(values.main, join(work.work, 'main/scorecard.json'))
      const code = await aggregateIn(work, instrument, values.main !== undefined)
      await copyIfExists(join(work.work, 'out/scorecard.json'), out)
      await copyIfExists(join(work.work, 'out/summary.md'), summary)
      return code
    }),
  )
}

const cacheKeyFile = (instrument: Instrument, family: Family): string =>
  ratstackCacheKey({
    family,
    ratstackCommit: instrument.pin.commit,
    instrumentHash: instrument.instrumentHash,
    nixpkgsRev: instrument.nixpkgsRev,
  }).replaceAll('/', '__') + '.json'

const cacheCheckFile = (family: Family): readonly string[] => [
  'cache-check',
  '--file',
  `families/ratstack-${family}.json`,
]

const cachedRatstack = async (
  work: DecideWork,
  instrument: Instrument,
  family: Family,
  cache: string,
  ratstackFile: string,
): Promise<boolean> => {
  const cached = join(cache, cacheKeyFile(instrument, family))
  if (!await exists(cached)) return false
  await copyInto(cached, ratstackFile)
  return await decide(work, cacheCheckFile(family), { github: false }) === 0
}

const measureInto = async (
  instrument: Instrument,
  run: FamilyRunner,
  family: Family,
  sides: readonly Side[],
  file: string,
): Promise<void> => {
  const work = await Deno.makeTempDir({ prefix: `scorecard-${family}-` })
  try {
    await Deno.writeTextFile(file, `${JSON.stringify(await run(instrument, work, sides), null, 2)}\n`)
  } finally {
    await Deno.remove(work, { recursive: true })
  }
}

const keepRatstack = async (
  work: DecideWork,
  instrument: Instrument,
  family: Family,
  cache: string,
  ratstackFile: string,
): Promise<void> => {
  const usable = await decide(work, cacheCheckFile(family), { github: false }) === 0
  if (usable) await copyInto(ratstackFile, join(cache, cacheKeyFile(instrument, family)))
}

const saveRatstack = async (
  work: DecideWork,
  instrument: Instrument,
  family: Family,
  cache: string,
  ratstackFile: string,
  pullRequest: boolean,
): Promise<void> => {
  if (pullRequest) return
  await keepRatstack(work, instrument, family, cache, ratstackFile)
}

const measureFamily = async (
  work: DecideWork,
  instrument: Instrument,
  family: Family,
  run: FamilyRunner,
  cache: string,
  pullRequest: boolean,
): Promise<void> => {
  const families = join(work.work, 'families')
  const ratstackFile = join(families, `ratstack-${family}.json`)
  if (await cachedRatstack(work, instrument, family, cache, ratstackFile)) return
  await measureInto(instrument, run, family, ['ratstack'], ratstackFile)
  await saveRatstack(work, instrument, family, cache, ratstackFile, pullRequest)
  await measureInto(instrument, run, family, ['starter'], join(families, `starter-${family}.json`))
}

const measureFamilies = async (
  work: DecideWork,
  instrument: Instrument,
  cache: string,
  pullRequest: boolean,
): Promise<readonly string[]> => {
  const families = join(work.work, 'families')
  await Deno.mkdir(families, { recursive: true })
  for (const [family, run] of familyRunners) {
    await measureFamily(work, instrument, family, run, cache, pullRequest)
  }
  return familyRunners.map(([family]) => cacheKeyFile(instrument, family))
}

const stale = (keys: readonly string[], file: string): boolean => !keys.includes(file)

const pruneCache = async (cache: string, keys: readonly string[]): Promise<void> => {
  const files = (await walkFiles(cache)).filter((file) => stale(keys, file))
  await Promise.all(files.map((file) => Deno.remove(join(cache, file))))
}

const copyMain = async (main: string, work: DecideWork): Promise<boolean> => {
  await copyInto(main, join(work.work, 'main/scorecard.json'))
  return true
}

const repositoryOf = (): string => Deno.env.get('GITHUB_REPOSITORY') ?? fail('GITHUB_REPOSITORY is unset')

const fetchMain = async (work: DecideWork): Promise<boolean> => {
  await Deno.mkdir(join(work.work, 'main'), { recursive: true })
  const code = await decide(work, [
    'main-scorecard',
    '--repository',
    repositoryOf(),
    '--out',
    'main/scorecard.json',
  ], { github: true })
  if (code !== 0) fail("finding main's scorecard failed")
  return await exists(join(work.work, 'main/scorecard.json'))
}

const mainBaselineIn = (work: DecideWork, main: string | undefined): Promise<boolean> =>
  main === undefined ? fetchMain(work) : copyMain(main, work)

const copyOutputs = async (work: DecideWork, out: string): Promise<void> => {
  await Deno.mkdir(out, { recursive: true })
  const names = ['scorecard.json', 'summary.md']
  await Promise.all(names.map((name) => copyIfExists(join(work.work, 'out', name), join(out, name))))
}

const collect = (instrument: Instrument, cache: string, out: string, main: string | undefined, pr: boolean) =>
  withDecide(instrument, async (work) => {
    const keys = await measureFamilies(work, instrument, cache, pr)
    if (!pr) await pruneCache(cache, keys)
    const verdict = await aggregateIn(work, instrument, await mainBaselineIn(work, main))
    await copyOutputs(work, out)
    return verdict
  })

const summaryTitle = (title: string | undefined): string => title === undefined ? '' : `## ${title}\n\n`

const appendSummary = async (summaryFile: string, out: string, title: string | undefined): Promise<void> => {
  if (!await exists(join(out, 'summary.md'))) return
  const text = await Deno.readTextFile(join(out, 'summary.md'))
  await Deno.writeTextFile(summaryFile, `${summaryTitle(title)}${text}\n`, { append: true })
}

const writeSummary = async (out: string, title: string | undefined): Promise<void> => {
  const summaryFile = Deno.env.get('GITHUB_STEP_SUMMARY')
  if (summaryFile === undefined) return
  await appendSummary(summaryFile, out, title)
}

const ci = async (args: readonly string[]): Promise<void> => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      checkout: { type: 'string' },
      cache: { type: 'string' },
      out: { type: 'string' },
      main: { type: 'string' },
      title: { type: 'string' },
    },
    strict: true,
  })
  const cache = required(values.cache, '--cache is required')
  const out = required(values.out, '--out is required')
  const pullRequest = Deno.env.get('GITHUB_EVENT_NAME') === 'pull_request'
  const instrument = await loadInstrument(values.checkout)
  await Deno.mkdir(cache, { recursive: true })
  const code = await collect(instrument, cache, out, values.main, pullRequest)
  await writeSummary(out, values.title)
  Deno.exit(code)
}

const pinFileName = (instrument: Instrument): string =>
  join(instrument.checkout, 'evals/ratstack-scorecard/ratstack.pin.json')

interface PinValues {
  readonly commit?: string
  readonly 'nar-hash'?: string
  readonly checkout?: string
}

const writePin = async (instrument: Instrument, values: PinValues): Promise<void> => {
  const pin = {
    ...instrument.pin,
    commit: required(values.commit, '--commit is required'),
    narHash: required(values['nar-hash'], '--nar-hash is required'),
  }
  await Deno.writeTextFile(pinFileName(instrument), `${JSON.stringify(pin, null, 2)}\n`)
}

const checkPin = async (instrument: Instrument): Promise<void> => {
  const { owner, repo, commit } = instrument.pin
  Deno.exit(
    await withDecide(
      instrument,
      (work) => decide(work, ['pin-check', '--owner', owner, '--repo', repo, '--pinned', commit], { github: true }),
    ),
  )
}

const pinActions = (instrument: Instrument, values: PinValues): Readonly<Record<string, () => Promise<void>>> => ({
  'check': () => checkPin(instrument),
  'write': () => writePin(instrument, values),
})

const unknownAction = (action: string | undefined): () => Promise<void> => () => fail(`unknown pin action ${action}`)

const actionKey = (action: string | undefined): string => action ?? ''

const pinCommand = async (args: readonly string[]): Promise<void> => {
  const [action, ...rest] = args
  const { values } = parseArgs({
    args: rest,
    options: { 'commit': { type: 'string' }, 'nar-hash': { type: 'string' }, 'checkout': { type: 'string' } },
    strict: true,
  })
  const instrument = await loadInstrument(values.checkout)
  const actions = pinActions(instrument, values)
  await (actions[actionKey(action)] ?? unknownAction(action))()
}

const commands: Readonly<Record<string, (args: readonly string[]) => Promise<void>>> = {
  'ci': ci,
  'measure': measure,
  'aggregate': aggregate,
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
