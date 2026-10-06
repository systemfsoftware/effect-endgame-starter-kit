import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  Deadline,
  HoldTtl,
  Instant,
  PersonId,
  RequestedSeats,
  SeatCap,
  SeatCount,
  SessionId,
  WaitlistPosition,
} from '../workshop.schema.ts'
import { type SessionFound, SessionLookup } from './register.schema.ts'

const RegisterSeatsTypeId: unique symbol = Symbol.for('endgame/registration/RegisterSeatsDecision')

export class Seated extends S.TaggedClass<Seated>()('Seated', {
  held: SeatCount,
  expiresAt: Deadline,
  waitlisted: SeatCount,
  nextPosition: WaitlistPosition,
  refusedByCap: SeatCount,
}) {
  readonly [RegisterSeatsTypeId] = RegisterSeatsTypeId
}

export class CapReached extends S.TaggedClass<CapReached>()('CapReached', {}) {
  readonly [RegisterSeatsTypeId] = RegisterSeatsTypeId
}

export class SessionUnknown extends S.TaggedClass<SessionUnknown>()('SessionUnknown', {}) {
  readonly [RegisterSeatsTypeId] = RegisterSeatsTypeId
}

export const RegisterSeatsDecision = S.Union([Seated, CapReached, SessionUnknown])
export type RegisterSeatsDecision = S.Schema.Type<typeof RegisterSeatsDecision>

const decisionTags = {
  Seated: 'Seated',
  CapReached: 'CapReached',
  SessionUnknown: 'SessionUnknown',
} as const satisfies { readonly [K in RegisterSeatsDecision['_tag']]: K }

export const RegisterSeatsDecisionTag = S.Literals(Object.values(decisionTags))

export class RegisterSeatsCommand extends S.Class<RegisterSeatsCommand>('RegisterSeatsCommand')({
  sessionId: SessionId,
  person: PersonId,
  session: SessionLookup,
  personSeats: SeatCount,
  cap: SeatCap,
  requested: RequestedSeats,
  now: Instant,
  holdTtl: HoldTtl,
}) {
  static readonly [Workflow.InstrumentationBrand]: {
    readonly sessionId: 'app.registration.session_id'
    readonly requested: 'app.registration.requested_seats'
  } = {
    sessionId: 'app.registration.session_id',
    requested: 'app.registration.requested_seats',
  }
}

const seatsWithin = (command: RegisterSeatsCommand, session: SessionFound, budget: number): Seated => {
  const free = Num.max(0, session.capacity - session.taken)
  const held = Num.min(Num.min(command.requested, free), budget)
  const waitlisted = Num.min(command.requested - held, budget - held)
  return new Seated({
    held: SeatCount.make(held),
    expiresAt: Deadline.make(command.now + command.holdTtl),
    waitlisted: SeatCount.make(waitlisted),
    nextPosition: WaitlistPosition.make(session.waitlistTail + 1),
    refusedByCap: SeatCount.make(command.requested - held - waitlisted),
  })
}

const seatsFor = (command: RegisterSeatsCommand, session: SessionFound): Seated | CapReached => {
  const budget = command.cap - command.personSeats
  return Match.value(budget > 0).pipe(
    Match.when(true, () => seatsWithin(command, session, budget)),
    Match.when(false, () => new CapReached({})),
    Match.exhaustive,
  )
}

export const registerSeats = Workflow.make({
  command: RegisterSeatsCommand,
  decision: RegisterSeatsDecision,
  error: S.Never,
  decide: (command) =>
    Result.succeed(
      Match.value(command.session).pipe(
        Match.tag('SessionFound', (session) => seatsFor(command, session)),
        Match.tag('SessionMissing', () => new SessionUnknown({})),
        Match.exhaustive,
      ),
    ),
})
