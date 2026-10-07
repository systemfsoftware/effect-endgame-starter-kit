import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { GuestbookRpcs } from './guestbook-rpcs'
import { GuestbookStore, GuestbookStoreLive } from './guestbook-store'
import { signGuestbook } from './sign-guestbook.workflow'

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
    }
  }),
).pipe(Layer.provide(GuestbookStoreLive))
