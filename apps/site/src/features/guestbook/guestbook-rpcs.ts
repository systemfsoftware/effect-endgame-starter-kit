import { Rpc, RpcGroup } from 'effect/rpc'

import { GuestbookEntries, GuestbookEntry } from './guestbook.schema'
import { SignGuestbook, SignGuestbookRefusal } from './sign-guestbook.workflow'

export const GuestbookRpcs = RpcGroup.make(
  Rpc.make('SignGuestbook', { payload: SignGuestbook, success: GuestbookEntry, error: SignGuestbookRefusal }),
  Rpc.make('LatestGuestbookEntries', { success: GuestbookEntries }),
)
