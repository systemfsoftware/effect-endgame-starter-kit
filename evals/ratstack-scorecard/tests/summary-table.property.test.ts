import { test } from '@fast-check/vitest'
import { describe } from 'vitest'
import { assembleScorecard } from '../src/model/scorecard-document.ts'
import { assembleInput } from '../src/model/scorecard.arbitrary.ts'
import { renderSummary } from '../src/model/summary-table.ts'

const stepSummaryLimit = 1024 * 1024

describe('renderSummary', () => {
  test.prop([assembleInput])(
    'the summary of any registry-sized document fits the 1 MiB step summary limit',
    (input) => new TextEncoder().encode(renderSummary(assembleScorecard(input))).byteLength < stepSummaryLimit,
  )

  test.prop([assembleInput])('the summary table has one line per row whatever the cell text holds', (input) => {
    const doc = assembleScorecard(input)
    const tableLines = renderSummary(doc).split('\n').filter((line) => line.startsWith('| ')).length
    return tableLines === doc.rows.length + 2
  })
})
