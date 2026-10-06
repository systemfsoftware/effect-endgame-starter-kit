interface Outcome {
  readonly code: number
  readonly out: string
}

const decoder = new TextDecoder()

const run = async (
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: Record<string, string>; readonly stdin?: string } = {},
): Promise<Outcome> => {
  const child = new Deno.Command(command, {
    args: [...args],
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin === undefined ? 'null' : 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()
  if (options.stdin !== undefined) {
    const writer = child.stdin.getWriter()
    await writer.write(new TextEncoder().encode(options.stdin))
    await writer.close()
  }
  const { code, stdout, stderr } = await child.output()
  return { code, out: decoder.decode(stdout) + decoder.decode(stderr) }
}

const must = async (command: string, args: readonly string[], cwd?: string): Promise<string> => {
  const outcome = await run(command, args, { cwd })
  if (outcome.code !== 0) throw new Error(`${command} ${args.join(' ')} exited ${outcome.code}:\n${outcome.out}`)
  return outcome.out.trim()
}

const expect = (holds: boolean, what: string, outcome: Outcome): void => {
  if (!holds) throw new Error(`${what}\nexit ${outcome.code}:\n${outcome.out}`)
}

const ALIVE = 'HOOK-SANDBOX-ALIVE'

const PROBE = 'nix/hook-sandbox-probe.json'

const refusedInside = async (worktree: string, script: string, env?: Record<string, string>): Promise<Outcome> => {
  const outcome = await run('sandbox', ['--', 'sh', '-c', `echo ${ALIVE}; ${script}`], { cwd: worktree, env })
  expect(outcome.out.includes(ALIVE), 'the sandboxed command never started', outcome)
  return outcome
}

const withoutSandboxOnPath = async (): Promise<string> => {
  const launcher = await must('sh', ['-c', 'command -v sandbox'])
  const launcherDir = launcher.slice(0, launcher.lastIndexOf('/'))
  return (Deno.env.get('PATH') ?? '').split(':').filter((dir) => dir !== launcherDir).join(':')
}

Deno.test('git hooks run their dependency code inside the sandbox from a linked worktree', async (t) => {
  const root = await must('git', ['rev-parse', '--show-toplevel'])
  const common = await must('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const temp = await Deno.makeTempDir({ prefix: 'hook-sandbox-' })
  const worktree = `${temp}/worktree`
  const commonCanary = `${common}/hook-sandbox-canary-${crypto.randomUUID()}`
  const homeCanary = `${Deno.env.get('HOME')}/.hook-sandbox-canary-${crypto.randomUUID()}`
  try {
    await must('git', ['-C', root, 'worktree', 'add', '--detach', worktree, 'HEAD'])
    await Deno.mkdir(`${worktree}/.sfs-deps`)
    for await (const entry of Deno.readDir(`${root}/.sfs-deps`)) {
      await Deno.copyFile(`${root}/.sfs-deps/${entry.name}`, `${worktree}/.sfs-deps/${entry.name}`)
    }
    await must('sandbox', ['--', 'pnpm', 'install'], worktree)
    await Deno.writeTextFile(`${worktree}/${PROBE}`, '{"probe":1}\n')
    await must('git', ['add', PROBE], worktree)

    await t.step('a feat commit of a tooling-only change is refused by commitlint', async () => {
      const outcome = await run('git', ['commit', '-m', 'feat(repo): probe'], { cwd: worktree })
      expect(
        outcome.code !== 0 && outcome.out.includes('100% tooling paths'),
        'the diff-shape rule did not refuse',
        outcome,
      )
    })

    await t.step('the hooks refuse to run when the sandbox is unavailable', async () => {
      const env = { PATH: await withoutSandboxOnPath() }
      const outcome = await run('git', ['commit', '-m', 'build(repo): probe'], { cwd: worktree, env })
      expect(
        outcome.code !== 0 && /sandbox: (command )?not found/.test(outcome.out),
        'a hook ran without the sandbox',
        outcome,
      )
    })

    await t.step('a build commit runs lint-staged through its stash cycle and lands formatted', async () => {
      const outcome = await run('git', ['commit', '-m', 'build(repo): probe'], { cwd: worktree })
      expect(
        outcome.code === 0 && outcome.out.includes('Done backing up original state'),
        'the commit or its lint-staged stash cycle failed',
        outcome,
      )
      const subject = await must('git', ['log', '-1', '--format=%s'], worktree)
      const committed = await must('git', ['show', `HEAD:${PROBE}`], worktree)
      const stashes = await must('git', ['stash', 'list'], worktree)
      expect(
        subject === 'build(repo): probe' && committed === '{ "probe": 1 }' && stashes === '',
        'the commit did not land formatted and clean',
        outcome,
      )
    })

    await t.step("a commit of named paths is graded and formatted against git's temporary index", async () => {
      await Deno.writeTextFile(`${worktree}/${PROBE}`, '{"probe":2}\n')
      const refused = await run('git', ['commit', '-m', 'feat(repo): probe', PROBE], { cwd: worktree })
      expect(
        refused.code !== 0 && refused.out.includes('100% tooling paths'),
        'the hooks graded the wrong index',
        refused,
      )
      const landed = await run('git', ['commit', '-m', 'build(repo): named path probe', PROBE], { cwd: worktree })
      const subject = await must('git', ['log', '-1', '--format=%s'], worktree)
      const committed = await must('git', ['show', `HEAD:${PROBE}`], worktree)
      expect(
        landed.code === 0 && landed.out.includes('Done backing up original state') &&
          subject === 'build(repo): named path probe' && committed === '{ "probe": 2 }',
        'a commit of named paths failed in the hooks',
        landed,
      )
    })

    await t.step("commitlint fails with git's error when git cannot read the index", async () => {
      const outcome = await run('sandbox', ['--', 'env', 'GIT_DIR=/nonexistent', 'pnpm', 'exec', 'commitlint'], {
        cwd: worktree,
        stdin: 'feat(repo): probe\n',
      })
      expect(
        outcome.code !== 0 && outcome.out.includes('Command failed: git diff --cached --name-only'),
        'git failed silently',
        outcome,
      )
    })

    await t.step('the git directory outside the bound paths is unreadable', async () => {
      await Deno.writeTextFile(commonCanary, 'secret')
      const outcome = await refusedInside(worktree, `cat '${commonCanary}'`)
      expect(outcome.code !== 0 && !outcome.out.includes('secret'), 'a common-dir file was readable', outcome)
    })

    await t.step('the shared git config cannot be rewritten', async () => {
      const before = await must('git', ['config', '--get', 'core.hooksPath'], worktree)
      const outcome = await refusedInside(worktree, 'git config core.hooksPath /tmp/hooks')
      const after = await must('git', ['config', '--get', 'core.hooksPath'], worktree)
      expect(outcome.code !== 0 && after === before, 'the shared git config was writable', outcome)
    })

    await t.step('the network is unreachable', async () => {
      const outcome = await refusedInside(worktree, 'git ls-remote https://github.com/git/git HEAD')
      expect(outcome.code !== 0 && !/^[0-9a-f]{40}\s/m.test(outcome.out), 'a remote answered', outcome)
    })

    await t.step('host credentials and home files are out of reach', async () => {
      await Deno.writeTextFile(homeCanary, 'secret')
      const env = { GH_TOKEN: 'secret', GITHUB_TOKEN: 'secret', SSH_AUTH_SOCK: '/tmp/agent.sock' }
      const outcome = await refusedInside(
        worktree,
        `echo "[\${GH_TOKEN:-}\${GITHUB_TOKEN:-}\${SSH_AUTH_SOCK:-}]"; cat '${homeCanary}'`,
        env,
      )
      expect(
        outcome.code !== 0 && outcome.out.includes('[]') && !outcome.out.includes('secret'),
        'a credential or home file reached the sandbox',
        outcome,
      )
    })
  } finally {
    await Deno.remove(commonCanary).catch(() => undefined)
    await Deno.remove(homeCanary).catch(() => undefined)
    await run('git', ['-C', root, 'worktree', 'remove', '--force', worktree])
    await Deno.remove(temp, { recursive: true }).catch(() => undefined)
  }
})
