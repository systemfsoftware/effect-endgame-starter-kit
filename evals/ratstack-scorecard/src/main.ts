import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { checkImports } from './check-imports.ts'
import { measureStatic } from './families/static.ts'
import { decide, type DecideWork, prepareDecide } from './harness/decide.ts'
import { type Instrument, loadInstrument, walkFiles } from './harness/instrument.ts'
import { runJourneys } from './journeys.ts'
import { ratstackCacheKey } from './model/cache-key.ts'
import type { Family, FamilyResult, Side } from './model/cell.ts'

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

const writeOut = async (path: string | undefined, text: string): Promise<void> => {
  if (path === undefined) await Deno.stdout.write(new TextEncoder().encode(text))
  else await Deno.writeTextFile(path, text)
}

const sidesOf = (side: string | undefined): readonly Side[] => {
  if (side === undefined) return ['ratstack', 'starter']
  if (side === 'ratstack' || side === 'starter') return [side]
  return fail(`unknown side ${side}`)
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
  const violations = await checkImports(root)
  for (const violation of violations) console.error(`check-imports: ${violation}`)
  if (violations.length > 0) Deno.exit(1)
  console.error('check-imports: the host driver loads no third-party code; no model file imports the journey fixture')
  Deno.exit(await runJourneys(instrument, root))
}

const exists = (path: string): Promise<boolean> => Deno.stat(path).then(() => true, () => false)

const copyInto = async (from: string, to: string): Promise<void> => {
  await Deno.mkdir(join(to, '..'), { recursive: true })
  await Deno.copyFile(from, to)
}

const withDecide = async <T>(instrument: Instrument, run: (work: DecideWork) => Promise<T>): Promise<T> => {
  const work = await Deno.makeTempDir({ prefix: 'scorecard-decide-' })
  try {
    return await run(await prepareDecide(instrument, work))
  } finally {
    await Deno.remove(work, { recursive: true })
  }
}

const aggregateIn = (work: DecideWork, instrument: Instrument, main: boolean): Promise<number> =>
  decide(work, [
    'aggregate',
    '--families',
    'families',
    '--implemented',
    implementedFamilies.join(','),
    '--commit',
    Deno.env.get('GITHUB_SHA') ?? instrument.starterCommit,
    ...(main ? ['--main', 'main/scorecard.json'] : []),
    '--out',
    'out/scorecard.json',
    '--summary',
    'out/summary.md',
  ], { github: false })

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
  const families = values.families ?? fail('--families is required')
  const out = values.out ?? fail('--out is required')
  const summary = values.summary ?? fail('--summary is required')
  const instrument = await loadInstrument(undefined)
  Deno.exit(
    await withDecide(instrument, async (work) => {
      for (const file of await walkFiles(families)) {
        await copyInto(join(families, file), join(work.work, 'families', file))
      }
      if (values.main !== undefined) await copyInto(values.main, join(work.work, 'main/scorecard.json'))
      const code = await aggregateIn(work, instrument, values.main !== undefined)
      if (await exists(join(work.work, 'out/scorecard.json'))) {
        await copyInto(join(work.work, 'out/scorecard.json'), out)
      }
      if (await exists(join(work.work, 'out/summary.md'))) await copyInto(join(work.work, 'out/summary.md'), summary)
      return code
    }),
  )
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
  const cache = values.cache ?? fail('--cache is required')
  const out = values.out ?? fail('--out is required')
  const pullRequest = Deno.env.get('GITHUB_EVENT_NAME') === 'pull_request'
  const instrument = await loadInstrument(values.checkout)
  await Deno.mkdir(cache, { recursive: true })
  const code = await withDecide(instrument, async (work) => {
    const families = join(work.work, 'families')
    await Deno.mkdir(families, { recursive: true })
    const keys: string[] = []
    for (const [family, run] of familyRunners) {
      const key = ratstackCacheKey({
        family,
        ratstackCommit: instrument.pin.commit,
        instrumentHash: instrument.instrumentHash,
        nixpkgsRev: instrument.nixpkgsRev,
      }).replaceAll('/', '__')
      keys.push(`${key}.json`)
      const cached = join(cache, `${key}.json`)
      const ratstackFile = join(families, `ratstack-${family}.json`)
      const usable = await exists(cached) &&
        (await copyInto(cached, ratstackFile),
          (await decide(work, ['cache-check', '--file', `families/ratstack-${family}.json`], { github: false })) === 0)
      if (!usable) {
        if (await exists(cached)) console.error(`ci: cached rat-stack ${family} side refused; measuring it again`)
        await measureInto(instrument, run, family, ['ratstack'], ratstackFile)
        const savable = !pullRequest &&
          (await decide(work, ['cache-check', '--file', `families/ratstack-${family}.json`], { github: false })) === 0
        if (savable) await copyInto(ratstackFile, cached)
      }
      await measureInto(instrument, run, family, ['starter'], join(families, `starter-${family}.json`))
    }
    if (!pullRequest) {
      for (const file of await walkFiles(cache)) if (!keys.includes(file)) await Deno.remove(join(cache, file))
    }
    const main = values.main !== undefined
      ? (await copyInto(values.main, join(work.work, 'main/scorecard.json')), true)
      : (await Deno.mkdir(join(work.work, 'main'), { recursive: true }),
        (await decide(work, [
            'main-scorecard',
            '--repository',
            Deno.env.get('GITHUB_REPOSITORY') ?? fail('GITHUB_REPOSITORY is unset'),
            '--out',
            'main/scorecard.json',
          ], { github: true })) === 0 || fail("finding main's scorecard failed"),
        await exists(join(work.work, 'main/scorecard.json')))
    const verdict = await aggregateIn(work, instrument, main)
    await Deno.mkdir(out, { recursive: true })
    for (const file of ['scorecard.json', 'summary.md']) {
      if (await exists(join(work.work, 'out', file))) await copyInto(join(work.work, 'out', file), join(out, file))
    }
    return verdict
  })
  const summaryFile = Deno.env.get('GITHUB_STEP_SUMMARY')
  if (summaryFile !== undefined && await exists(join(out, 'summary.md'))) {
    const title = values.title === undefined ? '' : `## ${values.title}\n\n`
    await Deno.writeTextFile(summaryFile, `${title}${await Deno.readTextFile(join(out, 'summary.md'))}\n`, {
      append: true,
    })
  }
  Deno.exit(code)
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

const pinCommand = async (args: readonly string[]): Promise<void> => {
  const [action, ...rest] = args
  const { values } = parseArgs({
    args: rest,
    options: { 'commit': { type: 'string' }, 'nar-hash': { type: 'string' }, 'checkout': { type: 'string' } },
    strict: true,
  })
  const instrument = await loadInstrument(values.checkout)
  if (action === 'check') {
    const { owner, repo, commit } = instrument.pin
    Deno.exit(
      await withDecide(
        instrument,
        (work) => decide(work, ['pin-check', '--owner', owner, '--repo', repo, '--pinned', commit], { github: true }),
      ),
    )
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
