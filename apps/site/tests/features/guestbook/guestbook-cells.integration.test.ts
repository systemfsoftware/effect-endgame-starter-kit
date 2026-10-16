import { Cell } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import * as Memory from '#guestbook/guestbook-store.memory.ts'
import { GuestbookStore } from '#guestbook/guestbook-store.service.ts'
import { EntryId, EntryNotFound, StoredStateInvalid } from '#guestbook/guestbook.schema.ts'
import { moderateGuestbookEntryCell } from '#guestbook/moderate-guestbook-entry.cell.ts'
import { IllegalTransition } from '#guestbook/moderate-guestbook-entry.workflow.ts'
import { signGuestbookCell } from '#guestbook/sign-guestbook.cell.ts'
import { NameMissing, SignGuestbook } from '#guestbook/sign-guestbook.workflow.ts'

const Feature = makeFeature({ it })

const ADA = { name: 'Ada Lovelace', message: 'The analytical engine would love this guestbook' }

const ENTRY_ONE: EntryId = Result.getOrThrow(S.decodeResult(EntryId)(1))

const EXPECTED_ILLEGAL_VOUCH = new IllegalTransition({ state: 'Visible', event: 'Vouch' })
const EXPECTED_NOT_FOUND = new EntryNotFound({ id: ENTRY_ONE })
const EXPECTED_NAME_MISSING = new NameMissing({})

const BANISHED_SEED: ReadonlyArray<Memory.MemorySeedRow> = [
  { id: 1, guest: 'Mallory', message: 'Not welcome anywhere', state: 'Banished' },
]

const composeGuestbook = () =>
  Effect.map(Effect.context<GuestbookStore>(), (context) => ({
    sign: Cell.provideContext(signGuestbookCell, context),
    moderate: Cell.provideContext(moderateGuestbookEntryCell, context),
    store: Context.get(context, GuestbookStore),
  }))

Feature('The guestbook cells, composed as the server composes them, keep the contracts only a store read can show')
  .withScenarioLayer(Memory.layer())
  .body(({ scenario }) => {
    scenario(
      'An entry stored in a state the lifecycle does not know is refused as StoredStateInvalid and left byte-identical',
      { scenarioLayer: Memory.layer(BANISHED_SEED) },
      Gherkin.Do.pipe(
        Given('a guestbook seeded with one entry whose stored state is Banished, composed as the server composes it')(
          'guestbook',
          composeGuestbook,
        ),
        When('a visitor flags that entry')(
          'outcome',
          ({ guestbook }) =>
            Effect.gen(function*() {
              const refused = yield* Effect.flip(guestbook.moderate.run({ id: ENTRY_ONE, event: 'Flag' }))
              const storedState = yield* guestbook.store.stateOf(ENTRY_ONE)
              const page = yield* guestbook.store.latest
              return { refused, storedState, page }
            }),
        ),
        Then(
          'the refusal is StoredStateInvalid naming the states the lifecycle knows, and the row and page are untouched',
        )(
          ({ outcome }, expect) => {
            const { refused } = outcome
            return expect({
              tag: refused._tag,
              detailNamesKnownStates: S.is(StoredStateInvalid)(refused) &&
                ['Visible', 'Flagged', 'Hidden'].every((state) => refused.detail.includes(state)),
              storedState: outcome.storedState,
              page: outcome.page,
            }).toEqual({
              tag: 'StoredStateInvalid',
              detailNamesKnownStates: true,
              storedState: 'Banished',
              page: [],
            })
          },
        ),
      ),
    )

    scenario(
      'A vouch on an entry that is Visible is refused as IllegalTransition naming the state and the event, and the stored row is byte-identical',
      Gherkin.Do.pipe(
        Given('a composed guestbook over an empty store')('guestbook', composeGuestbook),
        Given('Ada has signed through the composed sign cell')(
          'signed',
          ({ guestbook }) => guestbook.sign.run(new SignGuestbook(ADA)),
        ),
        When('a visitor vouches for her entry')(
          'outcome',
          ({ guestbook, signed }) =>
            Effect.gen(function*() {
              const refused = yield* Effect.flip(guestbook.moderate.run({ id: signed.id, event: 'Vouch' }))
              const storedState = yield* guestbook.store.stateOf(signed.id)
              return { refused, storedState }
            }),
        ),
        Then('the cell refuses IllegalTransition naming the state and the event, and the stored row is byte-identical')(
          ({ outcome }, expect) => expect(outcome).toEqual({ refused: EXPECTED_ILLEGAL_VOUCH, storedState: 'Visible' }),
        ),
      ),
    )

    scenario(
      'A sign refused for a missing name writes nothing to the store',
      Gherkin.Do.pipe(
        Given('a composed guestbook over an empty store')('guestbook', composeGuestbook),
        When('a visitor signs with no name and the store is read')(
          'outcome',
          ({ guestbook }) =>
            Effect.gen(function*() {
              const refused = yield* Effect.flip(
                guestbook.sign.run(new SignGuestbook({ name: '', message: 'Hello there' })),
              )
              const page = yield* guestbook.store.latest
              return { refused, page }
            }),
        ),
        Then('the refusal is NameMissing and the latest page is still empty')(({ outcome }, expect) =>
          expect(outcome).toEqual({ refused: EXPECTED_NAME_MISSING, page: [] })
        ),
      ),
    )

    scenario(
      'A flag aimed at an entry that is not there fails as EntryNotFound',
      Gherkin.Do.pipe(
        Given('a composed guestbook over an empty store')('guestbook', composeGuestbook),
        When('a visitor flags entry one')(
          'refused',
          ({ guestbook }) => Effect.flip(guestbook.moderate.run({ id: ENTRY_ONE, event: 'Flag' })),
        ),
        Then('the cell refuses with EntryNotFound for that id')(({ refused }, expect) =>
          expect(refused).toEqual(EXPECTED_NOT_FOUND)
        ),
      ),
    )

    scenario(
      'A flag resolves to the state the cell decided, and the store holds exactly that state',
      Gherkin.Do.pipe(
        Given('a composed guestbook over an empty store')('guestbook', composeGuestbook),
        Given('Ada has signed through the composed sign cell')(
          'signed',
          ({ guestbook }) => guestbook.sign.run(new SignGuestbook(ADA)),
        ),
        When('a visitor flags her entry')(
          'outcome',
          ({ guestbook, signed }) =>
            Effect.gen(function*() {
              const movedTo = yield* guestbook.moderate.run({ id: signed.id, event: 'Flag' })
              const storedState = yield* guestbook.store.stateOf(signed.id)
              return { movedTo, storedState }
            }),
        ),
        Then('the cell resolves to Flagged and the stored state agrees')(({ outcome }, expect) =>
          expect(outcome).toEqual({ movedTo: 'Flagged', storedState: 'Flagged' })
        ),
      ),
    )
  })
