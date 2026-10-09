import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { GuestbookRpcs } from './guestbook-rpcs'
import { GuestbookStore, GuestbookStoreLive } from './guestbook-store'
import { type ModerationRequest, StoredStateInvalid } from './guestbook.schema'
import { IllegalTransition, moderateGuestbookEntry } from './moderate-guestbook-entry.workflow'
import { signGuestbook } from './sign-guestbook.workflow'

const moderateEntry = Sandwich.named('guestbook.moderate')((request: ModerationRequest) =>
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

export const GuestbookHandlers = GuestbookRpcs.toLayer(
  Effect.gen(function*() {
    const store = yield* GuestbookStore
    return {
      sign: (command) =>
        signGuestbook(command).pipe(
          Effect.fromResult,
          Effect.flatMap((entry) => Effect.orDie(store.sign(entry))),
        ),
      list: () => Effect.orDie(store.latest),
      moderate: (request) =>
        moderateEntry.run(request).pipe(
          Effect.catchTags({ GuestbookUnavailable: Effect.die, GuestbookRowInvalid: Effect.die }),
          Effect.provideService(GuestbookStore, store),
        ),
    }
  }),
).pipe(Layer.provide(GuestbookStoreLive))
