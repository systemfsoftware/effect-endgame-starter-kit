import { join, relative } from 'node:path'
import { measureStatic } from './families/static.ts'
import { arrayAt, at, stringAt } from './harness/decode.ts'
import { git, type Instrument, walkFiles } from './harness/instrument.ts'
import { runSandboxed } from './harness/sandbox.ts'

interface MeasureStatic {
  readonly kind: 'measure-static'
  readonly ratstackRepo: string
  readonly starterRepo: string
  readonly failingTool: string | null
}

interface JourneyEntry {
  readonly id: string
  readonly produce: MeasureStatic
  readonly inputs: readonly string[]
}

export interface LauncherRecord {
  readonly id: string
  readonly inputHash: string
  readonly argv: readonly string[]
  readonly code: number
  readonly stdout: string
  readonly stderr: string
  readonly files: Readonly<Record<string, string>>
  readonly egressLog: null
  readonly wallMs: number
}

const journeyEntry = (value: unknown): JourneyEntry => {
  const produce = at(value, 'produce')
  const failingTool = at(produce, 'failingTool')
  return {
    id: stringAt(value, ['id'], 'journey'),
    produce: {
      kind: 'measure-static',
      ratstackRepo: stringAt(produce, ['ratstackRepo'], 'journey produce'),
      starterRepo: stringAt(produce, ['starterRepo'], 'journey produce'),
      failingTool: failingTool === null ? null : stringAt(produce, ['failingTool'], 'journey produce'),
    },
    inputs: arrayAt(value, ['inputs'], 'journey').map((input) => stringAt({ input }, ['input'], 'journey input')),
  }
}

const encoder = new TextEncoder()

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

const filesUnder = async (root: string, path: string): Promise<readonly string[]> => {
  const info = await Deno.stat(join(root, path))
  if (info.isFile) return [path]
  return (await walkFiles(join(root, path))).map((file) => `${path}/${file}`)
}

export const inputHashOf = async (root: string, inputs: readonly string[], launcher: string): Promise<string> => {
  const files = (await Promise.all(inputs.map((input) => filesUnder(root, input)))).flat().sort()
  const parts = await Promise.all(
    files.map(async (file) =>
      `${file}\0${hex(await crypto.subtle.digest('SHA-256', await Deno.readFile(join(root, file))))}`
    ),
  )
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode([launcher, ...parts].join('\n'))))
}

const gitRepoFrom = async (tree: string, target: string): Promise<string> => {
  await Deno.mkdir(target, { recursive: true })
  for (const file of await walkFiles(tree)) {
    await Deno.mkdir(join(target, file, '..'), { recursive: true })
    await Deno.copyFile(join(tree, file), join(target, file))
  }
  const identity = ['-c', 'user.name=journey', '-c', 'user.email=journey@invalid', '-c', 'commit.gpgsign=false']
  await git(target, ['init', '-q', '-b', 'main'])
  await git(target, ['add', '-A'])
  await git(target, [...identity, 'commit', '-q', '-m', 'fixture'])
  return target
}

const overlayWithFailingTool = async (instrument: Instrument, work: string, tool: string): Promise<string> => {
  const dir = join(work, 'instrument')
  for (const file of await walkFiles(instrument.dir)) {
    if (file.startsWith('node_modules/') || file.startsWith('journeys/__records__/')) continue
    await Deno.mkdir(join(dir, file, '..'), { recursive: true })
    await Deno.copyFile(join(instrument.dir, file), join(dir, file))
  }
  await Deno.writeTextFile(join(dir, 'src/tools', tool), 'process.exit(3)\n')
  return dir
}

const produce = async (instrument: Instrument, root: string, entry: JourneyEntry): Promise<LauncherRecord> => {
  const work = await Deno.makeTempDir({ prefix: `journey-${entry.id}-` })
  const started = performance.now()
  try {
    const ratstackSrc = await gitRepoFrom(join(root, entry.produce.ratstackRepo), join(work, 'ratstack'))
    const checkout = await gitRepoFrom(join(root, entry.produce.starterRepo), join(work, 'starter-checkout'))
    const dir = entry.produce.failingTool === null
      ? instrument.dir
      : await overlayWithFailingTool(instrument, work, entry.produce.failingTool)
    const subject: Instrument = {
      ...instrument,
      dir,
      ratstackSrc,
      checkout,
      starterCommit: new TextDecoder().decode(await git(checkout, ['rev-parse', 'HEAD'])).trim(),
    }
    const result = await measureStatic(subject, work, ['ratstack', 'starter'])
    return {
      id: entry.id,
      inputHash: await inputHashOf(root, entry.inputs, instrument.launcher.executable),
      argv: ['scorecard', 'measure', '--family', 'static'],
      code: 0,
      stdout: '',
      stderr: '',
      files: { 'family.json': JSON.stringify(result) },
      egressLog: null,
      wallMs: Math.round(performance.now() - started),
    }
  } finally {
    await Deno.remove(work, { recursive: true })
  }
}

export const runJourneys = async (instrument: Instrument, root: string): Promise<number> => {
  const manifest = arrayAt(JSON.parse(await Deno.readTextFile(join(root, 'journeys/manifest.json'))), [
    'journeys',
  ], 'journeys/manifest.json').map(journeyEntry)
  const records = join(root, 'journeys/__records__')
  await Deno.remove(records, { recursive: true }).catch(() => undefined)
  await Deno.mkdir(records, { recursive: true })
  for (const entry of manifest) {
    const record = await produce(instrument, root, entry)
    await Deno.writeTextFile(join(records, `${entry.id}.json`), `${JSON.stringify(record, null, 2)}\n`)
    console.error(`journeys: produced ${entry.id} in ${record.wallMs} ms`)
  }
  const install = await runSandboxed(instrument.launcher, {
    project: root,
    cwd: root,
    command: ['pnpm', 'install', '--frozen-lockfile'],
    pnpmStore: instrument.toolsStore,
    deadlineMs: 10 * 60_000,
  })
  if (install.code !== 0) throw new Error(`installing the instrument's test tools failed:\n${install.stderr}`)
  const vitest = await runSandboxed(instrument.launcher, {
    project: root,
    cwd: root,
    command: ['pnpm', 'exec', 'vitest', 'run'],
    env: { SCORECARD_LAUNCHER: instrument.launcher.executable },
    deadlineMs: 30 * 60_000,
  })
  await Deno.stdout.write(encoder.encode(vitest.stdout))
  await Deno.stderr.write(encoder.encode(vitest.stderr))
  console.error(`journeys: vitest exited ${vitest.code} (${relative(Deno.cwd(), root) || '.'})`)
  return vitest.code
}
