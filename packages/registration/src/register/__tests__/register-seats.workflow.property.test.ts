import { describe, it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { HoldTtl, Instant, RequestedSeats, SeatCap, SeatCount } from '../../workshop.schema.ts'
import {
  CapReached,
  registerSeats,
  RegisterSeatsCommand,
  type RegisterSeatsDecision,
  Seated,
  SessionUnknown,
} from '../register-seats.workflow.ts'
import { SessionFound, SessionMissing } from '../register.schema.ts'

interface Outcome {
  readonly decision: RegisterSeatsDecision
  readonly held: number
  readonly waitlisted: number
  readonly refused: number
}

const outcomeOf = (command: RegisterSeatsCommand, result: Result.Result<RegisterSeatsDecision, never>): Outcome =>
  result.pipe(
    Result.getOrThrow,
    Match.value,
    Match.tag('Seated', (decision) => ({
      decision,
      held: decision.held,
      waitlisted: decision.waitlisted,
      refused: decision.refusedByCap,
    })),
    Match.tag('CapReached', 'SessionUnknown', (decision) => ({
      decision,
      held: 0,
      waitlisted: 0,
      refused: command.requested,
    })),
    Match.exhaustive,
  )

const freeSeats = (command: RegisterSeatsCommand): number =>
  Match.value(command.session).pipe(
    Match.tag('SessionFound', ({ capacity, taken }) => Math.max(0, capacity - taken)),
    Match.tag('SessionMissing', () => 0),
    Match.exhaustive,
  )

const capRoom = (command: RegisterSeatsCommand): number => Math.max(0, command.cap - command.personSeats)

interface SeatableDraw {
  readonly session: SessionFound
  readonly cap: SeatCap
  readonly personSeats: SeatCount
  readonly requested: RequestedSeats
  readonly now: Instant
  readonly holdTtl: HoldTtl
}

const underCap = (drawn: SeatableDraw): RegisterSeatsCommand =>
  RegisterSeatsCommand.make({ ...drawn, personSeats: SeatCount.make(drawn.personSeats % drawn.cap) })

describe('registerSeats — seats held, waitlisted or refused by the cap', () => {
  it.prop(
    '∀c_HeldPlusWaitlistedPlusRefused_=Requested',
    { of: [RegisterSeatsCommand], subject: registerSeats },
    (subject, [command]) => {
      const { held, waitlisted, refused } = outcomeOf(command, subject(command))
      return held + waitlisted + refused === command.requested
    },
  )

  it.prop(
    '∀c_Held_≤FreeSeats',
    { of: [RegisterSeatsCommand], subject: registerSeats },
    (subject, [command]) => outcomeOf(command, subject(command)).held <= freeSeats(command),
  )

  it.prop(
    '∀c_SessionUnknown_≡SessionMissing',
    { of: [RegisterSeatsCommand], subject: registerSeats },
    (subject, [command]) =>
      S.is(SessionUnknown)(outcomeOf(command, subject(command)).decision) === S.is(SessionMissing)(command.session),
  )

  it.prop(
    '∀c_CapReached_≡FoundAndNothingGranted',
    { of: { drawn: RegisterSeatsCommand, atCap: S.Boolean }, subject: registerSeats },
    (subject, { drawn, atCap }) => {
      const command = RegisterSeatsCommand.make({
        session: drawn.session,
        personSeats: atCap ? SeatCount.make(drawn.cap) : drawn.personSeats,
        cap: drawn.cap,
        requested: drawn.requested,
        now: drawn.now,
        holdTtl: drawn.holdTtl,
      })
      const { decision, held, waitlisted } = outcomeOf(command, subject(command))
      return S.is(CapReached)(decision) === (S.is(SessionFound)(command.session) && held + waitlisted === 0)
    },
  )

  it.prop(
    '∀s_Granted_=Min(Requested,CapRoom)',
    {
      of: {
        session: SessionFound,
        cap: SeatCap,
        personSeats: SeatCount,
        requested: RequestedSeats,
        now: Instant,
        holdTtl: HoldTtl,
      },
      subject: registerSeats,
    },
    (subject, drawn) => {
      const command = underCap(drawn)
      const { held, waitlisted } = outcomeOf(command, subject(command))
      return held + waitlisted === Math.min(command.requested, capRoom(command))
    },
  )

  it.prop(
    '∀s_Waitlisted_→NoSeatFree',
    {
      of: {
        session: SessionFound,
        cap: SeatCap,
        personSeats: SeatCount,
        requested: RequestedSeats,
        now: Instant,
        holdTtl: HoldTtl,
      },
      subject: registerSeats,
    },
    (subject, drawn) => {
      const command = underCap(drawn)
      const { held, waitlisted } = outcomeOf(command, subject(command))
      return waitlisted === 0 || held === freeSeats(command)
    },
  )

  it.prop(
    '∀s_NextPosition_=WaitlistTailPlusOne',
    {
      of: {
        session: SessionFound,
        cap: SeatCap,
        personSeats: SeatCount,
        requested: RequestedSeats,
        now: Instant,
        holdTtl: HoldTtl,
      },
      subject: registerSeats,
    },
    (subject, drawn) => {
      const command = underCap(drawn)
      const { decision } = outcomeOf(command, subject(command))
      return S.is(Seated)(decision) && decision.nextPosition === drawn.session.waitlistTail + 1
    },
  )

  it.prop(
    '∀s_ExpiresAt_=NowPlusHoldTtl',
    {
      of: {
        session: SessionFound,
        cap: SeatCap,
        personSeats: SeatCount,
        requested: RequestedSeats,
        now: Instant,
        holdTtl: HoldTtl,
      },
      subject: registerSeats,
    },
    (subject, drawn) => {
      const command = underCap(drawn)
      const { decision } = outcomeOf(command, subject(command))
      return S.is(Seated)(decision) && decision.expiresAt === drawn.now + drawn.holdTtl
    },
  )
})
