interface Outcome {
  readonly code: number
  readonly out: string
}

interface Report {
  readonly worker: { readonly status?: number; readonly body?: string; readonly error?: string }
  readonly tcp: Readonly<Record<string, string>>
  readonly paths: Readonly<Record<string, string>>
  readonly sockets: readonly string[]
}

interface Run {
  readonly code: number
  readonly out: string
  readonly report: Report | undefined
}

interface Batch {
  readonly sandboxUid: string
  readonly runs: ReadonlyMap<string, Run>
  readonly out: string
}

type Invoker = 'root' | 'non-root'

const decoder = new TextDecoder()

const run = async (command: string, args: readonly string[], cwd?: string): Promise<Outcome> => {
  const child = new Deno.Command(command, { args: [...args], cwd, stdin: 'null', stdout: 'piped', stderr: 'piped' })
  const { code, stdout, stderr } = await child.output()
  return { code, out: decoder.decode(stdout) + decoder.decode(stderr) }
}

const must = async (command: string, args: readonly string[]): Promise<string> => {
  const outcome = await run(command, args)
  if (outcome.code !== 0) throw new Error(`${command} ${args.join(' ')} exited ${outcome.code}:\n${outcome.out}`)
  return outcome.out.trim()
}

const FIXTURES = new URL('./heavy-job/', import.meta.url).pathname
const PROOF = '/tmp/heavy-job-proof'
const SECOND_SOCKET = `${PROOF}/second.sock`
const WORKER_SOCKET = '/run/endgame/worker.sock'
const HOME_CANARY = '/home/sandbox/.ssh/id_canary'
const EGRESS_PROXY = '127.0.0.1:3128'
const PUBLIC_HOST = '1.1.1.1:443'
const WORKER_PORT = '127.0.0.1:1337'
const OTHER_PORT = '127.0.0.1:3000'
const FAILING_STATUS = 3
const UNPRIVILEGED_UID = '1001'

const SABOTAGES: Readonly<Record<string, readonly [string, string]>> = {
  'network-enabled': ['--network=none', '--network=host'],
  'binds-widened': ['--volume="$job_dir:/job:ro"', '--volume="$job_dir:/job:ro" --volume="$HOME:$HOME:ro"'],
  'second-socket': [
    `--volume="$socket:${WORKER_SOCKET}"`,
    `--volume="$socket:${WORKER_SOCKET}" --volume=${SECOND_SOCKET}:/run/endgame/second.sock`,
  ],
}

const sabotaged = (runner: string, [target, replacement]: readonly [string, string]): string => {
  const at = runner.indexOf(target)
  if (at < 0 || runner.indexOf(target, at + 1) >= 0) {
    throw new Error(`the sabotage target ${target} does not occur exactly once in the heavy-job runner`)
  }
  return runner.slice(0, at) + replacement + runner.slice(at + target.length)
}

const probeArgs = (project: string): string =>
  [EGRESS_PROXY, PUBLIC_HOST, WORKER_PORT, OTHER_PORT].map((address) => `tcp:${address}`)
    .concat([`path:${HOME_CANARY}`, `path:${project}/outside-canary`])
    .join(' ')

const batchScript = (project: string): string => {
  const jobs = ['real', ...Object.keys(SABOTAGES)].map((name) => {
    const runner = name === 'real' ? 'heavy-job' : `./sabotage/${name}`
    return `echo "RUN ${name}"; ${runner} job probe.mjs ${probeArgs(project)}; echo "EXIT ${name} $?"`
  })
  return [
    'set -u',
    `mkdir -p ${PROOF} "$HOME/.ssh"`,
    `echo canary >${HOME_CANARY}`,
    `mkfifo ${PROOF}/ready`,
    `node stand-ins.mjs ${PROOF}/ready ${SECOND_SOCKET} &`,
    `read -r _ <${PROOF}/ready`,
    'echo "SANDBOX-UID $(id -u)"',
    ...jobs,
    `echo "RUN failing-job"; heavy-job job fail.mjs; echo "EXIT failing-job $?"`,
  ].join('\n')
}

const parseBatch = (out: string): Batch => {
  const sandboxUid = /^SANDBOX-UID (\d+)$/m.exec(out)?.[1] ?? ''
  const runs = new Map<string, Run>()
  for (const [, name, body, code] of out.matchAll(/^RUN (\S+)\n([\s\S]*?)^EXIT \1 (\d+)$/gm)) {
    const line = /^HEAVY-JOB-REPORT (.+)$/m.exec(body ?? '')?.[1]
    runs.set(name ?? '', {
      code: Number(code),
      out: body ?? '',
      report: line === undefined ? undefined : JSON.parse(line) as Report,
    })
  }
  return { sandboxUid, runs, out }
}

const invokerPrefix = (invoker: Invoker, uid: string): string => {
  if (invoker === 'root') return uid === '0' ? '' : 'unshare --user --map-root-user -- '
  return uid === '0' ? `unshare --user --map-user=${UNPRIVILEGED_UID} --map-group=${UNPRIVILEGED_UID} -- ` : ''
}

const runBatch = async (project: string, invoker: Invoker, uid: string): Promise<Batch> => {
  const script = batchScript(project).replaceAll("'", "'\\''")
  const outcome = await run(
    'sh',
    ['-c', `${invokerPrefix(invoker, uid)}sandbox --allow-host example.invalid -- bash -c '${script}'`],
    project,
  )
  return parseBatch(outcome.out)
}

const runOf = (batch: Batch, invoker: Invoker, name: string): Run => {
  const found = batch.runs.get(name)
  if (found === undefined) throw new Error(`the ${invoker} invoker's ${name} run never finished:\n${batch.out}`)
  return found
}

