import { join, relative } from 'node:path'
import { measureStatic } from './families/static.ts'
import { arrayAt, at, type JsonValue, objectAt, parseJson, stringAt } from './harness/decode.ts'
import { git, type Instrument, walkFiles } from './harness/instrument.ts'
import { runSandboxed } from './harness/sandbox.ts'

interface MeasureStatic {
  readonly kind: 'measure-static'
  readonly ratstackRepo: string
  readonly starterRepo: string
  readonly failingTool: string | null
}

interface Aggregate {
  readonly kind: 'aggregate'
  readonly families: string
  readonly main: string | null
}

interface InstrumentRef {
  readonly kind: 'instrument-ref'
}

interface JourneyEntry {
  readonly id: string
  readonly produce: MeasureStatic | Aggregate | InstrumentRef
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

const isAbsent = (value: JsonValue | undefined): boolean => value === null || value === undefined

const optionalString = (produce: JsonValue, key: string, what: string): string | null =>
  isAbsent(at(produce, key)) ? null : stringAt(produce, [key], what)

const staticProduceOf = (produce: JsonValue): MeasureStatic => ({
  kind: 'measure-static',
  ratstackRepo: stringAt(produce, ['ratstackRepo'], 'journey produce'),
  starterRepo: stringAt(produce, ['starterRepo'], 'journey produce'),
  failingTool: optionalString(produce, 'failingTool', 'journey produce'),
})

const aggregateProduceOf = (produce: JsonValue): Aggregate => ({
  kind: 'aggregate',
  families: stringAt(produce, ['families'], 'journey produce'),
  main: optionalString(produce, 'main', 'journey produce'),
})

const producers: Readonly<Record<string, (produce: JsonValue) => MeasureStatic | Aggregate | InstrumentRef>> = {
  'aggregate': aggregateProduceOf,
  'instrument-ref': () => ({ kind: 'instrument-ref' }),
  'measure-static': staticProduceOf,
}

const unknownKind = (kind: string): never => {
  throw new Error(`journey produce: unknown kind ${kind}`)
}

const producerFor = (kind: string): (produce: JsonValue) => MeasureStatic | Aggregate | InstrumentRef =>
  producers[kind] ?? unknownKind(kind)

const produceOf = (produce: JsonValue): MeasureStatic | Aggregate | InstrumentRef =>
  producerFor(stringAt(produce, ['kind'], 'journey produce'))(produce)

const journeyEntry = (value: JsonValue): JourneyEntry => ({
  id: stringAt(value, ['id'], 'journey'),
  produce: produceOf(objectAt(value, ['produce'], 'journey')),
  inputs: arrayAt(value, ['inputs'], 'journey').map((input) => stringAt({ input }, ['input'], 'journey input')),
})

const encoder = new TextEncoder()

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

const under = (path: string, file: string): string => `${path}/${file}`

const filesUnder = async (root: string, path: string): Promise<readonly string[]> => {
  const info = await Deno.stat(join(root, path))
  return info.isFile ? [path] : (await walkFiles(join(root, path))).map((file) => under(path, file))
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

const journeyIdentity = ['-c', 'user.name=journey', '-c', 'user.email=journey@invalid', '-c', 'commit.gpgsign=false']

const gitRepoFrom = async (tree: string, target: string): Promise<string> => {
  await Deno.mkdir(target, { recursive: true })
  for (const file of await walkFiles(tree)) {
    await Deno.mkdir(join(target, file, '..'), { recursive: true })
    await Deno.copyFile(join(tree, file), join(target, file))
  }
  await git(target, ['init', '-q', '-b', 'main'])
  await git(target, ['add', '-A'])
  await git(target, [...journeyIdentity, 'commit', '-q', '-m', 'fixture'])
  return target
}

const skipOverlay = (file: string): boolean =>
  file.startsWith('node_modules/') || file.startsWith('journeys/__records__/')

const overlayFile = async (instrument: Instrument, dir: string, file: string): Promise<void> => {
  const target = join(dir, file)
  await Deno.mkdir(join(target, '..'), { recursive: true })
  await Deno.copyFile(join(instrument.dir, file), target)
}

const overlayWithFailingTool = async (instrument: Instrument, work: string, tool: string): Promise<string> => {
  const dir = join(work, 'instrument')
  const files = (await walkFiles(instrument.dir)).filter((file) => !skipOverlay(file))
  await Promise.all(files.map((file) => overlayFile(instrument, dir, file)))
  const failing = join(dir, 'src/tools', tool)
  await Deno.remove(failing)
  await Deno.writeTextFile(failing, 'process.exit(3)\n')
  return dir
}

const aggregateArgv = (root: string, out: string, spec: Aggregate): readonly string[] => [
  'aggregate',
  '--families',
  join(root, spec.families),
  ...(spec.main === null ? [] : ['--main', join(root, spec.main)]),
  '--out',
  join(out, 'scorecard.json'),
  '--summary',
  join(out, 'summary.md'),
]

const fileOrUndefined = async (out: string, name: string): Promise<readonly [string, string] | undefined> => {
  const text = await Deno.readTextFile(join(out, name)).catch(() => undefined)
  return text === undefined ? undefined : [name, text] as const
}

const producedFiles = async (out: string): Promise<Readonly<Record<string, string>>> => {
  const names = ['scorecard.json', 'summary.md']
  const found = await Promise.all(names.map((name) => fileOrUndefined(out, name)))
  return Object.fromEntries(found.filter((entry): entry is readonly [string, string] => entry !== undefined))
}

const producedArgv = (
  out: string,
  argv: readonly string[],
): readonly string[] => ['scorecard', ...argv.map((arg) => arg.startsWith(out) ? arg.slice(out.length + 1) : arg)]

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
    const argv = aggregateArgv(root, out, spec)
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
      env: { ...Deno.env.toObject(), DENO_NO_PACKAGE_JSON: '1', GITHUB_EVENT_NAME: 'push' },
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    return {
      id: entry.id,
      inputHash: '',
      argv: producedArgv(out, argv),
      code: run.code,
      stdout: new TextDecoder().decode(run.stdout),
      stderr: new TextDecoder().decode(run.stderr),
      files: await producedFiles(out),
      egressLog: null,
      wallMs: Math.round(performance.now() - started),
    }
  } finally {
    await Deno.remove(out, { recursive: true })
  }
}

