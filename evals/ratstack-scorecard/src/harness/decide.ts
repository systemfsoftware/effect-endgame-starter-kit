import { dirname, join } from 'node:path'
import { type Instrument, walkFiles } from './instrument.ts'
import { runSandboxed } from './sandbox.ts'

const generated = ['node_modules/', '.cache/', 'journeys/__records__/']

const githubHosts = ['api.github.com', '*.blob.core.windows.net']

export interface DecideWork {
  readonly instrument: Instrument
  readonly work: string
}

export const prepareDecide = async (instrument: Instrument, work: string): Promise<DecideWork> => {
  const copy = join(work, 'instrument')
  for (const file of await walkFiles(instrument.dir)) {
    if (generated.some((prefix) => file.startsWith(prefix))) continue
    await Deno.mkdir(dirname(join(copy, file)), { recursive: true })
    await Deno.writeFile(join(copy, file), await Deno.readFile(join(instrument.dir, file)))
  }
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

export const decide = async (
  { instrument, work }: DecideWork,
  args: readonly string[],
  options: { readonly github: boolean },
): Promise<number> => {
  const token = Deno.env.get('GITHUB_TOKEN')
  const result = await runSandboxed(instrument.launcher, {
    project: work,
    cwd: work,
    command: ['node', 'instrument/decide/main.ts', ...args],
    ...(options.github ? { allowHosts: githubHosts } : {}),
    ...(options.github && token !== undefined ? { env: { GITHUB_TOKEN: token } } : {}),
    deadlineMs: 5 * 60_000,
  })
  await Deno.stdout.write(new TextEncoder().encode(result.stdout))
  await Deno.stderr.write(new TextEncoder().encode(result.stderr))
  return result.code
}
