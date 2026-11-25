import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'

import { PersonId, TodoCredential } from './todo.schema'

const hexOf = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

export const personOf = (credential: TodoCredential): Effect.Effect<PersonId> =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential))).pipe(
    Effect.map((digest) => hexOf(new Uint8Array(digest))),
    Effect.flatMap((hex) => Effect.orDie(S.decodeEffect(PersonId)(hex))),
  )
