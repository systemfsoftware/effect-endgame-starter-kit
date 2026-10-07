import { env } from 'cloudflare:workers'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as S from 'effect/Schema'

import { GuestbookEntries, GuestbookEntry, GuestbookRowInvalid, GuestbookUnavailable } from './guestbook.schema'
import type { EntryAccepted } from './sign-guestbook.workflow'

const LATEST_ENTRIES = 20

type StoreFailure = GuestbookUnavailable | GuestbookRowInvalid

export class GuestbookStore extends Context.Service<GuestbookStore, {
  readonly sign: (entry: EntryAccepted) => Effect.Effect<GuestbookEntry, StoreFailure>
  readonly latest: Effect.Effect<GuestbookEntries, StoreFailure>
}>()('site/GuestbookStore') {}

const query = <A>(run: () => Promise<A>): Effect.Effect<A, GuestbookUnavailable> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new GuestbookUnavailable({ detail: cause instanceof Error ? cause.message : 'the query was rejected' }),
  })

const rowInvalid = (error: S.SchemaError): GuestbookRowInvalid => new GuestbookRowInvalid({ detail: error.message })

export const GuestbookStoreLive = Layer.succeed(GuestbookStore, {
  sign: (entry) =>
    query(() =>
      env.DB.prepare('INSERT INTO guestbook_entries (guest, message) VALUES (?1, ?2) RETURNING id, guest, message')
        .bind(entry.guest, entry.message)
        .first()
    ).pipe(Effect.flatMap((row) => S.decodeUnknownEffect(GuestbookEntry)(row).pipe(Effect.mapError(rowInvalid)))),
  latest: query(() =>
    env.DB.prepare('SELECT id, guest, message FROM guestbook_entries ORDER BY id DESC LIMIT ?1')
      .bind(LATEST_ENTRIES)
      .all()
  ).pipe(
    Effect.flatMap(({ results }) => S.decodeUnknownEffect(GuestbookEntries)(results).pipe(Effect.mapError(rowInvalid))),
  ),
})
