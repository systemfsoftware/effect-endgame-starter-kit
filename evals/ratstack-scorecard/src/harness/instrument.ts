import { dirname, join } from 'node:path'
import { rowDefinitions } from '../metrics/registry.ts'
import type { CellProvenance, Family, RowId, Side } from '../model/cell.ts'
import { type JsonValue, optionalEntriesAt, parseJson, stringAt } from './decode.ts'
import { type Launcher, runSandboxed } from './sandbox.ts'

export interface Pin {
  readonly owner: string
  readonly repo: string
  readonly commit: string
  readonly narHash: string
}

export interface Instrument {
  readonly dir: string
  readonly launcher: Launcher
  readonly toolsStore: string
  readonly ratstackSrc: string
  readonly checkout: string
  readonly pin: Pin
  readonly instrumentHash: string
  readonly nixpkgsRev: string
  readonly runner: string
  readonly starterCommit: string
  readonly toolVersions: Readonly<Record<string, string>>
}

const decoder = new TextDecoder()

const present = (value: string | undefined): value is string => value !== undefined && value !== ''

const required = (name: string): string => {
  const value = Deno.env.get(name)
  if (present(value)) return value
  throw new Error(`${name} is unset: run the scorecard through the flake's \`scorecard\` package`)
}

export const git = async (cwd: string, args: readonly string[]): Promise<Uint8Array> => {
  const output = await new Deno.Command('git', { args: [...args], cwd, stdout: 'piped', stderr: 'piped' }).output()
  if (!output.success) throw new Error(`git ${args.join(' ')} failed: ${decoder.decode(output.stderr)}`)
  return output.stdout
}

const gitText = async (cwd: string, args: readonly string[]): Promise<string> =>
  decoder.decode(await git(cwd, args)).trim()

const readJson = async (path: string): Promise<JsonValue> => parseJson(await Deno.readTextFile(path))

const nixpkgsRevOf = (lock: JsonValue): string => stringAt(lock, ['nodes', 'nixpkgs', 'locked', 'rev'], 'flake.lock')

const pinOf = (pin: JsonValue): Pin => ({
  owner: stringAt(pin, ['owner'], 'ratstack.pin.json'),
  repo: stringAt(pin, ['repo'], 'ratstack.pin.json'),
  commit: stringAt(pin, ['commit'], 'ratstack.pin.json'),
  narHash: stringAt(pin, ['narHash'], 'ratstack.pin.json'),
})

const dependencyVersion = (name: string, version: JsonValue): string => {
  if (typeof version === 'string') return version
  throw new Error(`package.json dependency ${name} is not a string`)
}

const dependencyVersions = (manifest: JsonValue): Record<string, string> =>
  Object.fromEntries(
    optionalEntriesAt(manifest, ['dependencies']).map(([name, version]) => [name, dependencyVersion(name, version)]),
  )

const runnerName = (): string => Deno.env.get('RUNNER_NAME') ?? Deno.hostname()

const checkoutOf = (arg: string | undefined): string => arg ?? Deno.cwd()

export const loadInstrument = async (checkoutArg: string | undefined): Promise<Instrument> => {
  const dir = required('SCORECARD_INSTRUMENT')
  const checkout = await gitText(checkoutOf(checkoutArg), ['rev-parse', '--show-toplevel'])
  return {
    dir,
    launcher: { executable: required('SCORECARD_SANDBOX'), path: required('SCORECARD_TOOL_PATH') },
    toolsStore: required('SCORECARD_TOOLS_STORE'),
    ratstackSrc: required('SCORECARD_RATSTACK_SRC'),
    checkout,
    pin: pinOf(await readJson(join(dir, 'ratstack.pin.json'))),
    instrumentHash: await gitText(checkout, ['rev-parse', 'HEAD:evals/ratstack-scorecard']),
    nixpkgsRev: nixpkgsRevOf(await readJson(join(dir, 'flake.lock'))),
    runner: runnerName(),
    starterCommit: await gitText(checkout, ['rev-parse', 'HEAD']),
    toolVersions: {
      ...dependencyVersions(await readJson(join(dir, 'package.json'))),
      node: required('SCORECARD_NODE_VERSION'),
      pnpm: required('SCORECARD_PNPM_VERSION'),
      deno: Deno.version.deno,
    },
  }
}

