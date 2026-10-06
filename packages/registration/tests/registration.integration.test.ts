import {
  confirmCell,
  ConfirmRequest,
  HoldTtl,
  type Ledger,
  memoryDriver,
  memoryStore,
  PersonId,
  registerCell,
  RegisterRequest,
  RegistrationId,
  RequestedSeats,
  SeatCap,
  SessionId,
  type WorkshopDriver,
  WorkshopPolicy,
  type WorkshopStore,
  type WorkshopTables,
} from '@endgame/registration'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Array as Arr, Clock, Context, Duration, Effect, Layer, Match, Option, Predicate } from 'effect'

const HOLD_TTL = 15 * 60 * 1000

const policy = WorkshopPolicy.make({ cap: SeatCap.make(4), holdTtl: HoldTtl.make(HOLD_TTL) })

const monday = SessionId.make('monday')
const tuesday = SessionId.make('tuesday')
const sunday = SessionId.make('sunday')
const ada = PersonId.make('ada')
const bob = PersonId.make('bob')

const sessions = [
  { sessionId: monday, capacity: 2 },
  { sessionId: tuesday, capacity: 10 },
]

type LedgerRows = typeof Ledger.Encoded

const register = (
  store: WorkshopStore,
  person: PersonId,
  sessionId: SessionId,
  seats: number,
  workshopPolicy: WorkshopPolicy = policy,
) =>
  store((unit) =>
    registerCell(workshopPolicy)(unit).run(
      RegisterRequest.make({ sessionId, person, requested: RequestedSeats.make(seats) }),
    )
  )

const confirm = (store: WorkshopStore, person: PersonId, registrationId: number) =>
  store((unit) =>
    confirmCell(unit).run(ConfirmRequest.make({ registrationId: RegistrationId.make(registrationId), person }))
  )

const ledgerOf = (store: WorkshopStore) => store((unit) => UnitOfWork.use(unit, (driver) => driver.ledger))

const heldSeat = (
  store: WorkshopStore,
  person: PersonId,
  sessionId: SessionId,
  seats: number,
  workshopPolicy: WorkshopPolicy = policy,
) =>
  register(store, person, sessionId, seats, workshopPolicy).pipe(
    Effect.map((answer) =>
      Match.value(answer).pipe(
        Match.tagsExhaustive({
          Seated: ({ heldRegistrations }) => Arr.head(heldRegistrations),
          CapReached: () => Option.none(),
          SessionUnknown: () => Option.none(),
        }),
      )
    ),
    Effect.flatMap((seat) => Effect.fromOption(seat)),
  )

const rowsIn = (ledger: LedgerRows, sessionId: SessionId) =>
  ledger.registrations.filter((row) => row.sessionId === sessionId)

const idsIn = (ledger: LedgerRows, sessionId: SessionId, state: 'Held' | 'Waitlisted') =>
  rowsIn(ledger, sessionId)
    .filter((row) => Predicate.isTagged(row.registration, state))
    .map((row) => row.registrationId)

const auditSince = (before: LedgerRows, after: LedgerRows) =>
  after.audit.slice(before.audit.length).map(({ decision, outcome }) => ({ decision, outcome }))

const outcomeTagged = (tag: string) => `"_tag":"${tag}"`

const auditWriteRefused = (): Effect.Effect<WorkshopStore> =>
  UnitOfWork.memory<WorkshopTables, WorkshopDriver>(
    { sessions, registrations: [], audit: [] },
    (tables) => ({
      ...memoryDriver(tables),
      appendAudit: () => Effect.fail(new UnitOfWork.StoreUnavailable({ cause: 'the audit table refused the row' })),
    }),
  )

class Workshop extends Context.Service<Workshop, WorkshopStore>()('Workshop') {}

const workshop = Effect.service(Workshop)

const briefHolds = WorkshopPolicy.make({ cap: SeatCap.make(4), holdTtl: HoldTtl.make(1) })

const memoryWorkshop = Layer.effect(Workshop, memoryStore(sessions))

const Feature = makeFeature({ it })

