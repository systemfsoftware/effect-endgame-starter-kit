import { describe, it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Deadline, Held, HoldTtl, Instant, PersonId } from '../../workshop.schema.ts'
import {
  confirmSeat,
  ConfirmSeatCommand,
  HoldExpired,
  NotHeld,
  NotHolder,
  RegistrationUnknown,
  SeatConfirmed,
} from '../confirm-seat.workflow.ts'
import { RegistrationFound, RegistrationLookup } from '../confirm.schema.ts'

interface ConfirmationDraw {
  readonly registration: RegistrationLookup
  readonly stranger: PersonId
  readonly confirmsOwn: boolean
  readonly now: Instant
}

const confirmationOf = ({ registration, stranger, confirmsOwn, now }: ConfirmationDraw): ConfirmSeatCommand =>
  ConfirmSeatCommand.make({
    registration,
    person: S.is(RegistrationFound)(registration) && confirmsOwn ? registration.holder : stranger,
    now,
  })

type Holding = 'missing' | 'not-held' | 'held-by-another' | 'held-by-confirmer'

const holdingOf = (command: ConfirmSeatCommand): Holding =>
  Match.value(command.registration).pipe(
    Match.tag('RegistrationMissing', (): Holding => 'missing'),
    Match.tag('RegistrationFound', ({ holder, state }): Holding =>
      S.is(Held)(state) ? (holder === command.person ? 'held-by-confirmer' : 'held-by-another') : 'not-held'),
    Match.exhaustive,
  )

describe('confirmSeat — a held seat confirmed by its holder before its deadline', () => {
  it.prop(
    '∀c_RegistrationUnknown_≡Missing',
    {
      of: { registration: RegistrationLookup, stranger: PersonId, confirmsOwn: S.Boolean, now: Instant },
      subject: confirmSeat,
    },
    (subject, drawn) => {
      const command = confirmationOf(drawn)
      return subject(command).pipe(Result.getOrThrow, S.is(RegistrationUnknown)) === (holdingOf(command) === 'missing')
    },
  )

  it.prop(
    '∀c_NotHeld_≡StateNotHeld',
    {
      of: { registration: RegistrationLookup, stranger: PersonId, confirmsOwn: S.Boolean, now: Instant },
      subject: confirmSeat,
    },
    (subject, drawn) => {
      const command = confirmationOf(drawn)
      return subject(command).pipe(Result.getOrThrow, S.is(NotHeld)) === (holdingOf(command) === 'not-held')
    },
  )

  it.prop(
    '∀c_NotHolder_≡HeldByAnother',
    {
      of: { registration: RegistrationLookup, stranger: PersonId, confirmsOwn: S.Boolean, now: Instant },
      subject: confirmSeat,
    },
    (subject, drawn) => {
      const command = confirmationOf(drawn)
      return subject(command).pipe(Result.getOrThrow, S.is(NotHolder)) === (holdingOf(command) === 'held-by-another')
    },
  )

  it.prop(
    '∀h_HolderConfirmation_≡NowStrictlyBeforeExpiresAt',
    {
      of: { holder: PersonId, now: Instant, lead: HoldTtl, lag: S.Natural, ahead: S.Boolean, exact: S.Boolean },
      subject: confirmSeat,
    },
    (subject, { holder, now, lead, lag, ahead, exact }) => {
      const expiresAt = ahead ? now + lead : now - (exact ? 0 : lag % (now + 1))
      const command = ConfirmSeatCommand.make({
        registration: RegistrationFound.make({ holder, state: Held.make({ expiresAt: Deadline.make(expiresAt) }) }),
        person: holder,
        now,
      })
      return subject(command).pipe(Result.getOrThrow, S.is(ahead ? SeatConfirmed : HoldExpired))
    },
  )
})
