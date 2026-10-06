import { NodeServices } from '@effect/platform-node'
import { assembleScorecard, renderSummary } from '@starter/ratstack-scorecard'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { sampleInput } from './__fixtures__/scorecard.fixture.ts'

const Feature = makeFeature({ it })

const stepSummaryLimit = 1024 * 1024

Feature('Rendering the scorecard summary')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'The summary lists one row per definition and the beaten count',
      Gherkin.Do.pipe(
        Given('a scorecard input with measured cells')('input', () => Effect.succeed(sampleInput)),
        When('the summary is rendered')(
          'summary',
          (scope) => Effect.succeed(renderSummary(assembleScorecard(scope.input))),
        ),
        Then('it lists every row and counts the beaten ones')((scope, expect) =>
          expect({
            rows: scope.summary.split('\n').filter((line) => line.startsWith('| ')).length,
            beaten: scope.summary.includes('Beaten: 2 of 2 rows.'),
            ratchet: scope.summary.includes('first baseline (no `main` artifact), 0 failing rows'),
          }).toEqual({ rows: 4, beaten: true, ratchet: true })
        ),
      ),
    )

    scenario(
      'The summary stays inside the step-summary byte limit',
      Gherkin.Do.pipe(
        Given('a scorecard input with measured cells')('input', () => Effect.succeed(sampleInput)),
        When('the summary is rendered')(
          'summary',
          (scope) => Effect.succeed(renderSummary(assembleScorecard(scope.input))),
        ),
        Then('its UTF-8 length is under one mebibyte')((scope, expect) =>
          expect({ fits: new TextEncoder().encode(scope.summary).byteLength < stepSummaryLimit }).toEqual({
            fits: true,
          })
        ),
      ),
    )
  })
