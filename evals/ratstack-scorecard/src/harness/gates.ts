import { join } from 'node:path'
import { checkImports } from '../check-imports.ts'
import { runJourneys } from '../journeys.ts'
import type { Instrument } from './instrument.ts'
import { runSandboxed } from './sandbox.ts'

const hostPaths = [
  'src/main.ts',
  'src/journeys.ts',
  'src/check-imports.ts',
  'src/harness',
  'src/families',
  'src/sides',
  'src/tools',
]

const hostFiles = ['src/main.ts', 'src/tools/extract-comments.ts', 'src/tools/parse-lockfile.ts']

const decoder = new TextDecoder()

const writeDenoTypes = async (root: string): Promise<void> => {
  const types = await new Deno.Command('deno', { args: ['types'], stdout: 'piped', stderr: 'piped' }).output()
  if (!types.success) throw new Error(`deno types failed:\n${decoder.decode(types.stderr)}`)
  const dir = join(root, '.cache/types')
  await Deno.mkdir(dir, { recursive: true })
  await Deno.writeFile(join(dir, 'deno.ns.d.ts'), types.stdout)
}

const echo = (label: string, code: number, stdout: string, stderr: string): void => {
  console.error(`check: ${label} exited ${code}`)
  Deno.stderr.writeSync(new TextEncoder().encode(stderr))
  Deno.stdout.writeSync(new TextEncoder().encode(stdout))
}

const sandboxStep = (
  instrument: Instrument,
  root: string,
  label: string,
  command: readonly string[],
): () => Promise<number> =>
async () => {
  const result = await runSandboxed(instrument.launcher, {
    project: root,
    cwd: root,
    command,
    pnpmStore: instrument.toolsStore,
    deadlineMs: 15 * 60_000,
  })
  echo(label, result.code, result.stdout, result.stderr)
  return result.code
}

const envOr = (name: string, fallback: string): string => Deno.env.get(name) ?? fallback

const hostEnvironment = (): Readonly<Record<string, string>> => ({
  PATH: envOr('PATH', ''),
  HOME: envOr('HOME', '/tmp'),
})

const hostStep = (root: string, label: string, args: readonly string[]): () => Promise<number> => async () => {
  const result = await new Deno.Command('deno', {
    args: [...args],
    cwd: root,
    clearEnv: true,
    env: hostEnvironment(),
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  echo(label, result.code, decoder.decode(result.stdout), decoder.decode(result.stderr))
  return result.code
}

const inOrder = async (steps: readonly (() => Promise<number>)[]): Promise<readonly number[]> => {
  const codes: number[] = []
  for (const step of steps) codes.push(await step())
  return codes
}

const firstFailure = (codes: readonly number[]): number => codes.find((code) => code !== 0) ?? 0

const runGates = async (instrument: Instrument, root: string): Promise<number> => {
  await writeDenoTypes(root)
  const codes = await inOrder([
    sandboxStep(instrument, root, 'pnpm install', ['pnpm', 'install', '--frozen-lockfile']),
    sandboxStep(instrument, root, 'effect-tsgo patch', [
      'pnpm',
      'exec',
      'effect-tsgo',
      'patch',
      '--oxlint',
      '--no-typescript',
      '--skip-missing',
    ]),
    sandboxStep(instrument, root, 'tsc', ['pnpm', 'exec', 'tsc', '-p', 'tsconfig.json']),
    sandboxStep(instrument, root, 'oxlint', ['pnpm', 'exec', 'oxlint', '--config', 'oxlint.config.ts', '.']),
    hostStep(root, 'deno check', ['check', ...hostFiles]),
    hostStep(root, 'deno lint', ['lint', ...hostPaths]),
  ])
  return firstFailure(codes)
}

export const runCheck = async (instrument: Instrument, root: string): Promise<number> => {
  const violations = await checkImports(root)
  for (const violation of violations) console.error(`check-imports: ${violation}`)
  console.error('check-imports: the host driver loads no third-party code; no model file imports the journey fixture')
  const codes = await inOrder([
    () => Promise.resolve(Math.min(violations.length, 1)),
    () => runGates(instrument, root),
    () => runJourneys(instrument, root),
  ])
  return firstFailure(codes)
}
