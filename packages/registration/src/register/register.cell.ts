import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'

import { Register } from '../RegistrationTaxonomy.ts'
import { auditRow } from '../workshop-store/audit-row.ts'
import type { WorkshopDriver } from '../workshop-store/workshop-driver.ts'
import type { WorkshopPolicy } from '../workshop.schema.ts'
import { registerSeats } from './register-seats.workflow.ts'
import type { RegisterRequest } from './register.schema.ts'

export const registerCell = (policy: WorkshopPolicy) => (unit: UnitOfWork.Unit<WorkshopDriver>) =>
  Sandwich.named(Register.name)((request: RegisterRequest) =>
    Effect.all({
      found: UnitOfWork.use(unit, (driver) =>
        Effect.all({
          session: driver.session(request.sessionId),
          personSeats: driver.personSeats(request.person),
        })),
      now: Clock.currentTimeMillis,
    }).pipe(
      Effect.map(({ found, now }) => ({
        sessionId: request.sessionId,
        person: request.person,
        session: found.session,
        personSeats: found.personSeats,
        cap: policy.cap,
        requested: request.requested,
        now,
        holdTtl: policy.holdTtl,
      })),
    )
  )
    .decide(registerSeats)
    .write({
      Seated: (seated, command) =>
        UnitOfWork.use(unit, (driver) =>
          Effect.all({
            heldRegistrations: driver.insertRegistrations(
              Array.from({ length: seated.held }, () => ({
                sessionId: command.sessionId,
                person: command.person,
                registration: { _tag: 'Held' as const, expiresAt: seated.expiresAt },
                decidedAt: command.now,
              })),
            ),
            waitlistedRegistrations: driver.insertRegistrations(
              Array.from({ length: seated.waitlisted }, (_, index) => ({
                sessionId: command.sessionId,
                person: command.person,
                registration: { _tag: 'Waitlisted' as const, position: seated.nextPosition + index },
                decidedAt: command.now,
              })),
            ),
            audited: driver.appendAudit(auditRow({ decision: Register.name, command, outcome: seated })),
          })).pipe(
            Effect.map(({ heldRegistrations, waitlistedRegistrations }) => ({
              ...seated,
              heldRegistrations,
              waitlistedRegistrations,
            })),
          ),
      CapReached: (refusal, command) =>
        UnitOfWork.use(
          unit,
          (driver) => driver.appendAudit(auditRow({ decision: Register.name, command, outcome: refusal })),
        ).pipe(
          Effect.as(refusal),
        ),
      SessionUnknown: (refusal, command) =>
        UnitOfWork.use(
          unit,
          (driver) => driver.appendAudit(auditRow({ decision: Register.name, command, outcome: refusal })),
        ).pipe(
          Effect.as(refusal),
        ),
      CommandRejected: (rejected) => Effect.fail(new UnitOfWork.StoreUnavailable({ cause: rejected })),
    })
