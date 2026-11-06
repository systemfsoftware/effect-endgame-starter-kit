import type { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

import type {
  EntryNotFound,
  EntryState,
  GuestbookEntries,
  GuestbookEntry,
  GuestbookRowInvalid,
  GuestbookUnavailable,
  ModerationRequest,
  StoredStateInvalid,
  TransitionConflict,
} from './guestbook.schema'
import type { IllegalTransition } from './moderate-guestbook-entry.workflow'
import type { SignGuestbook, SignGuestbookRefusal } from './sign-guestbook.workflow'

type StoreFailure = GuestbookUnavailable | GuestbookRowInvalid

export interface GuestbookCells {
  readonly sign: Cell.Cell<SignGuestbook, GuestbookEntry, SignGuestbookRefusal | StoreFailure, never>
  readonly list: Cell.Cell<void, GuestbookEntries, StoreFailure, never>
  readonly moderate: Cell.Cell<
    ModerationRequest,
    EntryState,
    EntryNotFound | TransitionConflict | IllegalTransition | StoredStateInvalid | StoreFailure,
    never
  >
}

export const GuestbookHandlers = (cells: GuestbookCells) => ({
  sign: (command: SignGuestbook) =>
    cells.sign.run(command).pipe(
      Effect.catchTags({ GuestbookUnavailable: Effect.die, GuestbookRowInvalid: Effect.die }),
    ),
  list: () => cells.list.run(undefined).pipe(Effect.orDie),
  moderate: (request: ModerationRequest) =>
    cells.moderate.run(request).pipe(
      Effect.catchTags({ GuestbookUnavailable: Effect.die, GuestbookRowInvalid: Effect.die }),
    ),
})
