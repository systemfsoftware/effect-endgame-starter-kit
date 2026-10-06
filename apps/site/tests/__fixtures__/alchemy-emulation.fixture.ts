import { Config, Effect, FileSystem, Path, Schema, Stream } from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'

export const EMULATED_STAGE = 'emulated'

const PUBLIC_SITE = new URL('../..', import.meta.url).pathname
const REPO_ROOT_GITIGNORE = new URL('../../../../.gitignore', import.meta.url).pathname
const ALCHEMY_BIN = new URL(import.meta.resolve('alchemy/bin/alchemy.js')).pathname
const DEPLOY_TIMEOUT = '120 seconds'

const StackOutput = Schema.fromJsonString(Schema.Struct({ url: Schema.String, workerName: Schema.String }))

const makeProject = Effect.fn(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const rootDir = yield* fs.makeTempDirectory({ prefix: 'alchemy-emulated-' })
  const projectDir = path.join(rootDir, 'project')
  const homeDir = path.join(rootDir, 'home')
  yield* fs.makeDirectory(projectDir, { recursive: true })
  yield* fs.makeDirectory(homeDir, { recursive: true })
  yield* fs.copyFile(REPO_ROOT_GITIGNORE, path.join(rootDir, '.gitignore'))
  for (const entry of yield* fs.readDirectory(PUBLIC_SITE)) {
    if (entry === '.alchemy' || entry === 'dist') continue
    yield* fs.symlink(path.join(PUBLIC_SITE, entry), path.join(projectDir, entry))
  }
  return { rootDir, projectDir, homeDir }
})

const runAlchemyDevOnce = Effect.fn(function*(projectDir: string, homeDir: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const path = yield* Config.String('PATH')
  const command = ChildProcess.make(process.execPath, [ALCHEMY_BIN, 'dev', '--stage', EMULATED_STAGE], {
    cwd: projectDir,
    env: { PATH: path, HOME: homeDir, ALCHEMY_HOME: homeDir, ALCHEMY_DEV_ONCE: '1', DO_NOT_TRACK: '1' },
    killSignal: 'SIGKILL',
  })
  return yield* Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* spawner.spawn(command)
      const [exitCode, output] = yield* Effect.all(
        [handle.exitCode, Stream.mkString(Stream.decodeText(handle.all))],
        { concurrency: 2 },
      )
      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* Effect.die(new Error(`alchemy dev exited ${exitCode}:\n${output.slice(-6000)}`))
      }
      return output
    }),
  ).pipe(Effect.timeout(DEPLOY_TIMEOUT))
})

export const deployUnderEmulation = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { rootDir, projectDir, homeDir } = yield* makeProject()
  return yield* Effect.gen(function*() {
    const output = yield* runAlchemyDevOnce(projectDir, homeDir)
    const recorded = yield* fs.readFileString(
      path.join(projectDir, '.alchemy', 'state', 'Endgame', EMULATED_STAGE, '__stack_output__.json'),
    )
    const stackOutput = yield* Schema.decodeEffect(StackOutput)(recorded)
    return { output, stackOutput }
  }).pipe(Effect.ensuring(Effect.ignore(fs.remove(rootDir, { recursive: true, force: true }))))
})
