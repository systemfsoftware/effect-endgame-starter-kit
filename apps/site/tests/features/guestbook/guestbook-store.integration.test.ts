import { Gherkin, it, makeFeature, pairwiseFor, Then } from '@systemfsoftware/effect-gherkin-spec'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import * as Memory from '#guestbook/guestbook-store.memory.ts'
import { GuestbookStore } from '#guestbook/guestbook-store.service.ts'
import { EntryId, EntryNotFound, GuestbookEntry, TransitionConflict } from '#guestbook/guestbook.schema.ts'
import type { EntryAccepted } from '#guestbook/sign-guestbook.workflow.ts'
import * as D1Oracle from './__fixtures__/d1-oracle.ts'

const Feature = makeFeature({ it })

const ADA = { guest: 'Ada Lovelace', message: 'The analytical engine would love this guestbook' } as const
const GRACE = { guest: 'Grace Hopper', message: 'Compiled with care' } as const
const ALAN = { guest: 'Alan Turing', message: 'Can machines sign guestbooks?' } as const

const signOf = (guest: string, message: string): S.Codec.Encoded<typeof EntryAccepted> => ({
  _tag: 'EntryAccepted',
  guest,
  message,
})

const ADA_SIGNS = signOf(ADA.guest, ADA.message)
const GRACE_SIGNS = signOf(GRACE.guest, GRACE.message)
const ALAN_SIGNS = signOf(ALAN.guest, ALAN.message)

const ENTRY_ONE: EntryId = Result.getOrThrow(S.decodeResult(EntryId)(1))

const EXPECTED_ADA: GuestbookEntry = Result.getOrThrow(
  S.decodeResult(GuestbookEntry)({ id: 1, guest: ADA.guest, message: ADA.message, state: 'Visible' }),
)
const EXPECTED_GRACE: GuestbookEntry = Result.getOrThrow(
  S.decodeResult(GuestbookEntry)({ id: 2, guest: GRACE.guest, message: GRACE.message, state: 'Visible' }),
)
const EXPECTED_ALAN: GuestbookEntry = Result.getOrThrow(
  S.decodeResult(GuestbookEntry)({ id: 3, guest: ALAN.guest, message: ALAN.message, state: 'Visible' }),
)

const EXPECTED_STALE_MOVE = new TransitionConflict({ id: ENTRY_ONE, from: 'Visible' })
const EXPECTED_NOT_FOUND = new EntryNotFound({ id: ENTRY_ONE })

const EXPECTED_LATEST_IDS = [21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]

const signedView = (entry: GuestbookEntry) => ({ guest: entry.guest, message: entry.message, state: entry.state })

const guestbookView = (entries: ReadonlyArray<GuestbookEntry>) =>
  entries.map(signedView).sort((a, b) => (a.guest < b.guest ? -1 : 1))

const EXPECTED_ADA_VIEW = signedView(EXPECTED_ADA)
const EXPECTED_GRACE_VIEW = signedView(EXPECTED_GRACE)

const BANISHED_SEED: ReadonlyArray<Memory.MemorySeedRow> = [
  { id: 1, guest: 'Mallory', message: 'Not welcome anywhere', state: 'Banished' },
]

const OnBothStores = pairwiseFor(
  { a: { name: 'memory', layer: Memory.layer() }, b: { name: 'd1', layer: D1Oracle.layer() } },
  GuestbookStore,
)

const OnSeededStores = pairwiseFor(
  {
    a: { name: 'memory', layer: Memory.layer(BANISHED_SEED) },
    b: { name: 'd1', layer: D1Oracle.layer(BANISHED_SEED) },
  },
  GuestbookStore,
)

