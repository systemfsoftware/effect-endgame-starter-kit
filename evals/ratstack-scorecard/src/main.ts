import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { checkImports } from './check-imports.ts'
import { measureStatic } from './families/static.ts'
import { type Instrument, loadInstrument } from './harness/instrument.ts'
import { runSandboxed } from './harness/sandbox.ts'
import { runJourneys } from './journeys.ts'
import { familyTimeoutMinutes } from './metrics/registry.ts'
import { ratstackCacheKey } from './model/cache-key.ts'
import type { Family, FamilyResult, Side } from './model/cell.ts'

const usage = [
  'usage:',
  '  scorecard plan',
  '  scorecard measure --family <family> [--side ratstack|starter] [--out <file>] [--checkout <dir>]',
  '  scorecard aggregate --families <dir> [--main <scorecard.json>] --out <scorecard.json> --summary <file>',
  '  scorecard cache-check --file <family.json>',
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
  const violations = await checkImports(root)
  for (const violation of violations) console.error(`check-imports: ${violation}`)
  if (violations.length > 0) Deno.exit(1)
  console.error('check-imports: the host driver loads no third-party code; no model file imports the journey fixture')
  Deno.exit(await runJourneys(instrument, root))
}

const decide = async (
  instrument: Instrument,
  args: readonly string[],
  options: { readonly github: boolean },
): Promise<number> => {
  const root = join(instrument.checkout, 'evals/ratstack-scorecard')
  const install = await runSandboxed(instrument.launcher, {
    project: instrument.checkout,
    cwd: root,
    command: ['pnpm', 'install', '--frozen-lockfile'],
    pnpmStore: instrument.toolsStore,
    deadlineMs: 10 * 60_000,
  })
  if (install.code !== 0) fail(`installing the decide step's dependencies failed:\n${install.stderr}`)
  const token = Deno.env.get('GITHUB_TOKEN')
  const result = await runSandboxed(instrument.launcher, {
    project: instrument.checkout,
    cwd: Deno.cwd(),
    command: ['node', join(root, 'decide/main.ts'), ...args],
    ...(options.github ? { allowHosts: ['api.github.com'] } : {}),
    ...(options.github && token !== undefined ? { env: { GITHUB_TOKEN: token } } : {}),
    deadlineMs: 5 * 60_000,
  })
  await Deno.stdout.write(new TextEncoder().encode(result.stdout))
  await Deno.stderr.write(new TextEncoder().encode(result.stderr))
  return result.code
}

const aggregate = async (args: readonly string[]): Promise<void> => {
  const instrument = await loadInstrument(undefined)
  const commit = ['--commit', Deno.env.get('GITHUB_SHA') ?? instrument.starterCommit]
  Deno.exit(
    await decide(instrument, ['aggregate', '--implemented', implementedFamilies.join(','), ...commit, ...args], {
      github: false,
    }),
  )
}

const cacheCheck = async (args: readonly string[]): Promise<void> =>
  Deno.exit(await decide(await loadInstrument(undefined), ['cache-check', ...args], { github: false }))

const latestMainRun = async (): Promise<void> => {
  const repository = Deno.env.get('GITHUB_REPOSITORY') ?? fail('GITHUB_REPOSITORY is unset')
  Deno.exit(
    await decide(await loadInstrument(undefined), ['latest-main-run', '--repository', repository], { github: true }),
  )
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
      await decide(instrument, ['pin-check', '--owner', owner, '--repo', repo, '--pinned', commit], { github: true }),
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
  'plan': () => plan(),
  'measure': measure,
  'aggregate': aggregate,
  'cache-check': cacheCheck,
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
