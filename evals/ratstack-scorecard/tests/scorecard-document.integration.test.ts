import { NodeServices } from '@effect/platform-node'
import {
  type AssembleInput,
  assembleScorecard,
  type MeasuredCell,
  renderSummary,
  type RowOutcome,
  type ScorecardDocument,
  type Verdict,
} from '@starter/ratstack-scorecard'
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

const reBaselinedOf = (outcome: RowOutcome): readonly string[] =>
  Match.value(outcome).pipe(
    Match.tag('ReBaselined', (o) => [`${o.id}:${o.mainHash}:${o.prHash}`]),
    Match.orElse(() => []),
  )

const reBaselined = (document: ScorecardDocument): readonly string[] => document.ratchet.outcomes.flatMap(reBaselinedOf)

const withChangedHash: AssembleInput = {
  ...sampleInput,
  main: {
    _tag: 'Found',
    commit: 'f'.repeat(40),
    rows: assembleScorecard(sampleInput).rows.map((row) =>
      row.definition.id === 'M23' ? { ...row, definitionHash: 'main-changed' } : row
    ),
  },
}

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
    scenario(
      'A changed definition hash publishes a ReBaselined carrying both hashes and validates',
      Gherkin.Do.pipe(
        Given('a main baseline whose M23 definition hash differs')('input', () => Effect.succeed(withChangedHash)),
        When('the document is assembled')('document', (scope) => Effect.succeed(assembleScorecard(scope.input))),
        Then('the schema accepts it and the summary lists both hashes')((scope, expect) =>
          expect({
            reBaselined: reBaselined(scope.document),
            drift: renderSummary(scope.document).includes(
              `- M23: \`main-changed\` on \`main\`, \`${'d'.repeat(40)}\` here`,
            ),
            valid: validate(scope.document),
          }).toEqual({
            reBaselined: [`M23:main-changed:${'d'.repeat(40)}`],
            drift: true,
            valid: true,
          })
        ),
      ),
    )
  })
