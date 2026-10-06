import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'

import { RecordCspViolation } from './FrontDoorTaxonomy'
import type { CspViolation } from './record-csp-violation.schema'
import { recordCspViolation } from './record-csp-violation.workflow'

const read = (violation: CspViolation) => Effect.succeed(violation)

export const recordCspViolationCell = Sandwich.named(RecordCspViolation.name)(read)
  .decide(recordCspViolation)
  .write({
    RecordBlockedOrigin: () => Effect.void,
    RecordBlockedKeyword: () => Effect.void,
    RecordBlockedUnrecognized: () => Effect.void,
    CommandRejected: () => Effect.void,
  })
