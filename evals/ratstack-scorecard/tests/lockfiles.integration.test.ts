import { NodeServices } from '@effect/platform-node'
import { distinctPackages } from '@starter/ratstack-scorecard'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as ChildProcess from 'effect/process/ChildProcess'
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner'
import { LockfileDocuments } from './__fixtures__/lockfile.schema.ts'

const Feature = makeFeature({ it })
const instrument = `${import.meta.dirname}/..`

const application = ['@effect/vitest@4.0.0', 'effect@4.0.0', 'vitest@5.0.3']

const parse = (fixture: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner
    const dir = yield* fs.makeTempDirectory()
    const out = `${dir}/lockfile.json`
    yield* spawner.exitCode(
      ChildProcess.make(
        'deno',
        [
          'run',
          '--allow-read',
          '--allow-write',
          '--allow-env',
          '--allow-ffi',
          'src/tools/parse-lockfile.ts',
          `journeys/__fixtures__/lockfiles/${fixture}`,
          out,
        ],
        { cwd: instrument },
      ),
    )
    const documents = yield* Schema.decodeEffect(Schema.fromJsonString(LockfileDocuments))(
      yield* fs.readFileString(out),
    )
    return distinctPackages(documents.documents.flatMap((document) => document.packages))
  })

Feature('Parsing pnpm lockfiles through the real parser')
  .live('the parser runs as a deno subprocess and writes its output to disk')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'pnpm 11 lockfiles list their packages across both YAML documents',
      Gherkin.Do.pipe(
        Given('the pnpm 11 lockfile fixture')('fixture', () => Effect.succeed('pnpm11.yaml')),
        When('the parser reads it')('packages', (scope) => parse(scope.fixture)),
        Then('the distinct package set is the lockfile contents')((scope, expect) =>
          expect(scope.packages).toEqual([...application, '@pnpm/exe@11.3.0', 'pnpm@11.3.0'].sort())
        ),
      ),
    )

    scenario(
      'pnpm 12 lockfiles list their packages across both YAML documents',
      Gherkin.Do.pipe(
        Given('the pnpm 12 lockfile fixture')('fixture', () => Effect.succeed('pnpm12.yaml')),
        When('the parser reads it')('packages', (scope) => parse(scope.fixture)),
        Then('the distinct package set is the lockfile contents')((scope, expect) =>
          expect(scope.packages).toEqual([...application, '@pnpm/exe.linux-x64@12.4.2', 'pnpm@12.4.2'].sort())
        ),
      ),
    )
  })
