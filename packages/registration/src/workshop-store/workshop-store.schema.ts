import * as S from 'effect/Schema'

import { AuditSeq, Instant, PersonId, Registration, RegistrationId, SeatCount, SessionId } from '../workshop.schema.ts'

export class SessionRow extends S.Class<SessionRow>('SessionRow')({
  sessionId: SessionId,
  capacity: SeatCount,
}) {}

export class RegistrationRow extends S.Class<RegistrationRow>('RegistrationRow')({
  registrationId: RegistrationId,
  sessionId: SessionId,
  person: PersonId,
  registration: Registration,
  decidedAt: Instant,
}) {}

export const AuditedDecision = S.Literals(['registration.register', 'registration.confirm'])
export type AuditedDecision = S.Schema.Type<typeof AuditedDecision>

export class AuditRow extends S.Class<AuditRow>('AuditRow')({
  seq: AuditSeq,
  decision: AuditedDecision,
  command: S.String,
  outcome: S.String,
  decidedAt: Instant,
}) {}

export class Ledger extends S.Class<Ledger>('Ledger')({
  registrations: S.Array(RegistrationRow),
  audit: S.Array(AuditRow),
}) {}
