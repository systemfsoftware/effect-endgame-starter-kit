import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

import { GuestbookStore } from './guestbook-store.service'
import type { GuestbookEntries, GuestbookRowInvalid, GuestbookUnavailable } from './guestbook.schema'

export const listGuestbookEntriesCell = Cell.fromEffect<
  GuestbookEntries,
  GuestbookUnavailable | GuestbookRowInvalid,
  GuestbookStore,
  void
>(Effect.flatMap(GuestbookStore, (store) => store.latest))