const instrumentFor = async (instrument: Instrument, work: string, spec: MeasureStatic): Promise<string> =>
  spec.failingTool === null ? instrument.dir : await overlayWithFailingTool(instrument, work, spec.failingTool)

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
    const dir = await instrumentFor(instrument, work, spec)
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

const writeEntry = async (repo: string, path: string, content: string | null): Promise<void> => {
  if (content === null) return await Deno.remove(join(repo, path), { recursive: true })
  await Deno.mkdir(join(repo, path, '..'), { recursive: true })
  await Deno.writeTextFile(join(repo, path), content)
}

const commitTree = async (repo: string, files: Readonly<Record<string, string | null>>, message: string) => {
  await Promise.all(Object.entries(files).map(([path, content]) => writeEntry(repo, path, content)))
  await git(repo, ['add', '-A'])
  await git(repo, [...journeyIdentity, 'commit', '-q', '--allow-empty', '-m', message])
  return new TextDecoder().decode(await git(repo, ['rev-parse', 'HEAD'])).trim()
}

const refOf = (stdout: string): string | undefined => /^ref=(\S+)$/mu.exec(stdout)?.[1]

const readGraded = async (repo: string, ref: string): Promise<string | null> => {
  const show = await new Deno.Command('git', {
    args: ['show', `${ref}:evals/ratstack-scorecard/verdict`],
    cwd: repo,
    stdout: 'piped',
  }).output()
  return show.success ? new TextDecoder().decode(show.stdout).trim() : null
}

const gradedOf = async (repo: string, stdout: string): Promise<string | null> => {
  const ref = refOf(stdout)
  return ref === undefined ? null : await readGraded(repo, ref)
}