Feature('The guestbook store obeys the same laws over the memory fake and over real D1')
  .withLayer(D1Oracle.migrationsLayer)
  .live('the D1 oracle reads migration files from disk and runs a real Miniflare workerd process')
  .body(({ scenario }) => {
    scenario(
      'a signed entry reads back exactly as it was written',
      Gherkin.Do.pipe(
        OnBothStores('a guest signs, and the entry is read back')(
          'readBack',
          () => (store) =>
            Effect.gen(function*() {
              const entry = yield* store.sign(ADA_SIGNS)
              const state = yield* store.stateOf(ENTRY_ONE)
              return { entry, state }
            }),
        ),
        Then('the returned entry is the first entry in Visible, and its stored state agrees')(
          ({ readBack }, expect) =>
            expect({ memory: readBack.a, d1: readBack.b }).toEqual({
              memory: { entry: EXPECTED_ADA, state: 'Visible' },
              d1: { entry: EXPECTED_ADA, state: 'Visible' },
            }),
        ),
      ),
    )

    scenario(
      'the latest page lists newest entries first and never hidden ones',
      Gherkin.Do.pipe(
        OnBothStores('three guests sign and the first entry is hidden')(
          'page',
          () => (store) =>
            Effect.gen(function*() {
              yield* store.sign(ADA_SIGNS)
              yield* store.sign(GRACE_SIGNS)
              yield* store.sign(ALAN_SIGNS)
              yield* store.move(ENTRY_ONE, 'Visible', 'Hidden')
              return yield* store.latest
            }),
        ),
        Then('the page holds the third and second entries, newest first')(({ page }, expect) =>
          expect({ memory: page.a, d1: page.b }).toEqual({
            memory: [EXPECTED_ALAN, EXPECTED_GRACE],
            d1: [EXPECTED_ALAN, EXPECTED_GRACE],
          })
        ),
      ),
    )

    scenario(
      'reading the latest page again returns the same entries',
      Gherkin.Do.pipe(
        OnBothStores('a guest signs and the page is read twice')(
          'pages',
          () => (store) =>
            Effect.gen(function*() {
              yield* store.sign(ADA_SIGNS)
              const first = yield* store.latest
              const second = yield* store.latest
              return { first, second }
            }),
        ),
        Then('both reads return the signed entry')(({ pages }, expect) =>
          expect({ memory: pages.a, d1: pages.b }).toEqual({
            memory: { first: [EXPECTED_ADA], second: [EXPECTED_ADA] },
            d1: { first: [EXPECTED_ADA], second: [EXPECTED_ADA] },
          })
        ),
      ),
    )

    scenario(
      'entries signed in either order leave the same guestbook',
      Gherkin.Do.pipe(
        OnBothStores('Ada signs before Grace')(
          'adaFirst',
          () => (store) =>
            Effect.gen(function*() {
              yield* store.sign(ADA_SIGNS)
              yield* store.sign(GRACE_SIGNS)
              return yield* store.latest
            }).pipe(Effect.map(guestbookView)),
        ),
        OnBothStores('Grace signs before Ada')(
          'graceFirst',
          () => (store) =>
            Effect.gen(function*() {
              yield* store.sign(GRACE_SIGNS)
              yield* store.sign(ADA_SIGNS)
              return yield* store.latest
            }).pipe(Effect.map(guestbookView)),
        ),
        Then('either order leaves the same two visible entries')(({ adaFirst, graceFirst }, expect) =>
          expect({
            adaFirst: { a: adaFirst.a, b: adaFirst.b },
            graceFirst: { a: graceFirst.a, b: graceFirst.b },
          }).toEqual({
            adaFirst: { a: [EXPECTED_ADA_VIEW, EXPECTED_GRACE_VIEW], b: [EXPECTED_ADA_VIEW, EXPECTED_GRACE_VIEW] },
            graceFirst: { a: [EXPECTED_ADA_VIEW, EXPECTED_GRACE_VIEW], b: [EXPECTED_ADA_VIEW, EXPECTED_GRACE_VIEW] },
          })
        ),
      ),
    )

    scenario(
      'the latest page holds at most twenty entries',
      Gherkin.Do.pipe(
        OnBothStores('twenty-one guests sign and the page is read')(
          'ids',
          () => (store) =>
            Effect.gen(function*() {
              yield* Effect.forEach(Arr.range(1, 21), (n) => store.sign(signOf(`Signer ${n}`, `Entry ${n}`)))
              const page = yield* store.latest
              return page.map((entry) => entry.id)
            }),
        ),
        Then('the page holds entries twenty-one through two, newest first')(({ ids }, expect) =>
          expect({ memory: ids.a, d1: ids.b }).toEqual({
            memory: EXPECTED_LATEST_IDS,
            d1: EXPECTED_LATEST_IDS,
          })
        ),
      ),
    )

    scenario(
      'a move from a stale state is refused and changes nothing',
      Gherkin.Do.pipe(
        OnBothStores('an entry is flagged, then a stale move is attempted')(
          'outcome',
          () => (store) =>
            Effect.gen(function*() {
              yield* store.sign(ADA_SIGNS)
              const moved = yield* store.move(ENTRY_ONE, 'Visible', 'Flagged')
              const refused = yield* Effect.flip(store.move(ENTRY_ONE, 'Visible', 'Hidden'))
              const state = yield* store.stateOf(ENTRY_ONE)
              return { moved, refused, state }
            }),
        ),
        Then('the stale move is refused as a transition conflict and the entry stays flagged')(
          ({ outcome }, expect) =>
            expect({ memory: outcome.a, d1: outcome.b }).toEqual({
              memory: { moved: 'Flagged', refused: EXPECTED_STALE_MOVE, state: 'Flagged' },
              d1: { moved: 'Flagged', refused: EXPECTED_STALE_MOVE, state: 'Flagged' },
            }),
        ),
      ),
    )

    scenario(
      'reading a missing entry reports it is not found',
      Gherkin.Do.pipe(
        OnBothStores('the state of entry one is read on an empty guestbook')(
          'missing',
          () => (store) => Effect.flip(store.stateOf(ENTRY_ONE)),
        ),
        Then('the read is an entry-not-found refusal')(({ missing }, expect) =>
          expect({ memory: missing.a, d1: missing.b }).toEqual({
            memory: EXPECTED_NOT_FOUND,
            d1: EXPECTED_NOT_FOUND,
          })
        ),
      ),
    )

    scenario(
      'a stored state outside the lifecycle reads back verbatim',
      Gherkin.Do.pipe(
        OnSeededStores('a seeded entry holds a state the lifecycle does not know')(
          'stored',
          () => (store) =>
            Effect.gen(function*() {
              const state = yield* store.stateOf(ENTRY_ONE)
              const page = yield* store.latest
              return { state, page }
            }),
        ),
        Then('the raw state comes back verbatim and the entry stays off the latest page')(
          ({ stored }, expect) =>
            expect({ memory: stored.a, d1: stored.b }).toEqual({
              memory: { state: 'Banished', page: [] },
              d1: { state: 'Banished', page: [] },
            }),
        ),
      ),
    )
  })