const reportOf = (batch: Batch, invoker: Invoker, name: string): Report => {
  const found = runOf(batch, invoker, name)
  if (found.report === undefined) {
    throw new Error(`the ${invoker} invoker's ${name} run printed no report:\n${found.out}`)
  }
  return found.report
}

const holds = (condition: boolean, what: string, batch: Batch): void => {
  if (!condition) throw new Error(`${what}\n${batch.out}`)
}

const reached = (outcome: string | undefined): boolean => outcome === 'reached'

Deno.test({
  name: 'the heavy-job service runs its image under podman inside the sandbox, reaching only the Worker',
  ignore: Deno.build.os !== 'linux',
  fn: async (t) => {
    const project = await Deno.makeTempDir({ prefix: 'heavy-job-proof-' })
    try {
      const uid = await must('sh', ['-c', 'id -u'])
      const runner = await Deno.readTextFile(await must('sh', ['-c', 'readlink -f "$(command -v heavy-job)"']))
      await Deno.mkdir(`${project}/job`)
      await Deno.mkdir(`${project}/sabotage`)
      await Deno.copyFile(`${FIXTURES}probe.mjs`, `${project}/job/probe.mjs`)
      await Deno.copyFile(`${FIXTURES}stand-ins.mjs`, `${project}/stand-ins.mjs`)
      await Deno.writeTextFile(`${project}/job/fail.mjs`, `process.exitCode = ${FAILING_STATUS}\n`)
      await Deno.writeTextFile(`${project}/outside-canary`, 'canary\n')
      for (const [name, sabotage] of Object.entries(SABOTAGES)) {
        await Deno.writeTextFile(`${project}/sabotage/${name}`, sabotaged(runner, sabotage), { mode: 0o755 })
      }
      const batches: ReadonlyArray<readonly [Invoker, Batch]> = [
        ['root', await runBatch(project, 'root', uid)],
        ['non-root', await runBatch(project, 'non-root', uid)],
      ]

      await t.step('The heavy-job service runs one job and exits 0', () => {
        for (const [invoker, batch] of batches) {
          const real = runOf(batch, invoker, 'real')
          holds(real.code === 0 && real.report !== undefined, `the ${invoker} invoker's job did not exit 0`, batch)
          holds(
            runOf(batch, invoker, 'failing-job').code === FAILING_STATUS,
            `the ${invoker} invoker's runner did not pass a failing job's status through`,
            batch,
          )
        }
      })

      await t.step('A job reaches the Worker through the bind-mounted socket', () => {
        for (const [invoker, batch] of batches) {
          const { worker } = reportOf(batch, invoker, 'real')
          holds(
            worker.status === 200 && worker.body === 'stand-in worker\n',
            `the ${invoker} invoker's job did not reach the Worker through its socket`,
            batch,
          )
        }
      })

      await t.step('A job that fetches any outside host fails', () => {
        for (const [invoker, batch] of batches) {
          const { tcp } = reportOf(batch, invoker, 'real')
          holds(
            !reached(tcp[EGRESS_PROXY]) && !reached(tcp[PUBLIC_HOST]),
            `the ${invoker} invoker's job reached a way out of the sandbox`,
            batch,
          )
          holds(
            reached(reportOf(batch, invoker, 'network-enabled').tcp[EGRESS_PROXY]),
            `with the network enabled the ${invoker} invoker's job did not see the egress proxy, so the refusal proves nothing`,
            batch,
          )
        }
      })

      await t.step('A job that connects to any other host port fails', () => {
        for (const [invoker, batch] of batches) {
          const { tcp, sockets } = reportOf(batch, invoker, 'real')
          holds(
            !reached(tcp[WORKER_PORT]) && !reached(tcp[OTHER_PORT]) && sockets.join() === WORKER_SOCKET,
            `the ${invoker} invoker's job reached a host port other than its one socket`,
            batch,
          )
          const networked = reportOf(batch, invoker, 'network-enabled').tcp
          holds(
            reached(networked[WORKER_PORT]) && reached(networked[OTHER_PORT]),
            `with the network enabled the ${invoker} invoker's job reached no host port, so the refusal proves nothing`,
            batch,
          )
          holds(
            reportOf(batch, invoker, 'second-socket').sockets.length === 2,
            `with a second socket bound the ${invoker} invoker's job did not see it, so the refusal proves nothing`,
            batch,
          )
        }
      })

      await t.step('A job that reads ~/.ssh or any path outside its binds fails', () => {
        for (const [invoker, batch] of batches) {
          const { paths } = reportOf(batch, invoker, 'real')
          holds(
            Object.keys(paths).length === 2 && Object.values(paths).every((outcome) => outcome !== 'read'),
            `the ${invoker} invoker's job read a path outside its binds`,
            batch,
          )
          holds(
            reportOf(batch, invoker, 'binds-widened').paths[HOME_CANARY] === 'read',
            `with the binds widened the ${invoker} invoker's job could not read ~/.ssh, so the refusal proves nothing`,
            batch,
          )
        }
      })

      await t.step('A root invoker runs as uid 65534 inside the sandbox', () => {
        const [, batch] = batches[0] ?? []
        if (batch === undefined) throw new Error('the root invoker never ran')
        holds(batch.sandboxUid === '65534', 'a root invoker kept uid 0 inside the sandbox', batch)
      })

      await t.step('A non-root invoker, the CI runner case, keeps its own uid and passes unchanged', () => {
        const [, batch] = batches[1] ?? []
        if (batch === undefined) throw new Error('the non-root invoker never ran')
        holds(
          batch.sandboxUid === (uid === '0' ? UNPRIVILEGED_UID : uid),
          'a non-root invoker ran under another uid inside the sandbox',
          batch,
        )
      })
    } finally {
      await Deno.remove(project, { recursive: true }).catch(() => undefined)
    }
  },
})
