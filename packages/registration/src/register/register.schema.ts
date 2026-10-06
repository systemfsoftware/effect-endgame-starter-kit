import * as S from 'effect/Schema'

import { SeatCount, WaitlistTail } from '../workshop.schema.ts'

export class SessionFound extends S.TaggedClass<SessionFound>()('SessionFound', {
  capacity: SeatCount,
  taken: SeatCount,
  waitlistTail: WaitlistTail,
}) {}

export class SessionMissing extends S.TaggedClass<SessionMissing>()('SessionMissing', {}) {}

export const SessionLookup = S.Union([SessionFound, SessionMissing])
export type SessionLookup = S.Schema.Type<typeof SessionLookup>
