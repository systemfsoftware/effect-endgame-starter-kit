import { readdir, readFile } from 'node:fs/promises'

import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

import { layer as d1Layer } from '#guestbook/d1-guestbook-store.ts'
import type { MemorySeedRow } from '#guestbook/guestbook-store.memory.ts'
import { GuestbookStore } from '#guestbook/guestbook-store.service.ts'

const migrationsUrl = new URL('../../../../src/features/guestbook/migrations/', import.meta.url)

const singleLineStatements = (sql: string): ReadonlyArray<string> =>
  sql.split(';').map((statement) => statement.replace(/\s+/g, ' ').trim()).filter((statement) => statement.length > 0)

export class GuestbookMigrations extends Context.Service<GuestbookMigrations, ReadonlyArray<string>>()(
  'test/GuestbookMigrations',
) {}

export const migrationsLayer: Layer.Layer<GuestbookMigrations> = Layer.effect(
  GuestbookMigrations,
  Effect.gen(function*() {
    const names = yield* Effect.tryPromise(() => readdir(migrationsUrl)).pipe(Effect.orDie)
    const ordered = names.filter((name) => name.endsWith('.sql')).sort()
    const byFile = yield* Effect.forEach(
      ordered,
      (name) =>
        Effect.tryPromise(() => readFile(new URL(name, migrationsUrl), 'utf8')).pipe(
          Effect.orDie,
          Effect.map(singleLineStatements),
        ),
    )
    return byFile.flat()
  }),
)

export const layer = (
  seed: ReadonlyArray<MemorySeedRow> = [],
): Layer.Layer<GuestbookStore, never, GuestbookMigrations> =>
  Layer.effect(
    GuestbookStore,
    Effect.gen(function*() {
      const miniflare = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new Miniflare(
              convertV4MiniflareOptions({
                script: 'export default { fetch: () => new Response(null, { status: 404 }) }',
                modules: true,
                compatibilityDate: '2026-10-01',
                d1Databases: ['GUESTBOOK'],
              }),
            ),
        ),
        (instance) => Effect.promise(() => instance.dispose()),
      )
      const database = yield* Effect.tryPromise(() => miniflare.getD1Database('GUESTBOOK')).pipe(Effect.orDie)
      const migrations = yield* GuestbookMigrations
      for (const statement of migrations) {
        yield* Effect.tryPromise(() => database.exec(statement)).pipe(Effect.orDie)
      }
      for (const row of seed) {
        yield* Effect.tryPromise(() =>
          database
            .prepare('INSERT INTO guestbook_entries (id, guest, message, state) VALUES (?1, ?2, ?3, ?4)')
            .bind(row.id, row.guest, row.message, row.state)
            .run()
        ).pipe(Effect.orDie)
      }
      const built = yield* Layer.build(d1Layer(database))
      return Context.get(built, GuestbookStore)
    }),
  )
