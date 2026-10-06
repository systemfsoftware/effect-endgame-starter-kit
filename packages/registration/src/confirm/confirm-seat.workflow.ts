import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { type Held, Instant, PersonId, RegistrationId } from '../workshop.schema.ts'
import { type RegistrationFound, RegistrationLookup } from './confirm.schema.ts'

const ConfirmSeatTypeId: unique symbol = Symbol.for('endgame/registration/ConfirmSeatDecision')

export class SeatConfirmed extends S.TaggedClass<SeatConfirmed>()('SeatConfirmed', {}) {
  readonly [ConfirmSeatTypeId] = ConfirmSeatTypeId
}

export class NotHolder extends S.TaggedClass<NotHolder>()('NotHolder', {}) {
  readonly [ConfirmSeatTypeId] = ConfirmSeatTypeId
}

export class HoldExpired extends S.TaggedClass<HoldExpired>()('HoldExpired', {}) {
  readonly [ConfirmSeatTypeId] = ConfirmSeatTypeId
}

export class NotHeld extends S.TaggedClass<NotHeld>()('NotHeld', {}) {
  readonly [ConfirmSeatTypeId] = ConfirmSeatTypeId
}

export class RegistrationUnknown extends S.TaggedClass<RegistrationUnknown>()('RegistrationUnknown', {}) {
  readonly [ConfirmSeatTypeId] = ConfirmSeatTypeId
}

export const ConfirmSeatDecision = S.Union([SeatConfirmed, NotHolder, HoldExpired, NotHeld, RegistrationUnknown])
export type ConfirmSeatDecision = S.Schema.Type<typeof ConfirmSeatDecision>

const decisionTags = {
  SeatConfirmed: 'SeatConfirmed',
  NotHolder: 'NotHolder',
  HoldExpired: 'HoldExpired',
  NotHeld: 'NotHeld',
  RegistrationUnknown: 'RegistrationUnknown',
} as const satisfies { readonly [K in ConfirmSeatDecision['_tag']]: K }

export const ConfirmSeatDecisionTag = S.Literals(Object.values(decisionTags))

export class ConfirmSeatCommand extends S.Class<ConfirmSeatCommand>('ConfirmSeatCommand')({
  registrationId: RegistrationId,
  registration: RegistrationLookup,
  person: PersonId,
  now: Instant,
}) {
  static readonly [Workflow.InstrumentationBrand]: {
    readonly registrationId: 'app.registration.registration_id'
  } = {
    registrationId: 'app.registration.registration_id',
  }
}

const beforeDeadline = (command: ConfirmSeatCommand, held: Held): SeatConfirmed | HoldExpired =>
  Match.value(command.now < held.expiresAt).pipe(
    Match.when(true, () => new SeatConfirmed({})),
    Match.when(false, () => new HoldExpired({})),
    Match.exhaustive,
  )

const heldBy = (command: ConfirmSeatCommand, found: RegistrationFound, held: Held): ConfirmSeatDecision =>
  Match.value(found.holder === command.person).pipe(
    Match.when(true, () => beforeDeadline(command, held)),
    Match.when(false, () => new NotHolder({})),
    Match.exhaustive,
  )

const stateOf = (command: ConfirmSeatCommand, found: RegistrationFound): ConfirmSeatDecision =>
  Match.value(found.state).pipe(
    Match.tag('Held', (held) => heldBy(command, found, held)),
    Match.tag('Confirmed', 'Waitlisted', 'Cancelled', 'Expired', () => new NotHeld({})),
    Match.exhaustive,
  )

export const confirmSeat = Workflow.make({
  command: ConfirmSeatCommand,
  decision: ConfirmSeatDecision,
  error: S.Never,
  decide: (command) =>
    Result.succeed(
      Match.value(command.registration).pipe(
        Match.tag('RegistrationFound', (found) => stateOf(command, found)),
        Match.tag('RegistrationMissing', () => new RegistrationUnknown({})),
        Match.exhaustive,
      ),
    ),
})
