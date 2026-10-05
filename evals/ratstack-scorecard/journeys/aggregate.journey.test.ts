import { NodeServices } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import Ajv from 'ajv'
import { Effect, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as ChildProcess from 'effect/process/ChildProcess'
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner'
import schema from '../scorecard.schema.json' with { type: 'json' }

const Feature = makeFeature({ it })
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)

const instrument = `${import.meta.dirname}/..`
const fixtures = `${import.meta.dirname}/__fixtures__/aggregate`
const families = `${fixtures}/families`
const mainArtifact = `${fixtures}/main/scorecard.json`

const documents = Schema.fromJsonString(Schema.Unknown)

const aggregate = (main: string | undefined) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner
    const dir = yield* fs.makeTempDirectory()
    const out = `${dir}/scorecard.json`
    const summary = `${dir}/summary.md`
    const stderrPath = `${dir}/stderr.txt`
    const args = [
      '--families',
      families,
      ...(main === undefined ? [] : ['--main', main]),
      '--out',
      out,
      '--summary',
      summary,
    ]
    const line = `DENO_NO_PACKAGE_JSON=1 deno run --no-config --allow-read --allow-write --allow-env src/main.ts aggregate ${
      args.join(' ')
    }`
    const stdout = yield* spawner.string(
      ChildProcess.make('sh', ['-c', `${line} 2>${stderrPath}; echo $?`], { cwd: instrument }),
    )
    return {
      code: Number(stdout.trim()),
      stderr: yield* fs.readFileString(stderrPath),
      document: yield* Schema.decodeUnknownEffect(documents)(yield* fs.readFileString(out)),
    }
  })

Feature('Aggregating the families through the real CLI')
  .live('the aggregate command runs as a deno subprocess and writes the scorecard and summary to disk')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A row beaten on main and tied on the PR fails the job and writes a valid scorecard',
      Gherkin.Do.pipe(
        Given('the aggregate fixtures and a main artifact')('main', () => Effect.succeed(mainArtifact)),
        When('the families are aggregated')('result', (scope) => aggregate(scope.main)),
        Then('the job fails naming the regressed row and writes a schema-valid scorecard')((scope, expect) =>
          expect({
            code: scope.result.code,
            namesRow: scope.result.stderr.includes('M23'),
            namesOther: scope.result.stderr.includes('M28'),
            valid: validate(scope.result.document),
          }).toEqual({ code: 1, namesRow: true, namesOther: false, valid: true })
        ),
      ),
    )

    scenario(
      'Without a main artifact the same families are a passing first baseline',
      Gherkin.Do.pipe(
        Given('the aggregate fixtures and no main artifact')('main', () => Effect.succeed(undefined)),
        When('the families are aggregated')('result', (scope) => aggregate(scope.main)),
        Then('the job passes')((scope, expect) => expect({ code: scope.result.code }).toEqual({ code: 0 })),
      ),
    )
  })
