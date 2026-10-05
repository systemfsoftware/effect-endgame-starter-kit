export interface SandboxRequest {
  readonly project: string
  readonly cwd: string
  readonly command: readonly string[]
  readonly allowHosts?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly pnpmStore?: string
  readonly deadlineMs: number
}

export interface SandboxResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
  readonly wallMs: number
  readonly pastDeadline: boolean
}

export interface Launcher {
  readonly executable: string
  readonly path: string
}

const decoder = new TextDecoder()

export const launcherArgs = (request: SandboxRequest): readonly string[] => [
  ...(request.allowHosts ?? []).flatMap((host) => ['--allow-host', host]),
  ...Object.keys(request.env ?? {}).flatMap((name) => ['--pass-env', name]),
  ...(request.pnpmStore === undefined ? [] : ['--pnpm-store', request.pnpmStore]),
  '--',
  ...request.command,
]

export const runSandboxed = async (launcher: Launcher, request: SandboxRequest): Promise<SandboxResult> => {
  const started = performance.now()
  const deadline = AbortSignal.timeout(request.deadlineMs)
  const output = await new Deno.Command(launcher.executable, {
    args: [...launcherArgs(request)],
    cwd: request.cwd,
    clearEnv: true,
    env: { PATH: launcher.path, HOME: '/tmp', SANDBOX_PROJECT: request.project, ...request.env },
    stdin: 'null',
    stdout: 'piped',
    stderr: 'piped',
    signal: deadline,
  }).output()
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
    wallMs: Math.round(performance.now() - started),
    pastDeadline: deadline.aborted,
  }
}
