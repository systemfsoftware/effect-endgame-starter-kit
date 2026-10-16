import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

import { GuestbookStore } from './guestbook-store.service'
import {
  MessageMissing,
  MessageTooLong,
  NameMissing,
  NameTooLong,
  type SignGuestbook,
  signGuestbook,
} from './sign-guestbook.workflow'

export const signGuestbookCell = Sandwich.named('guestbook.sign')((command: SignGuestbook) =>
  Effect.succeed({ name: command.name, message: command.message })
)
  .decide(signGuestbook)
  .write({
    EntryAccepted: (entry) => Effect.flatMap(GuestbookStore, (store) => store.sign(entry)),
    NameMissing: () => Effect.fail(new NameMissing({})),
    NameTooLong: () => Effect.fail(new NameTooLong({})),
    MessageMissing: () => Effect.fail(new MessageMissing({})),
    MessageTooLong: () => Effect.fail(new MessageTooLong({})),
    CommandRejected: ({ issue }) => Effect.die(new Error(issue)),
  })
