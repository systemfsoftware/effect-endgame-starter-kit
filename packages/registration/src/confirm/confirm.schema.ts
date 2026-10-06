import * as S from 'effect/Schema'

import { PersonId, Registration } from '../workshop.schema.ts'

export class RegistrationFound extends S.TaggedClass<RegistrationFound>()('RegistrationFound', {
  holder: PersonId,
  state: Registration,
}) {}

export class RegistrationMissing extends S.TaggedClass<RegistrationMissing>()('RegistrationMissing', {}) {}

export const RegistrationLookup = S.Union([RegistrationFound, RegistrationMissing])
export type RegistrationLookup = S.Schema.Type<typeof RegistrationLookup>