export const provenanceFor = (
  instrument: Instrument,
  side: Side,
  detail: Readonly<Record<string, number | string>>,
): CellProvenance => ({
  side,
  commit: { ratstack: instrument.pin.commit, starter: instrument.starterCommit }[side],
  instrumentHash: instrument.instrumentHash,
  nixpkgsRev: instrument.nixpkgsRev,
  runner: instrument.runner,
  measuredAt: new Date().toISOString(),
  tools: instrument.toolVersions,
  detail,
})

const definitionInputs = (family: Family): readonly string[] => [
  `src/families/${family}.ts`,
  'src/sides',
  'src/tools',
  'src/harness',
  'flake.lock',
  'pnpm-lock.yaml',
]

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

export const definitionHashesFor = async (
  instrument: Instrument,
  family: Family,
): Promise<readonly { readonly id: RowId; readonly hash: string }[]> => {
  const trees = await Promise.all(
    definitionInputs(family).map(async (path) =>
      `${path}=${await gitText(instrument.checkout, ['rev-parse', `HEAD:evals/ratstack-scorecard/${path}`])}`
    ),
  )
  return await Promise.all(
    rowDefinitions
      .filter((row) => row.family === family)
      .map(async (row) => ({ id: row.id, hash: await sha256(JSON.stringify({ row, trees })) })),
  )
}

const entriesIn = async (dir: string): Promise<readonly Deno.DirEntry[]> => {
  const entries: Deno.DirEntry[] = []
  for await (const entry of Deno.readDir(dir)) entries.push(entry)
  return entries
}

const joinPath = (prefix: string, name: string): string => (prefix === '' ? name : `${prefix}/${name}`)

const copyEntry = async (from: string, to: string, file: string): Promise<void> => {
  const target = join(to, file)
  await Deno.mkdir(dirname(target), { recursive: true })
  const info = await Deno.lstat(join(from, file))
  if (info.isSymlink) await Deno.symlink(await Deno.readLink(join(from, file)), target)
  else await Deno.copyFile(join(from, file), target)
}

const copyTracked = async (from: string, to: string, files: readonly string[]): Promise<void> => {
  await Promise.all(files.map((file) => copyEntry(from, to, file)))
}

export const trackedFiles = async (checkout: string): Promise<readonly string[]> =>
  decoder.decode(await git(checkout, ['ls-files', '-z'])).split('\0').filter((file) => file !== '')

const walkEntry = async (root: string, prefix: string, entry: Deno.DirEntry): Promise<readonly string[]> => {
  const path = joinPath(prefix, entry.name)
  if (entry.isDirectory) return await walkFiles(root, path)
  return [path]
}

export const walkFiles = async (root: string, prefix = ''): Promise<readonly string[]> => {
  const entries = await entriesIn(join(root, prefix))
  const nested = await Promise.all(entries.map((entry) => walkEntry(root, prefix, entry)))
  return nested.flat().sort()
}

export const materializeStarter = async (instrument: Instrument, work: string): Promise<string> => {
  const target = join(work, 'starter')
  await copyTracked(instrument.checkout, target, await trackedFiles(instrument.checkout))
  return target
}

export const materializeRatstack = async (instrument: Instrument, work: string): Promise<string> => {
  const target = join(work, 'ratstack')
  await copyTracked(instrument.ratstackSrc, target, await walkFiles(instrument.ratstackSrc))
  return target
}

const toolFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'] as const

export const prepareTools = async (instrument: Instrument, work: string): Promise<string> => {
  const tools = join(work, 'tools')
  await Deno.mkdir(join(tools, 'src/tools'), { recursive: true })
  await Promise.all(toolFiles.map((file) => Deno.copyFile(join(instrument.dir, file), join(tools, file))))
  const names = (await entriesIn(join(instrument.dir, 'src/tools'))).map((entry) => entry.name)
  await Promise.all(
    names.map((name) => Deno.copyFile(join(instrument.dir, 'src/tools', name), join(tools, 'src/tools', name))),
  )
  const install = await runSandboxed(instrument.launcher, {
    project: work,
    cwd: tools,
    command: ['pnpm', 'install', '--frozen-lockfile', '--prod'],
    pnpmStore: instrument.toolsStore,
    deadlineMs: 10 * 60_000,
  })
  if (install.code !== 0) throw new Error(`installing the instrument tools failed:\n${install.stderr}`)
  return tools
}
