import * as S from 'effect/Schema'

const POSTGRES_INTEGER_MAX = 2_147_483_647

const ECMASCRIPT_DATE_MAX_MILLIS = 8_640_000_000_000_000

export const SeatCount = S.Int.pipe(
  S.check(S.isBetween({ minimum: 0, maximum: POSTGRES_INTEGER_MAX })),
  S.brand('SeatCount'),
)
export type SeatCount = S.Schema.Type<typeof SeatCount>

export const SeatCap = S.Int.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: POSTGRES_INTEGER_MAX })),
  S.brand('SeatCap'),
)
export type SeatCap = S.Schema.Type<typeof SeatCap>

export const RequestedSeats = S.Int.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: POSTGRES_INTEGER_MAX })),
  S.brand('RequestedSeats'),
)
export type RequestedSeats = S.Schema.Type<typeof RequestedSeats>

export const Instant = S.Int.pipe(
  S.check(S.isBetween({ minimum: 0, maximum: ECMASCRIPT_DATE_MAX_MILLIS })),
  S.brand('Instant'),
)
export type Instant = S.Schema.Type<typeof Instant>

export const HoldTtl = S.Int.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER - ECMASCRIPT_DATE_MAX_MILLIS })),
  S.brand('HoldTtl'),
)
export type HoldTtl = S.Schema.Type<typeof HoldTtl>

export const Deadline = S.Natural.pipe(S.brand('Deadline'))
export type Deadline = S.Schema.Type<typeof Deadline>

export const WaitlistPosition = S.Int.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
  S.brand('WaitlistPosition'),
)
export type WaitlistPosition = S.Schema.Type<typeof WaitlistPosition>

export const WaitlistTail = S.Int.pipe(
  S.check(S.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER - POSTGRES_INTEGER_MAX })),
  S.brand('WaitlistTail'),
)
export type WaitlistTail = S.Schema.Type<typeof WaitlistTail>

const URL_SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

export const PersonId = S.String.pipe(S.check(S.isPattern(URL_SAFE_ID)), S.brand('PersonId'))
export type PersonId = S.Schema.Type<typeof PersonId>

export const SessionId = S.String.pipe(S.check(S.isPattern(URL_SAFE_ID)), S.brand('SessionId'))
export type SessionId = S.Schema.Type<typeof SessionId>

export const RegistrationId = S.Int.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: POSTGRES_INTEGER_MAX })),
  S.brand('RegistrationId'),
)
export type RegistrationId = S.Schema.Type<typeof RegistrationId>

export const AuditSeq = S.Int.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: POSTGRES_INTEGER_MAX })),
  S.brand('AuditSeq'),
)
export type AuditSeq = S.Schema.Type<typeof AuditSeq>

export class WorkshopPolicy extends S.Class<WorkshopPolicy>('WorkshopPolicy')({ cap: SeatCap, holdTtl: HoldTtl }) {}

export class Held extends S.TaggedClass<Held>()('Held', { expiresAt: Deadline }) {}

export class Confirmed extends S.TaggedClass<Confirmed>()('Confirmed', {}) {}

export class Waitlisted extends S.TaggedClass<Waitlisted>()('Waitlisted', { position: WaitlistPosition }) {}

export class Cancelled extends S.TaggedClass<Cancelled>()('Cancelled', {}) {}

export class Expired extends S.TaggedClass<Expired>()('Expired', {}) {}

export const Registration = S.Union([Held, Confirmed, Waitlisted, Cancelled, Expired])
export type Registration = S.Schema.Type<typeof Registration>
