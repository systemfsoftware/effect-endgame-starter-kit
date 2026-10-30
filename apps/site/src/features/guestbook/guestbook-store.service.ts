import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type * as S from 'effect/Schema'

import type {
  EntryId,
  EntryNotFound,
  EntryState,
  GuestbookEntries,
  GuestbookEntry,
  GuestbookRowInvalid,
  GuestbookUnavailable,
  TransitionConflict,
} from './guestbook.schema'
import type { EntryAccepted } from './sign-guestbook.workflow'

type StoreFailure = GuestbookUnavailable | GuestbookRowInvalid

export class GuestbookStore extends Context.Service<GuestbookStore, {
  readonly sign: (entry: S.Codec.Encoded<typeof EntryAccepted>) => Effect.Effect<GuestbookEntry, StoreFailure>
  readonly latest: Effect.Effect<GuestbookEntries, StoreFailure>
  readonly stateOf: (id: EntryId) => Effect.Effect<string, EntryNotFound | StoreFailure>
  readonly move: (
    id: EntryId,
    from: EntryState,
    to: EntryState,
  ) => Effect.Effect<EntryState, TransitionConflict | GuestbookUnavailable>
}>()('site/GuestbookStore') {}
