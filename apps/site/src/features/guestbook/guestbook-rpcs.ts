import { Rpc, RpcGroup } from 'effect/rpc'
import * as S from 'effect/Schema'

import {
  EntryNotFound,
  EntryState,
  GuestbookEntries,
  GuestbookEntry,
  ModerationRequest,
  StoredStateInvalid,
  TransitionConflict,
} from './guestbook.schema'
import { IllegalTransition } from './moderate-guestbook-entry.workflow'
import { SignGuestbook, SignGuestbookRefusal } from './sign-guestbook.workflow'

export const GuestbookRpcs = RpcGroup.make(
  Rpc.make('sign', { payload: SignGuestbook, success: GuestbookEntry, error: SignGuestbookRefusal }),
  Rpc.make('list', { success: GuestbookEntries }),
  Rpc.make('moderate', {
    payload: ModerationRequest,
    success: EntryState,
    error: S.Union([IllegalTransition, StoredStateInvalid, TransitionConflict, EntryNotFound]),
  }),
)
