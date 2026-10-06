import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'

import { Confirm } from '../RegistrationTaxonomy.ts'
import { auditRow } from '../workshop-store/audit-row.ts'
import type { WorkshopDriver } from '../workshop-store/workshop-driver.ts'
import { confirmSeat } from './confirm-seat.workflow.ts'
import type { ConfirmRequest } from './confirm.schema.ts'

export const confirmCell = (unit: UnitOfWork.Unit<WorkshopDriver>) => {
  const refused = <Refusal extends object>(refusal: Refusal, command: { readonly now: number }) =>
    UnitOfWork.use(
      unit,
      (driver) => driver.appendAudit(auditRow({ decision: Confirm.name, command, outcome: refusal })),
    ).pipe(
      Effect.as(refusal),
    )
  return Sandwich.named(Confirm.name)((request: ConfirmRequest) =>
    Effect.all({
      registration: UnitOfWork.use(unit, (driver) => driver.registration(request.registrationId)),
      now: Clock.currentTimeMillis,
    }).pipe(
      Effect.map(({ registration, now }) => ({
        registrationId: request.registrationId,
        registration,
        person: request.person,
        now,
      })),
    )
  )
    .decide(confirmSeat)
    .write({
      SeatConfirmed: (confirmed, command) =>
        UnitOfWork.use(unit, (driver) =>
          Effect.andThen(
            driver.updateRegistration(command.registrationId, { _tag: 'Confirmed' }),
            driver.appendAudit(auditRow({ decision: Confirm.name, command, outcome: confirmed })),
          )).pipe(Effect.as(confirmed)),
      NotHolder: refused,
      HoldExpired: refused,
      NotHeld: refused,
      RegistrationUnknown: refused,
      CommandRejected: (rejected) => Effect.fail(new UnitOfWork.StoreUnavailable({ cause: rejected })),
    })
}
