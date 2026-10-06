import { NodeServices } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import Ajv from 'ajv'
import { Schema } from 'effect'
import schema from '../scorecard.schema.json' with { type: 'json' }
import { type LauncherRecord, launcherRun } from './__fixtures__/launcher-run.ts'
import { ScorecardJson } from './__fixtures__/scorecard-json.schema.ts'

const Feature = makeFeature({ it })
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)

const writtenOf = (record: LauncherRecord) =>
  Schema.decodeEffect(ScorecardJson)(record.files['scorecard.json'] ?? 'null')

Feature('Aggregating the families through the launcher')
  .live('the launcher reads its aggregate record and fixtures from disk')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A row beaten on main and tied on the PR fails the job and writes a valid scorecard',
      Gherkin.Do.pipe(
        Given('the aggregate-regressed launcher record')('record', () => launcherRun('aggregate-regressed')),
        When('the written scorecard is read')('document', (scope) => writtenOf(scope.record)),
        Then('the job failed naming the row and wrote a schema-valid scorecard')((scope, expect) =>
          expect({
            code: scope.record.code,
            names: [scope.record.stderr.includes('M23'), scope.record.stderr.includes('M28')],
            valid: validate(scope.document),
          }).toEqual({ code: 1, names: [true, false], valid: true })
        ),
      ),
    )

    scenario(
      'Without a main artifact a push run is a passing first baseline',
      Gherkin.Do.pipe(
        Given('the aggregate-first-baseline launcher record')('record', () => launcherRun('aggregate-first-baseline')),
        When('the written scorecard is read')('document', (scope) => writtenOf(scope.record)),
        Then('the job passed with a first-baseline ratchet and the scorecard validates')((scope, expect) =>
          expect({
            code: scope.record.code,
            ratchet: (scope.record.files['summary.md'] ?? '').includes('first baseline (no `main` artifact)'),
            valid: validate(scope.document),
          }).toEqual({ code: 0, ratchet: true, valid: true })
        ),
      ),
    )
  })
