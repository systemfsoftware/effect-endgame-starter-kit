import { NodeServices } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Schema } from 'effect'
import { InstrumentRefJson } from './__fixtures__/instrument-ref.schema.ts'
import { launcherRun } from './__fixtures__/launcher-run.ts'

const Feature = makeFeature({ it })

const selections = (names: readonly string[]) =>
  Effect.gen(function*() {
    const run = yield* launcherRun('instrument-ref')
    const decode = Schema.decodeEffect(InstrumentRefJson)
    return yield* Effect.forEach(names, (name) => decode(run.files[`${name}.json`] ?? 'null'))
  })

Feature('Choosing the instrument that grades a pull request')
  .live('the launcher reads the instrument-ref record from disk')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A base without the scorecard workflow grades with the PR head and says bootstrap',
      Gherkin.Do.pipe(
        Given('the instrument-ref launcher record')('record', () => Effect.succeed('instrument-ref')),
        When('the bootstrap selection is read')('selection', () => selections(['bootstrap'])),
        Then('it grades with the PR head in bootstrap mode')((scope, expect) => {
          const first = scope.selection[0]
          return expect({
            code: first?.code,
            stdout: first?.stdout,
            expected: first === undefined ? undefined : `ref=${first.head}\nmode=bootstrap\n`,
          }).toEqual({ code: 0, stdout: scope.selection[0]?.stdout, expected: scope.selection[0]?.stdout })
        }),
      ),
    )

    scenario(
      'A base with the instrument and no workflow still grades every PR edit',
      Gherkin.Do.pipe(
        Given('the instrument-ref launcher record')('record', () => Effect.succeed('instrument-ref')),
        When('the base-instrument-no-workflow selection is read')(
          'selection',
          () => selections(['base-instrument-no-workflow']),
        ),
        Then('it grades with the base instrument whose verdict stands')((scope, expect) => {
          const first = scope.selection[0]
          return expect({
            code: first?.code,
            mode: first?.stdout.split('\n')[1],
            namesBase: first === undefined ? false : first.stdout.startsWith(`ref=${first.base}`),
            graded: first?.graded,
          }).toEqual({ code: 0, mode: 'mode=base', namesBase: true, graded: 'green' })
        }),
      ),
    )

    scenario(
      'When the base has the workflow the base instrument grades every PR edit',
      Gherkin.Do.pipe(
        Given('the instrument-ref launcher record')('record', () => Effect.succeed('instrument-ref')),
        When('the PR edit selections are read')(
          'selections',
          () => selections(['edits-instrument', 'deletes-instrument', 'deletes-workflow']),
        ),
        Then('each is graded by the base instrument, whose red verdict stands')((scope, expect) =>
          expect({
            code: scope.selections.map((entry) => entry.code),
            mode: scope.selections.map((entry) => entry.stdout.split('\n')[1]),
            namesBase: scope.selections.map((entry) => entry.stdout.startsWith(`ref=${entry.base}`)),
            graded: scope.selections.map((entry) => entry.graded),
          }).toEqual({
            code: [0, 0, 0],
            mode: ['mode=base', 'mode=base', 'mode=base'],
            namesBase: [true, true, true],
            graded: ['red', 'red', 'red'],
          })
        ),
      ),
    )

    scenario(
      'A base commit missing from the clone fails instead of falling back to bootstrap',
      Gherkin.Do.pipe(
        Given('the instrument-ref launcher record')('record', () => Effect.succeed('instrument-ref')),
        When('the base-missing selection is read')('selection', () => selections(['base-missing'])),
        Then('it exits non-zero without a ref')((scope, expect) => {
          const first = scope.selection[0]
          return expect({
            code: first?.code,
            stdout: first?.stdout,
            missing: first?.stderr.includes('is not in this clone') ?? false,
          }).toEqual({ code: 1, stdout: '', missing: true })
        }),
      ),
    )
  })