const instrumentRefCase = async (
  repo: string,
  root: string,
  name: string,
  base: string,
  head: string,
): Promise<readonly [string, string]> => {
  const run = await new Deno.Command('bash', {
    args: [join(root, 'ci/instrument-ref.sh'), base, head],
    cwd: repo,
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  const stdout = new TextDecoder().decode(run.stdout)
  return [
    `${name}.json`,
    JSON.stringify({
      code: run.code,
      stdout,
      stderr: new TextDecoder().decode(run.stderr),
      base,
      head,
      graded: await gradedOf(repo, stdout),
    }),
  ]
}

const produceInstrumentRef = async (root: string, entry: JourneyEntry): Promise<LauncherRecord> => {
  const repo = await Deno.makeTempDir({ prefix: `journey-${entry.id}-` })
  const started = performance.now()
  try {
    await git(repo, ['init', '-q', '-b', 'main'])
    const workflow = '.github/workflows/scorecard.yml'
    const verdict = 'evals/ratstack-scorecard/verdict'
    const baseWithout = await commitTree(repo, { 'README.md': 'starter\n' }, 'base without the scorecard')
    const introduce = await commitTree(
      repo,
      { [workflow]: 'name: Scorecard\n', [verdict]: 'green\n' },
      'add scorecard',
    )
    const baseWith = await commitTree(repo, { [verdict]: 'red\n' }, 'main instrument grades the row red')
    const editsInstrument = await commitTree(repo, { [verdict]: 'green\n' }, 'PR edits the instrument to green')
    await git(repo, ['checkout', '-q', baseWith])
    const deletesInstrument = await commitTree(
      repo,
      { 'evals/ratstack-scorecard': null },
      'PR deletes the instrument',
    )
    await git(repo, ['checkout', '-q', baseWith])
    const deletesWorkflow = await commitTree(
      repo,
      { [workflow]: null, [verdict]: 'green\n' },
      'PR deletes the workflow',
    )
    const cases: Readonly<Record<string, readonly [string, string]>> = {
      'bootstrap': [baseWithout, introduce],
      'edits-instrument': [baseWith, editsInstrument],
      'deletes-instrument': [baseWith, deletesInstrument],
      'deletes-workflow': [baseWith, deletesWorkflow],
      'base-missing': ['0'.repeat(40), editsInstrument],
    }
    const files = Object.fromEntries(
      await Promise.all(
        Object.entries(cases).map(([name, [base, head]]) => instrumentRefCase(repo, root, name, base, head)),
      ),
    )
    return {
      id: entry.id,
      inputHash: '',
      argv: ['bash', 'ci/instrument-ref.sh', '<base>', '<head>'],
      code: 0,
      stdout: '',
      stderr: '',
      files,
      egressLog: null,
      wallMs: Math.round(performance.now() - started),
    }
  } finally {
    await Deno.remove(repo, { recursive: true })
  }
}

const produceMeasured = (
  instrument: Instrument,
  root: string,
  entry: JourneyEntry,
  spec: MeasureStatic | Aggregate,
): Promise<LauncherRecord> =>
  spec.kind === 'aggregate'
    ? produceAggregate(instrument, root, entry, spec)
    : produceStatic(instrument, root, entry, spec)

const produceRecord = (instrument: Instrument, root: string, entry: JourneyEntry): Promise<LauncherRecord> =>
  entry.produce.kind === 'instrument-ref'
    ? produceInstrumentRef(root, entry)
    : produceMeasured(instrument, root, entry, entry.produce)

const produce = async (instrument: Instrument, root: string, entry: JourneyEntry): Promise<LauncherRecord> => {
  const record = await produceRecord(instrument, root, entry)
  return { ...record, inputHash: await inputHashOf(root, entry.inputs, instrument.launcher.executable) }
}

const recordsOf = async (
  instrument: Instrument,
  root: string,
  records: string,
  entries: readonly JourneyEntry[],
): Promise<void> => {
  for (const entry of entries) {
    const record = await produce(instrument, root, entry)
    await Deno.writeTextFile(join(records, `${entry.id}.json`), `${JSON.stringify(record, null, 2)}\n`)
    console.error(`journeys: produced ${entry.id} in ${record.wallMs} ms`)
  }
}

const relativeTo = (root: string): string => relative(Deno.cwd(), root) || '.'

export const runJourneys = async (instrument: Instrument, root: string): Promise<number> => {
  const manifest = arrayAt(
    parseJson(await Deno.readTextFile(join(root, 'journeys/manifest.json'))),
    ['journeys'],
    'journeys/manifest.json',
  ).map(journeyEntry)
  const records = join(root, 'journeys/__records__')
  await Deno.remove(records, { recursive: true }).catch(() => undefined)
  await Deno.mkdir(records, { recursive: true })
  await recordsOf(instrument, root, records, manifest)
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
  console.error(`journeys: vitest exited ${vitest.code} (${relativeTo(root)})`)
  return vitest.code
}
