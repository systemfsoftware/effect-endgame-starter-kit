import { NodeServices } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Schema } from 'effect'
import { MetricIdSchema, RowIdSchema } from '../decide/schema.ts'

const Feature = makeFeature({ it })

const verdicts = <A>(
  schema: Schema.Codec<A>,
  values: readonly string[],
): Effect.Effect<readonly string[]> =>
  Effect.forEach(values, (value) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.match({ onFailure: () => 'refused', onSuccess: () => 'ok' }),
    ))

Feature('Enforcing the published row and metric ids')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A metric id is only M and digits',
      Gherkin.Do.pipe(
        Given('a set of metric id candidates')('values', () => Effect.succeed(['M23', 'M1.Bad', 'X1', 'M1.5e3'])),
        When('each is decoded as a metric id')('verdicts', (scope) => verdicts(MetricIdSchema, scope.values)),
        Then('only M and digits decodes')((scope, expect) =>
          expect(scope.verdicts).toEqual(['ok', 'refused', 'refused', 'refused'])
        ),
      ),
    )

    scenario(
      'A row id refuses an uppercase suffix',
      Gherkin.Do.pipe(
        Given('a set of row id candidates')(
          'values',
          () => Effect.succeed(['M23', 'M12.seats-beyond', 'M1.Bad', 'X1']),
        ),
        When('each is decoded as a row id')('verdicts', (scope) => verdicts(RowIdSchema, scope.values)),
        Then('only the published suffixes decode')((scope, expect) =>
          expect(scope.verdicts).toEqual(['ok', 'ok', 'refused', 'refused'])
        ),
      ),
    )
  })
