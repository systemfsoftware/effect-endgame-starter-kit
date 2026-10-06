import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import * as S from 'effect/Schema'

import { ConfirmSeatDecisionTag } from './confirm/confirm-seat.workflow.ts'
import { RegisterSeatsDecisionTag } from './register/register-seats.workflow.ts'
import { RegistrationId, RequestedSeats, SessionId } from './workshop.schema.ts'

export const Register = Span.declare({
  id: 'registration.register',
  name: 'registration.register',
  attrs: S.Struct({
    'app.registration.session_id': SessionId,
    'app.registration.requested_seats': RequestedSeats,
    'app.registration.register.decision': RegisterSeatsDecisionTag,
  }),
})

export const RegisterRead = Span.declare({
  id: 'registration.register.read',
  name: 'registration.register.read',
  attrs: S.Struct({}),
})

export const RegisterWrite = Span.declare({
  id: 'registration.register.write',
  name: 'registration.register.write',
  attrs: S.Struct({}),
})

export const Confirm = Span.declare({
  id: 'registration.confirm',
  name: 'registration.confirm',
  attrs: S.Struct({
    'app.registration.registration_id': RegistrationId,
    'app.registration.confirm.decision': ConfirmSeatDecisionTag,
  }),
})

export const registrationTaxonomy = Taxonomy.make('registration').pipe(
  Taxonomy.add(Register),
  Taxonomy.add(RegisterRead),
  Taxonomy.add(RegisterWrite),
  Taxonomy.add(Confirm),
  Taxonomy.child(Register, RegisterRead),
  Taxonomy.child(Register, RegisterWrite),
)