Feature('Registering for a workshop session').withScenarioLayer(memoryWorkshop).body(({ scenario }) => {
  scenario(
    'A person asking for five seats is held two, waitlisted one and refused two by the cap',
    Gherkin.Do.pipe(
      Given('a workshop whose monday session has two seats and whose cap is four seats a person')(
        'store',
        () => workshop,
      ),
      Given('Ada already holds one seat on tuesday')((s) => register(s.store, ada, tuesday, 1)),
      Given('the time of the request')('now', () => Clock.currentTimeMillis),
      When('Ada asks for five seats on monday')('answer', (s) => register(s.store, ada, monday, 5)),
      When('the workshop ledger is read')('ledger', (s) => ledgerOf(s.store)),
      Then('two seats are held, one waitlist place is given and two seats are refused by the cap')((s, expect) =>
        expect({
          answer: s.answer,
          monday: rowsIn(s.ledger, monday).map(({ person, registration, decidedAt }) => ({
            person,
            registration,
            decidedAt,
          })),
        }).toEqual({
          answer: {
            _tag: 'Seated',
            held: 2,
            expiresAt: s.now + HOLD_TTL,
            waitlisted: 1,
            nextPosition: 1,
            refusedByCap: 2,
            heldRegistrations: idsIn(s.ledger, monday, 'Held'),
            waitlistedRegistrations: idsIn(s.ledger, monday, 'Waitlisted'),
          },
          monday: [
            { person: ada, registration: { _tag: 'Held', expiresAt: s.now + HOLD_TTL }, decidedAt: s.now },
            { person: ada, registration: { _tag: 'Held', expiresAt: s.now + HOLD_TTL }, decidedAt: s.now },
            { person: ada, registration: { _tag: 'Waitlisted', position: 1 }, decidedAt: s.now },
          ],
        })
      ),
    ),
  )

  scenario(
    'A person at the cap is refused and only the audit row is written',
    Gherkin.Do.pipe(
      Given('a workshop whose cap is four seats a person')('store', () => workshop),
      Given('Ada already holds four seats on tuesday')((s) => register(s.store, ada, tuesday, 4)),
      Given('the workshop ledger before the request')('before', (s) => ledgerOf(s.store)),
      When('Ada asks for one seat on monday')('answer', (s) => register(s.store, ada, monday, 1)),
      When('the workshop ledger is read again')('after', (s) => ledgerOf(s.store)),
      Then('the answer is CapReached and its audit row is the only new row')((s, expect) =>
        expect({
          answer: s.answer,
          registrations: s.after.registrations,
          audit: auditSince(s.before, s.after),
        }).toEqual({
          answer: { _tag: 'CapReached' },
          registrations: s.before.registrations,
          audit: [{ decision: 'registration.register', outcome: expect.stringContaining(outcomeTagged('CapReached')) }],
        })
      ),
    ),
  )

  scenario(
    'The holder confirms a held seat in time',
    Gherkin.Do.pipe(
      Given('a workshop')('store', () => workshop),
      Given('Ada holds a seat on monday')('seat', (s) => heldSeat(s.store, ada, monday, 1)),
      When('Ada confirms her seat before its hold expires')('answer', (s) => confirm(s.store, ada, s.seat)),
      When('the workshop ledger is read')('ledger', (s) => ledgerOf(s.store)),
      Then('the seat is confirmed')((s, expect) =>
        expect({
          answer: s.answer,
          seat: s.ledger.registrations
            .filter((row) => row.registrationId === s.seat)
            .map(({ person, registration }) => ({ person, registration })),
        }).toEqual({
          answer: { _tag: 'SeatConfirmed' },
          seat: [{ person: ada, registration: { _tag: 'Confirmed' } }],
        })
      ),
    ),
  )

  scenario(
    'Someone other than the holder cannot confirm the seat',
    Gherkin.Do.pipe(
      Given('a workshop')('store', () => workshop),
      Given('Ada holds a seat on monday')('seat', (s) => heldSeat(s.store, ada, monday, 1)),
      Given('the workshop ledger before the confirmation')('before', (s) => ledgerOf(s.store)),
      When("Bob confirms Ada's seat")('answer', (s) => confirm(s.store, bob, s.seat)),
      When('the workshop ledger is read again')('after', (s) => ledgerOf(s.store)),
      Then('the answer is NotHolder and the hold is unchanged')((s, expect) =>
        expect({
          answer: s.answer,
          registrations: s.after.registrations,
          audit: auditSince(s.before, s.after),
        }).toEqual({
          answer: { _tag: 'NotHolder' },
          registrations: s.before.registrations,
          audit: [{ decision: 'registration.confirm', outcome: expect.stringContaining(outcomeTagged('NotHolder')) }],
        })
      ),
    ),
  )

  scenario(
    'The holder cannot confirm once the hold has expired',
    { live: 'the hold lapses on the real clock: the simulation kernel cannot move time past a hold with no sleeper' },
    Gherkin.Do.pipe(
      Given('a workshop whose holds last one millisecond')('store', () => workshop),
      Given('Ada holds a seat on monday')('seat', (s) => heldSeat(s.store, ada, monday, 1, briefHolds)),
      Given('the workshop ledger before the confirmation')('before', (s) => ledgerOf(s.store)),
      When('the hold lapses')(() => Effect.sleep(Duration.millis(5))),
      When('Ada confirms her seat')('answer', (s) => confirm(s.store, ada, s.seat)),
      When('the workshop ledger is read again')('after', (s) => ledgerOf(s.store)),
      Then('the answer is HoldExpired and the hold is unchanged')((s, expect) =>
        expect({
          answer: s.answer,
          registrations: s.after.registrations,
          audit: auditSince(s.before, s.after),
        }).toEqual({
          answer: { _tag: 'HoldExpired' },
          registrations: s.before.registrations,
          audit: [{ decision: 'registration.confirm', outcome: expect.stringContaining(outcomeTagged('HoldExpired')) }],
        })
      ),
    ),
  )

  scenario(
    'A request for a session the workshop does not hold is refused as unknown',
    Gherkin.Do.pipe(
      Given('a workshop with monday and tuesday sessions')('store', () => workshop),
      Given('the workshop ledger before the request')('before', (s) => ledgerOf(s.store)),
      When('Ada asks for a seat on sunday')('answer', (s) => register(s.store, ada, sunday, 1)),
      When('the workshop ledger is read again')('after', (s) => ledgerOf(s.store)),
      Then('the answer is SessionUnknown and its audit row is the only new row')((s, expect) =>
        expect({
          answer: s.answer,
          registrations: s.after.registrations,
          audit: auditSince(s.before, s.after),
        }).toEqual({
          answer: { _tag: 'SessionUnknown' },
          registrations: s.before.registrations,
          audit: [
            { decision: 'registration.register', outcome: expect.stringContaining(outcomeTagged('SessionUnknown')) },
          ],
        })
      ),
    ),
  )

  scenario(
    'Every decided request writes exactly one audit row',
    Gherkin.Do.pipe(
      Given('a workshop')('store', () => workshop),
      Given('Ada holds a seat on monday')('adaSeat', (s) => heldSeat(s.store, ada, monday, 1)),
      Given('Bob holds four seats on tuesday')('bobSeat', (s) => heldSeat(s.store, bob, tuesday, 4)),
      When(
        "Ada confirms her seat twice, Bob asks past his cap, Ada asks for sunday, confirms Bob's seat and confirms a registration that does not exist",
      )((s) =>
        Effect.all([
          confirm(s.store, ada, s.adaSeat),
          confirm(s.store, ada, s.adaSeat),
          register(s.store, bob, monday, 1),
          register(s.store, ada, sunday, 1),
          confirm(s.store, ada, s.bobSeat),
          confirm(s.store, ada, 999),
        ])
      ),
      When('the workshop ledger is read')('ledger', (s) => ledgerOf(s.store)),
      Then('the audit holds one row per decision, in the order they were decided')((s, expect) =>
        expect(s.ledger.audit.map(({ decision, outcome }) => ({ decision, outcome }))).toEqual([
          { decision: 'registration.register', outcome: expect.stringContaining(outcomeTagged('Seated')) },
          { decision: 'registration.register', outcome: expect.stringContaining(outcomeTagged('Seated')) },
          { decision: 'registration.confirm', outcome: expect.stringContaining(outcomeTagged('SeatConfirmed')) },
          { decision: 'registration.confirm', outcome: expect.stringContaining(outcomeTagged('NotHeld')) },
          { decision: 'registration.register', outcome: expect.stringContaining(outcomeTagged('CapReached')) },
          { decision: 'registration.register', outcome: expect.stringContaining(outcomeTagged('SessionUnknown')) },
          { decision: 'registration.confirm', outcome: expect.stringContaining(outcomeTagged('NotHolder')) },
          { decision: 'registration.confirm', outcome: expect.stringContaining(outcomeTagged('RegistrationUnknown')) },
        ])
      ),
    ),
  )

  scenario(
    'A unit whose audit write fails writes nothing',
    { scenarioLayer: Layer.effect(Workshop, auditWriteRefused()) },
    Gherkin.Do.pipe(
      Given('a workshop whose audit table refuses every row')('store', () => workshop),
      When('Ada asks for two seats on monday')('failure', (s) => Effect.flip(register(s.store, ada, monday, 2))),
      When('the workshop ledger is read')('ledger', (s) => ledgerOf(s.store)),
      Then('the request fails as StoreUnavailable and no row is kept')((s, expect) =>
        expect({ failure: s.failure, ledger: s.ledger }).toMatchObject({
          failure: { _tag: 'StoreUnavailable' },
          ledger: { registrations: [], audit: [] },
        })
      ),
    ),
  )
})
