import { join, relative } from 'node:path'
import { measureStatic } from './families/static.ts'
import { array, decodeJson, type Decoder, literal, nullable, string, struct, union } from './harness/decode.ts'
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
  readonly produce: MeasureStatic | Aggregate
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

const journeyEntry: Decoder<JourneyEntry> = struct({
  id: string,
  produce: union<MeasureStatic | Aggregate>(
    struct({
      kind: literal('measure-static'),
      ratstackRepo: string,
      starterRepo: string,
      failingTool: nullable(string),
    }),
    struct({ kind: literal('aggregate'), families: string, main: nullable(string) }),
  ),
  inputs: array(string),
})

const manifestOf = struct({ journeys: array(journeyEntry) })

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
  const failing = join(dir, 'src/tools', tool)
  await Deno.remove(failing)
  await Deno.writeTextFile(failing, 'process.exit(3)\n')
  return dir
}

interface Aggregate {
  readonly kind: 'aggregate'
  readonly families: string
  readonly main: string | null
}

const produceAggregate = async (
  instrument: Instrument,
  root: string,
  entry: JourneyEntry,
  spec: Aggregate,
): Promise<LauncherRecord> => {
  await Deno.mkdir(join(root, '.cache'), { recursive: true })
  const out = await Deno.makeTempDir({ dir: join(root, '.cache'), prefix: `journey-${entry.id}-` })
  const started = performance.now()
  try {
    const argv = [
      'aggregate',
      '--families',
      join(root, spec.families),
      ...(spec.main === null ? [] : ['--main', join(root, spec.main)]),
      '--out',
      join(out, 'scorecard.json'),
      '--summary',
      join(out, 'summary.md'),
    ]
    const run = await new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        '--no-config',
        '--allow-read',
        '--allow-write',
        '--allow-env',
        '--allow-sys=hostname',
        `--allow-run=git,${instrument.launcher.executable}`,
        join(root, 'src/main.ts'),
        ...argv,
      ],
      env: { ...Deno.env.toObject(), DENO_NO_PACKAGE_JSON: '1' },
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    const files: Record<string, string> = {}
    for (const name of ['scorecard.json', 'summary.md']) {
      const text = await Deno.readTextFile(join(out, name)).catch(() => undefined)
      if (text !== undefined) files[name] = text
    }
    return {
      id: entry.id,
      inputHash: '',
      argv: ['scorecard', ...argv.map((arg) => arg.startsWith(out) ? arg.slice(out.length + 1) : arg)],
      code: run.code,
      stdout: new TextDecoder().decode(run.stdout),
      stderr: new TextDecoder().decode(run.stderr),
      files,
      egressLog: null,
      wallMs: Math.round(performance.now() - started),
    }
  } finally {
    await Deno.remove(out, { recursive: true })
  }
}

const produceStatic = async (
  instrument: Instrument,
  root: string,
  entry: JourneyEntry,
  spec: MeasureStatic,
): Promise<LauncherRecord> => {
  const work = await Deno.makeTempDir({ prefix: `journey-${entry.id}-` })
  const started = performance.now()
  try {
    const ratstackSrc = await gitRepoFrom(join(root, spec.ratstackRepo), join(work, 'sources/ratstack'))
    const checkout = await gitRepoFrom(join(root, spec.starterRepo), join(work, 'sources/starter-checkout'))
    const project = join(work, 'project')
    await Deno.mkdir(project)
    const dir = spec.failingTool === null
      ? instrument.dir
      : await overlayWithFailingTool(instrument, work, spec.failingTool)
    const subject: Instrument = {
      ...instrument,
      dir,
      ratstackSrc,
      checkout,
      starterCommit: new TextDecoder().decode(await git(checkout, ['rev-parse', 'HEAD'])).trim(),
    }
    const result = await measureStatic(subject, project, ['ratstack', 'starter'])
    return {
      id: entry.id,
      inputHash: '',
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

const produce = async (instrument: Instrument, root: string, entry: JourneyEntry): Promise<LauncherRecord> => {
  const record = entry.produce.kind === 'aggregate'
    ? await produceAggregate(instrument, root, entry, entry.produce)
    : await produceStatic(instrument, root, entry, entry.produce)
  return { ...record, inputHash: await inputHashOf(root, entry.inputs, instrument.launcher.executable) }
}

export const runJourneys = async (instrument: Instrument, root: string): Promise<number> => {
  const { journeys: manifest } = decodeJson(
    manifestOf,
    await Deno.readTextFile(join(root, 'journeys/manifest.json')),
    'journeys/manifest.json',
  )
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
