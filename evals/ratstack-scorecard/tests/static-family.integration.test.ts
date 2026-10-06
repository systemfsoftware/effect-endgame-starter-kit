import { NodeServices } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Match, Schema } from 'effect'
import { type Cell, Family } from './__fixtures__/family.schema.ts'
import { type LauncherRecord, launcherRun } from './__fixtures__/launcher-run.ts'

const Feature = makeFeature({ it })

const cellsOf = (family: Family, id: string, side: 'ratstack' | 'starter'): readonly Cell[] =>
  family.cells.filter((cell) => cell.id === id && cell.side === side).map((cell) => cell.measured.cell)

const cellTagOf = (cell: Cell | undefined): string | undefined => cell?._tag

const errorOf = (cell: Cell | undefined): string | undefined =>
  cell === undefined
    ? undefined
    : Match.value(cell).pipe(Match.tag('InstrumentError', (error) => error.error), Match.orElse(() => undefined))

const familyOf = (record: LauncherRecord) =>
  Schema.decodeEffect(Schema.fromJsonString(Family))(record.files['family.json'] ?? 'null')

Feature('Measuring the static family through the launcher')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'Each side gets one M23 and one M28 cell of three runs',
      Gherkin.Do.pipe(
        Given('the static-family launcher record')('record', () => launcherRun('static-family')),
        When('the family cells are collected')('family', (scope) => familyOf(scope.record)),
        Then('each side counts only unvendored comment directives')((scope, expect) => {
          const m23 = (['ratstack', 'starter'] as const).map((side) => cellsOf(scope.family, 'M23', side))
          const m28 = cellsOf(scope.family, 'M28', 'ratstack')
          return expect({
            ratstack: m23[0],
            starter: m23[1],
            packages: m28.length === 1 ? m28 : [],
            total: scope.family.cells.length,
          }).toEqual({
            ratstack: [{ _tag: 'Measured', runs: [2, 2, 2] }],
            starter: [{ _tag: 'Measured', runs: [1, 1, 1] }],
            packages: m28,
            total: 4,
          })
        }),
      ),
    )

    scenario(
      'A tool that exits non-zero gives an instrument error carrying its exit code',
      Gherkin.Do.pipe(
        Given('the failing-tool launcher record')('record', () => launcherRun('static-family-failing-tool')),
        When('the family cells are collected')('family', (scope) => familyOf(scope.record)),
        Then('both sides report the exit code')((scope, expect) => {
          const side = (name: 'ratstack' | 'starter') => cellsOf(scope.family, 'M23', name)[0]
          return expect({
            failing: (['ratstack', 'starter'] as const).map((name) =>
              (errorOf(side(name)) ?? '').includes('extract-comments exited 3')
            ),
            tags: (['ratstack', 'starter'] as const).map((name) => cellTagOf(side(name))),
          }).toEqual({ failing: [true, true], tags: ['InstrumentError', 'InstrumentError'] })
        }),
      ),
    )
  })
