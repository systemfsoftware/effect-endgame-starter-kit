import { env } from 'cloudflare:workers'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as S from 'effect/Schema'

import {
  type EntryId,
  EntryNotFound,
  type EntryState,
  GuestbookEntries,
  GuestbookEntry,
  GuestbookRowInvalid,
  GuestbookUnavailable,
  StoredStateRow,
  TransitionConflict,
} from './guestbook.schema'
import type { EntryAccepted } from './sign-guestbook.workflow'

const LATEST_ENTRIES = 20

type StoreFailure = GuestbookUnavailable | GuestbookRowInvalid

export class GuestbookStore extends Context.Service<GuestbookStore, {
  readonly sign: (entry: EntryAccepted) => Effect.Effect<GuestbookEntry, StoreFailure>
  readonly latest: Effect.Effect<GuestbookEntries, StoreFailure>
  readonly stateOf: (id: EntryId) => Effect.Effect<string, EntryNotFound | StoreFailure>
  readonly move: (
    id: EntryId,
    from: EntryState,
    to: EntryState,
  ) => Effect.Effect<EntryState, TransitionConflict | GuestbookUnavailable>
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
      env.DB.prepare(
        'INSERT INTO guestbook_entries (guest, message) VALUES (?1, ?2) RETURNING id, guest, message, state',
      )
        .bind(entry.guest, entry.message)
        .first()
    ).pipe(Effect.flatMap((row) => S.decodeUnknownEffect(GuestbookEntry)(row).pipe(Effect.mapError(rowInvalid)))),
  latest: query(() =>
    env.DB.prepare(
      "SELECT id, guest, message, state FROM guestbook_entries WHERE state IN ('Visible', 'Flagged') ORDER BY id DESC LIMIT ?1",
    )
      .bind(LATEST_ENTRIES)
      .all()
  ).pipe(
    Effect.flatMap(({ results }) => S.decodeUnknownEffect(GuestbookEntries)(results).pipe(Effect.mapError(rowInvalid))),
  ),
  stateOf: (id) =>
    query(() => env.DB.prepare('SELECT state FROM guestbook_entries WHERE id = ?1').bind(id).first()).pipe(
      Effect.flatMap((row) => Effect.mapError(Effect.fromNullishOr(row), () => new EntryNotFound({ id }))),
      Effect.flatMap((row) => S.decodeUnknownEffect(StoredStateRow)(row).pipe(Effect.mapError(rowInvalid))),
      Effect.map(({ state }) => state),
    ),
  move: (id, from, to) =>
    query(() =>
      env.DB.prepare('UPDATE guestbook_entries SET state = ?1 WHERE id = ?2 AND state = ?3').bind(to, id, from).run()
    ).pipe(
      Effect.filterOrFail(({ meta }) => meta.changes === 1, () => new TransitionConflict({ id, from })),
      Effect.as(to),
    ),
})
