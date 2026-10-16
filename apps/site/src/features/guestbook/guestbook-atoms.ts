import { Atom } from '@systemfsoftware/effect-atom'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

import { siteRuntime } from '../../api/health-atoms'
import { siteClient } from '../../api/site-rpc-client'
import type { GuestbookEntries, GuestbookEntry, ModerationRequest } from './guestbook.schema'
import { SignGuestbook } from './sign-guestbook.workflow'

const UNAVAILABLE = 'The guestbook is unavailable right now.'

export interface SignDraft {
  readonly name: string
  readonly message: string
}

const listEntries = Effect.flatMap(siteClient, (client) => client.list())

export const guestbookEntries = Atom.withServerValueInitial(siteRuntime.atom(listEntries))

export const guestbookNotice = Atom.make('')

export const signDraft = Atom.make<SignDraft>({ name: '', message: '' })

const signOnServer = (command: SignGuestbook) =>
  Effect.flatMap(siteClient, (client) => client.sign(command)).pipe(
    Effect.as(''),
    Effect.catchTags({
      NameMissing: (refusal) => Effect.succeed(refusal.message),
      NameTooLong: (refusal) => Effect.succeed(refusal.message),
      MessageMissing: (refusal) => Effect.succeed(refusal.message),
      MessageTooLong: (refusal) => Effect.succeed(refusal.message),
    }),
    Effect.catchCause(() => Effect.succeed(UNAVAILABLE)),
  )

const moderateOnServer = (request: ModerationRequest) =>
  Effect.flatMap(siteClient, (client) => client.moderate(request)).pipe(
    Effect.as(''),
    Effect.catchTags({
      IllegalTransition: (refusal) => Effect.succeed(refusal.message),
      StoredStateInvalid: (refusal) => Effect.succeed(refusal.message),
      TransitionConflict: (refusal) => Effect.succeed(refusal.message),
      EntryNotFound: (refusal) => Effect.succeed(refusal.message),
    }),
    Effect.catchCause(() => Effect.succeed(UNAVAILABLE)),
  )

const refreshEntries = (get: Atom.FnContext) =>
  Effect.gen(function*() {
    get.refresh(guestbookEntries)
    return yield* get.result(guestbookEntries, { suspendOnWaiting: true }).pipe(
      Effect.as(''),
      Effect.catchCause(() => Effect.succeed(UNAVAILABLE)),
    )
  })

export const signGuestbookEntry = siteRuntime.fn<SignDraft>()((draft, get) =>
  Effect.gen(function*() {
    const notice = yield* signOnServer(new SignGuestbook(draft))
    if (notice === '') {
      get.set(guestbookNotice, yield* refreshEntries(get))
      get.set(signDraft, { name: draft.name, message: '' })
      return
    }
    get.set(guestbookNotice, notice)
  })
)

export const moderateGuestbookEntry = siteRuntime.fn<ModerationRequest>()((request, get) =>
  Effect.gen(function*() {
    const notice = yield* moderateOnServer(request)
    const listNotice = yield* refreshEntries(get)
    get.set(guestbookNotice, notice === '' ? listNotice : notice)
  })
)

export const listedEntriesOf = (result: Atom.Type<typeof guestbookEntries>): GuestbookEntries =>
  Atom.AsyncResult.match(result, {
    onInitial: () => [],
    onFailure: () => [],
    onSuccess: ({ value }) => (Context.isContext(value) ? [] : value),
  })

export const statusLabelOf = (entry: GuestbookEntry): string | null => entry.state === 'Flagged' ? 'Flagged' : null

export const guestbookReadyOf = (result: Atom.Type<typeof guestbookEntries>): boolean =>
  !Atom.AsyncResult.isInitial(result)

export const moderationInFlightOf = (result: Atom.Type<typeof moderateGuestbookEntry>): boolean =>
  Atom.AsyncResult.isWaiting(result)

const initialResult = Atom.AsyncResult.initial(true)
const serverEntries = listedEntriesOf(initialResult)
const serverReady = guestbookReadyOf(initialResult)
const serverBusy = moderationInFlightOf(initialResult)

export const listedEntries = Atom.withServerValue(
  Atom.map(guestbookEntries, listedEntriesOf),
  () => serverEntries,
)

export const guestbookReady = Atom.withServerValue(
  Atom.map(guestbookEntries, guestbookReadyOf),
  () => serverReady,
)

export const moderationInFlight = Atom.withServerValue(
  Atom.map(moderateGuestbookEntry, moderationInFlightOf),
  () => serverBusy,
)
