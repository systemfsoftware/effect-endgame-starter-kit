import { NodeServices } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Option } from 'effect'
import { mainBaselineOf, type WorkflowRun } from '../decide/main-scorecard.ts'

const Feature = makeFeature({ it })

const run: WorkflowRun = { id: 7, head_sha: 'a'.repeat(40) }
const artifact = '{"schemaVersion":1}'

const shown = (baseline: Option.Option<{ readonly run: WorkflowRun; readonly text: string }>): string =>
  Option.match(baseline, {
    onNone: () => 'first baseline',
    onSome: (found) => `${found.run.id}:${found.text}`,
  })

Feature('Choosing the baseline that main publishes')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'The latest successful push run supplies main with its artifact document',
      Gherkin.Do.pipe(
        Given('a runs listing naming one successful push run')('runs', () => Effect.succeed([run])),
        When('the baseline is resolved')(
          'baseline',
          (scope) => mainBaselineOf(scope.runs, () => Effect.succeed(artifact)),
        ),
        Then('it is that run and its document')((scope, expect) =>
          expect(shown(scope.baseline)).toEqual('7:{"schemaVersion":1}')
        ),
      ),
    )

    scenario(
      'An empty runs listing is a first baseline that fetches nothing',
      Gherkin.Do.pipe(
        Given('an empty runs listing')('runs', () => Effect.succeed<readonly WorkflowRun[]>([])),
        When('the baseline is resolved')(
          'baseline',
          (scope) => mainBaselineOf(scope.runs, () => Effect.fail('no run to fetch' as const)),
        ),
        Then('it is absent and the run exits zero')((scope, expect) =>
          expect(shown(scope.baseline)).toEqual('first baseline')
        ),
      ),
    )
  })
