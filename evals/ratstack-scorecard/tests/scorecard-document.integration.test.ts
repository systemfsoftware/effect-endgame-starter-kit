import { NodeServices } from '@effect/platform-node'
import { assembleScorecard, type MeasuredCell, type Verdict } from '@starter/ratstack-scorecard'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import Ajv from 'ajv'
import { Effect, Match } from 'effect'
import schema from '../scorecard.schema.json' with { type: 'json' }
import { sampleInput, sampleWithoutCells } from './__fixtures__/scorecard.fixture.ts'

const Feature = makeFeature({ it })
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)

const verdictTagOf = (verdict: Verdict): string => verdict._tag

const errorOf = (cell: MeasuredCell['cell']): string | undefined =>
  Match.value(cell).pipe(Match.tag('InstrumentError', (error) => error.error), Match.orElse(() => undefined))

Feature('Assembling the scorecard document')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'An assembled document validates against the published schema',
      Gherkin.Do.pipe(
        Given('a scorecard input with measured cells')('input', () => Effect.succeed(sampleInput)),
        When('the document is assembled')('document', (scope) => Effect.succeed(assembleScorecard(scope.input))),
        Then('the published schema accepts it')((scope, expect) =>
          expect({ valid: validate(scope.document) }).toEqual({ valid: true })
        ),
      ),
    )

    scenario(
      'A row with no produced cell is an instrument error naming the row',
      Gherkin.Do.pipe(
        Given('a scorecard input with no cells')('input', () => Effect.succeed(sampleWithoutCells)),
        When('the document is assembled')('document', (scope) => Effect.succeed(assembleScorecard(scope.input))),
        Then('each side names the row it could not measure')((scope, expect) =>
          expect(
            scope.document.rows.map((row) => [
              `${row.definition.id}:${errorOf(row.ratstack.cell)?.includes(String(row.definition.id))}`,
              `${row.definition.id}:${errorOf(row.starter.cell)?.includes(String(row.definition.id))}`,
            ]),
          ).toEqual([['M23:true', 'M23:true'], ['M12:true', 'M12:true']])
        ),
      ),
    )

    scenario(
      'Every row verdict is a published verdict for its own id',
      Gherkin.Do.pipe(
        Given('a scorecard input with measured cells')('input', () => Effect.succeed(sampleInput)),
        When('the document is assembled')('document', (scope) => Effect.succeed(assembleScorecard(scope.input))),
        Then('each row carries the verdict its cells imply')((scope, expect) =>
          expect(scope.document.rows.map((row) => [row.definition.id, verdictTagOf(row.verdict)])).toEqual([
            ['M23', 'Beaten'],
            ['M12', 'Beaten'],
          ])
        ),
      ),
    )
  })
