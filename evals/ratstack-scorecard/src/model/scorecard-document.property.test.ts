import { test } from '@fast-check/vitest'
import Ajv from 'ajv'
import { describe } from 'vitest'
import schema from '../../scorecard.schema.json' with { type: 'json' }
import { assembleScorecard } from './scorecard-document.ts'
import { assembleInput } from './scorecard.arbitrary.ts'

const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)

const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value))

describe('assembleScorecard', () => {
  test.prop([assembleInput])(
    'every assembled document validates against scorecard.schema.json',
    (input) => validate(roundTrip(assembleScorecard(input))),
  )

  test.prop([assembleInput])('a document without provenance.commit is refused by the schema', (input) => {
    const { commit: _, ...provenance } = assembleScorecard(input).provenance
    return !validate(roundTrip({ ...assembleScorecard(input), provenance }))
  })

  test.prop([assembleInput])(
    'a side with no cell for a row gets an instrument error naming the row',
    (input) =>
      assembleScorecard(input).rows.every((row) =>
        (['ratstack', 'starter'] as const)
          .filter((side) => input.cells[row.definition.id]?.[side] === undefined)
          .every((side) =>
            row[side].cell._tag === 'InstrumentError' && row[side].cell.error.includes(row.definition.id)
          )
      ),
  )
})
