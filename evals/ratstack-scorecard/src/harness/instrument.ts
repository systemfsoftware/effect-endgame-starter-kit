import { dirname, join } from 'node:path'
import type { CellProvenance, Side } from '../model/cell.ts'
import { optionalEntriesAt, stringAt } from './decode.ts'
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

const required = (name: string): string => {
  const value = Deno.env.get(name)
  if (value === undefined || value === '') {
    throw new Error(`${name} is unset: run the scorecard through the flake's \`scorecard\` package`)
  }
  return value
}

export const git = async (cwd: string, args: readonly string[]): Promise<Uint8Array> => {
  const output = await new Deno.Command('git', { args: [...args], cwd, stdout: 'piped', stderr: 'piped' }).output()
  if (!output.success) throw new Error(`git ${args.join(' ')} failed: ${decoder.decode(output.stderr)}`)
  return output.stdout
}

const gitText = async (cwd: string, args: readonly string[]): Promise<string> =>
  decoder.decode(await git(cwd, args)).trim()

const readJson = async (path: string): Promise<unknown> => JSON.parse(await Deno.readTextFile(path))

const nixpkgsRevOf = (lock: unknown): string => stringAt(lock, ['nodes', 'nixpkgs', 'locked', 'rev'], 'flake.lock')

const pinOf = (pin: unknown): Pin => ({
  owner: stringAt(pin, ['owner'], 'ratstack.pin.json'),
  repo: stringAt(pin, ['repo'], 'ratstack.pin.json'),
  commit: stringAt(pin, ['commit'], 'ratstack.pin.json'),
  narHash: stringAt(pin, ['narHash'], 'ratstack.pin.json'),
})

const dependencyVersions = (manifest: unknown): Record<string, string> =>
  Object.fromEntries(optionalEntriesAt(manifest, ['dependencies']).map(([name, version]) => [name, String(version)]))

export const loadInstrument = async (checkoutArg: string | undefined): Promise<Instrument> => {
  const dir = required('SCORECARD_INSTRUMENT')
  const checkout = await gitText(checkoutArg ?? Deno.cwd(), ['rev-parse', '--show-toplevel'])
  return {
    dir,
    launcher: { executable: required('SCORECARD_SANDBOX'), path: required('SCORECARD_TOOL_PATH') },
    toolsStore: required('SCORECARD_TOOLS_STORE'),
    ratstackSrc: required('SCORECARD_RATSTACK_SRC'),
    checkout,
    pin: pinOf(await readJson(join(dir, 'ratstack.pin.json'))),
    instrumentHash: await gitText(checkout, ['rev-parse', 'HEAD:evals/ratstack-scorecard']),
    nixpkgsRev: nixpkgsRevOf(await readJson(join(dir, 'flake.lock'))),
    runner: Deno.env.get('RUNNER_NAME') ?? Deno.hostname(),
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

const copyTracked = async (from: string, to: string, files: readonly string[]): Promise<void> => {
  for (const file of files) {
    const target = join(to, file)
    await Deno.mkdir(dirname(target), { recursive: true })
    const info = await Deno.lstat(join(from, file))
    if (info.isSymlink) await Deno.symlink(await Deno.readLink(join(from, file)), target)
    else await Deno.copyFile(join(from, file), target)
  }
}

export const trackedFiles = async (checkout: string): Promise<readonly string[]> =>
  decoder.decode(await git(checkout, ['ls-files', '-z'])).split('\0').filter((file) => file !== '')

export const walkFiles = async (root: string, prefix = ''): Promise<readonly string[]> => {
  const found: string[] = []
  for await (const entry of Deno.readDir(join(root, prefix))) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory) found.push(...await walkFiles(root, path))
    else found.push(path)
  }
  return found.sort()
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

export const prepareTools = async (instrument: Instrument, work: string): Promise<string> => {
  const tools = join(work, 'tools')
  await Deno.mkdir(join(tools, 'src/tools'), { recursive: true })
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    await Deno.copyFile(join(instrument.dir, file), join(tools, file))
  }
  for await (const entry of Deno.readDir(join(instrument.dir, 'src/tools'))) {
    await Deno.copyFile(join(instrument.dir, 'src/tools', entry.name), join(tools, 'src/tools', entry.name))
  }
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
