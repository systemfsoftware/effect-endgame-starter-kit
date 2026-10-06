import type { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import type * as Effect from 'effect/Effect'

import type { RegistrationLookup } from '../confirm/confirm.schema.ts'
import type { SessionLookup } from '../register/register.schema.ts'
import type { PersonId, Registration, RegistrationId, SessionId } from '../workshop.schema.ts'
import type { AuditRow, Ledger, RegistrationRow } from './workshop-store.schema.ts'

export type StoreFailure = UnitOfWork.StoreUnavailable

export type NewRegistration = Omit<typeof RegistrationRow.Encoded, 'registrationId'>

export type NewAuditRow = Omit<typeof AuditRow.Encoded, 'seq'>

export interface WorkshopDriver {
  readonly session: (sessionId: SessionId) => Effect.Effect<typeof SessionLookup.Encoded, StoreFailure>
  readonly personSeats: (person: PersonId) => Effect.Effect<number, StoreFailure>
  readonly registration: (
    registrationId: RegistrationId,
  ) => Effect.Effect<typeof RegistrationLookup.Encoded, StoreFailure>
  readonly insertRegistrations: (
    rows: ReadonlyArray<NewRegistration>,
  ) => Effect.Effect<ReadonlyArray<typeof RegistrationId.Encoded>, StoreFailure>
  readonly updateRegistration: (
    registrationId: RegistrationId,
    registration: typeof Registration.Encoded,
  ) => Effect.Effect<void, StoreFailure>
  readonly appendAudit: (row: NewAuditRow) => Effect.Effect<void, StoreFailure>
  readonly ledger: Effect.Effect<typeof Ledger.Encoded, StoreFailure>
}

export type WorkshopStore = UnitOfWork.UnitOfWork<WorkshopDriver, StoreFailure>
