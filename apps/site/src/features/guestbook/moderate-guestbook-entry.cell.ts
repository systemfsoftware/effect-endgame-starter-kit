import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

import { GuestbookStore } from './guestbook-store.service'
import { type ModerationRequest, StoredStateInvalid } from './guestbook.schema'
import { IllegalTransition, moderateGuestbookEntry } from './moderate-guestbook-entry.workflow'

export const moderateGuestbookEntryCell = Sandwich.named('guestbook.moderate')((request: ModerationRequest) =>
  Effect.flatMap(GuestbookStore, (store) => store.stateOf(request.id)).pipe(
    Effect.map((state) => ({ id: request.id, state, event: request.event })),
  )
)
  .decide(moderateGuestbookEntry)
  .write({
    EntryMoved: ({ from, to }, { id }) => Effect.flatMap(GuestbookStore, (store) => store.move(id, from, to)),
    IllegalTransition: ({ state, event }) => Effect.fail(new IllegalTransition({ state, event })),
    CommandRejected: ({ issue }) => Effect.fail(new StoredStateInvalid({ detail: issue })),
  })
