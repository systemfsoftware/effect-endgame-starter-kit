import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import type { RegistrationLookup } from '../confirm/confirm.schema.ts'
import type { SessionLookup } from '../register/register.schema.ts'
import type { Registration } from '../workshop.schema.ts'
import type { WorkshopDriver, WorkshopStore } from './workshop-driver.ts'
import type { AuditRow, RegistrationRow, SessionRow } from './workshop-store.schema.ts'

export interface WorkshopTables {
  readonly sessions: ReadonlyArray<typeof SessionRow.Encoded>
  readonly registrations: ReadonlyArray<typeof RegistrationRow.Encoded>
  readonly audit: ReadonlyArray<typeof AuditRow.Encoded>
}

const seatsOccupied = (registration: typeof Registration.Encoded): number =>
  Match.value(registration).pipe(
    Match.tagsExhaustive({
      Held: () => 1,
      Confirmed: () => 1,
      Waitlisted: () => 0,
      Cancelled: () => 0,
      Expired: () => 0,
    }),
  )

const waitlistPlace = (registration: typeof Registration.Encoded): number =>
  Match.value(registration).pipe(
    Match.tagsExhaustive({
      Waitlisted: ({ position }) => position,
      Held: () => 0,
      Confirmed: () => 0,
      Cancelled: () => 0,
      Expired: () => 0,
    }),
  )

const sessionLookup = (tables: WorkshopTables, sessionId: string): typeof SessionLookup.Encoded => {
  const inSession = tables.registrations.filter((row) => row.sessionId === sessionId)
  return Arr.findFirst(tables.sessions, (session) => session.sessionId === sessionId).pipe(
    Option.match({
      onNone: (): typeof SessionLookup.Encoded => ({ _tag: 'SessionMissing' }),
      onSome: ({ capacity }): typeof SessionLookup.Encoded => ({
        _tag: 'SessionFound',
        capacity,
        taken: Num.sumAll(inSession.map((row) => seatsOccupied(row.registration))),
        waitlistTail: Arr.reduce(inSession, 0, (tail, row) => Num.max(tail, waitlistPlace(row.registration))),
      }),
    }),
  )
}

const registrationLookup = (tables: WorkshopTables, registrationId: number): typeof RegistrationLookup.Encoded =>
  Arr.findFirst(tables.registrations, (row) => row.registrationId === registrationId).pipe(
    Option.match({
      onNone: (): typeof RegistrationLookup.Encoded => ({ _tag: 'RegistrationMissing' }),
      onSome: (row): typeof RegistrationLookup.Encoded => ({
        _tag: 'RegistrationFound',
        holder: row.person,
        state: row.registration,
      }),
    }),
  )

export const memoryDriver = (tables: Ref.Ref<WorkshopTables>): WorkshopDriver => ({
  session: (sessionId) => Effect.map(Ref.get(tables), (current) => sessionLookup(current, sessionId)),
  personSeats: (person) =>
    Effect.map(Ref.get(tables), (current) =>
      Num.sumAll(
        current.registrations
          .filter((row) => row.person === person)
          .map((row) => seatsOccupied(row.registration)),
      )),
  registration: (registrationId) =>
    Effect.map(Ref.get(tables), (current) => registrationLookup(current, registrationId)),
  insertRegistrations: (rows) =>
    Ref.modify(tables, (current) => {
      const inserted = rows.map((row, index) => ({
        ...row,
        registrationId: current.registrations.length + index + 1,
      }))
      return [
        inserted.map((row) => row.registrationId),
        { ...current, registrations: [...current.registrations, ...inserted] },
      ]
    }),
  updateRegistration: (registrationId, registration) =>
    Ref.update(tables, (current) => ({
      ...current,
      registrations: current.registrations.map((row) =>
        row.registrationId === registrationId ? { ...row, registration } : row
      ),
    })),
  appendAudit: (row) =>
    Ref.update(tables, (current) => ({
      ...current,
      audit: [...current.audit, { ...row, seq: current.audit.length + 1 }],
    })),
  ledger: Effect.map(Ref.get(tables), ({ registrations, audit }) => ({ registrations, audit })),
})

export const memoryStore = (sessions: ReadonlyArray<typeof SessionRow.Encoded>): Effect.Effect<WorkshopStore> =>
  UnitOfWork.memory<WorkshopTables, WorkshopDriver>({ sessions, registrations: [], audit: [] }, memoryDriver)
