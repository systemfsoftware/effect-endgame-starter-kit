import { dirname, join } from 'node:path'
import { type Instrument, walkFiles } from './instrument.ts'
import { runSandboxed, type SandboxRequest } from './sandbox.ts'

const generated = ['node_modules/', '.cache/', 'journeys/__records__/']

const githubHosts = ['api.github.com', '*.blob.core.windows.net']

export interface DecideWork {
  readonly instrument: Instrument
  readonly work: string
}

const isGenerated = (file: string): boolean => generated.some((prefix) => file.startsWith(prefix))

const copyFile = async (dir: string, copy: string, file: string): Promise<void> => {
  await Deno.mkdir(dirname(join(copy, file)), { recursive: true })
  await Deno.writeFile(join(copy, file), await Deno.readFile(join(dir, file)))
}

const copyInstrument = async (dir: string, copy: string): Promise<void> => {
  const files = (await walkFiles(dir)).filter((file) => !isGenerated(file))
  await Promise.all(files.map((file) => copyFile(dir, copy, file)))
}

export const prepareDecide = async (instrument: Instrument, work: string): Promise<DecideWork> => {
  const copy = join(work, 'instrument')
  await copyInstrument(instrument.dir, copy)
  const install = await runSandboxed(instrument.launcher, {
    project: work,
    cwd: copy,
    command: ['pnpm', 'install', '--frozen-lockfile'],
    pnpmStore: instrument.toolsStore,
    deadlineMs: 10 * 60_000,
  })
  if (install.code !== 0) throw new Error(`installing the decide step's dependencies failed:\n${install.stderr}`)
  return { instrument, work }
}

const tokenOption = (token: string | undefined): Pick<SandboxRequest, 'env'> =>
  token === undefined ? {} : { env: { GITHUB_TOKEN: token } }

const decideOptions = (
  github: boolean,
  token: string | undefined,
): Pick<SandboxRequest, 'allowHosts' | 'env'> => github ? { allowHosts: githubHosts, ...tokenOption(token) } : {}

export const decide = async (
  { instrument, work }: DecideWork,
  args: readonly string[],
  options: { readonly github: boolean },
): Promise<number> => {
  const result = await runSandboxed(instrument.launcher, {
    project: work,
    cwd: work,
    command: ['node', 'instrument/decide/main.ts', ...args],
    ...decideOptions(options.github, Deno.env.get('GITHUB_TOKEN')),
    deadlineMs: 5 * 60_000,
  })
  await Deno.stdout.write(new TextEncoder().encode(result.stdout))
  await Deno.stderr.write(new TextEncoder().encode(result.stderr))
  return result.code
}
