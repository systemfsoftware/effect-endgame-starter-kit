import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as S from 'effect/Schema'

import { GuestbookStore } from './guestbook-store.service'
import {
  EntryNotFound,
  GuestbookEntries,
  GuestbookEntry,
  GuestbookRowInvalid,
  StoredStateRow,
  TransitionConflict,
} from './guestbook.schema'
import type { EntryAccepted } from './sign-guestbook.workflow'

const LATEST_ENTRIES = 20

export interface MemorySeedRow {
  readonly id: number
  readonly guest: string
  readonly message: string
  readonly state: string
}

interface StoredRow {
  readonly id: number
  readonly guest: string
  readonly message: string
  readonly state: string
}

const rowInvalid = (error: S.SchemaError): GuestbookRowInvalid => new GuestbookRowInvalid({ detail: error.message })

const visibleInLatest = (row: StoredRow): boolean => row.state === 'Visible' || row.state === 'Flagged'

const nextId = (rows: ReadonlyArray<StoredRow>): number => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1

export const layer = (seed: ReadonlyArray<MemorySeedRow> = []): Layer.Layer<GuestbookStore> =>
  Layer.effect(
    GuestbookStore,
    Effect.gen(function*() {
      const rows = yield* Ref.make<ReadonlyArray<StoredRow>>(seed)
      return {
        sign: (entry: S.Codec.Encoded<typeof EntryAccepted>) =>
          Ref.modify(rows, (all): readonly [StoredRow, ReadonlyArray<StoredRow>] => {
            const row: StoredRow = { id: nextId(all), guest: entry.guest, message: entry.message, state: 'Visible' }
            return [row, [...all, row]]
          }).pipe(
            Effect.flatMap((row) => S.decodeUnknownEffect(GuestbookEntry)(row).pipe(Effect.mapError(rowInvalid))),
          ),
        latest: Ref.get(rows).pipe(
          Effect.flatMap((all) =>
            S.decodeUnknownEffect(GuestbookEntries)(
              all.filter(visibleInLatest).sort((a, b) => b.id - a.id).slice(0, LATEST_ENTRIES),
            ).pipe(Effect.mapError(rowInvalid))
          ),
        ),
        stateOf: (id) =>
          Ref.get(rows).pipe(
            Effect.map((all) => all.find((row) => row.id === id)),
            Effect.flatMap((row) => Effect.mapError(Effect.fromNullishOr(row), () => new EntryNotFound({ id }))),
            Effect.flatMap((row) => S.decodeEffect(StoredStateRow)(row).pipe(Effect.mapError(rowInvalid))),
            Effect.map(({ state }) => state),
          ),
        move: (id, from, to) =>
          Ref.modify(
            rows,
            (all): readonly [Effect.Effect<typeof to, TransitionConflict>, ReadonlyArray<StoredRow>] => {
              const holdsFrom = all.some((stored) => (stored.id === id ? stored.state === from : false))
              return holdsFrom
                ? [Effect.succeed(to), all.map((stored) => (stored.id === id ? { ...stored, state: to } : stored))]
                : [Effect.fail(new TransitionConflict({ id, from })), all]
            },
          ).pipe(Effect.flatten),
      }
    }),
  )
