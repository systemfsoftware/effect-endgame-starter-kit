# @endgame/registration

Workshop registration for the starter's worked example. A person asks for seats in one session of a workshop and gets a decided outcome: seats held until a deadline, places on the session's waitlist, and the rest refused by a per-person cap C. A held seat becomes confirmed only when its holder confirms it before the deadline.

Both decisions are pure functions over branded types. They read no clock, do no I/O and draw no randomness: the caller reads the session, the registration and the clock, calls the decision, and writes what it says.

## Usage

```ts
import {
  HoldTtl,
  Instant,
  registerSeats,
  RegisterSeatsCommand,
  RequestedSeats,
  SeatCap,
  SeatCount,
  SessionFound,
  WaitlistTail,
} from '@endgame/registration'
import * as Result from 'effect/Result'

const decision = registerSeats(
  RegisterSeatsCommand.make({
    session: SessionFound.make({
      capacity: SeatCount.make(2),
      taken: SeatCount.make(0),
      waitlistTail: WaitlistTail.make(0),
    }),
    personSeats: SeatCount.make(1),
    cap: SeatCap.make(4),
    requested: RequestedSeats.make(5),
    now: Instant.make(Date.parse('2026-10-06T12:00:00Z')),
    holdTtl: HoldTtl.make(15 * 60 * 1000),
  }),
)

console.log(Result.getOrThrow(decision))
```

With C = 4, one seat already held and two seats free, a request for five seats holds two, waitlists one and refuses two:

```text
Seated {
  _tag: 'Seated',
  held: 2,
  expiresAt: 1791288900000,
  waitlisted: 1,
  nextPosition: 1,
  refusedByCap: 2,
  ...
}
```

## Decisions

| Workflow        | Command                                                                                                     | Decisions                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `registerSeats` | the session as found or missing, the person's held and confirmed seats in the workshop, C, N, now, hold TTL | `Seated { held, expiresAt, waitlisted, nextPosition, refusedByCap }`, `CapReached`, `SessionUnknown` |
| `confirmSeat`   | the registration as found (holder and state) or missing, the confirming person, now                         | `SeatConfirmed`, `NotHolder`, `HoldExpired`, `NotHeld`, `RegistrationUnknown`                        |

`registerSeats` takes the room left under the cap, C minus the person's held and confirmed seats. It holds as many seats as are free, up to that room and the request; it waitlists as many of the rest as the room still allows, at positions that continue from the session's waitlist tail; it refuses the remainder by the cap. Every held seat expires at now plus the hold TTL. A person with no room left gets `CapReached`, and a session the workshop does not hold gets `SessionUnknown`.

`confirmSeat` confirms a held seat only for its holder and only strictly before the seat's deadline. At or after the deadline the holder gets `HoldExpired`; anyone else gets `NotHolder`. A registration in any other state gets `NotHeld`, and a missing one gets `RegistrationUnknown`.

## Registration states

A registration is exactly one of `Held { expiresAt }`, `Confirmed`, `Waitlisted { position }`, `Cancelled` or `Expired`. Each state carries only its own fields, so a confirmed seat has no deadline to misread and a held seat has no waitlist position.

## Bounds

Every count, time and id is a branded type decoded at the boundary. The ranges keep every sum the decisions compute inside its result type.

| Type                                | Range                                                         | Why                                                                          |
| ----------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SeatCount`                         | 0 to 2,147,483,647                                            | The largest Postgres `integer`, so seat counts fit one column on both stores |
| `SeatCap` (C), `RequestedSeats` (N) | 1 to 2,147,483,647                                            | As above; a cap or a request of zero seats decides nothing                   |
| `Instant`                           | 0 to 8,640,000,000,000,000 ms after the epoch                 | The range of an ECMAScript `Date`, so every clock reading converts to one    |
| `HoldTtl`                           | 1 ms to `Number.MAX_SAFE_INTEGER` minus the largest `Instant` | A deadline, a clock reading plus the TTL, stays a safe integer               |
| `Deadline`                          | 0 to `Number.MAX_SAFE_INTEGER` ms after the epoch             | Holds any clock reading plus any TTL                                         |
| `WaitlistPosition`                  | 1 to `Number.MAX_SAFE_INTEGER`                                | Positions only grow, so an entry keeps its place                             |
| `WaitlistTail`                      | 0 to `Number.MAX_SAFE_INTEGER` minus 2,147,483,647            | Leaves room for one more request's places, which never exceed C              |
| `PersonId`                          | 1 to 64 characters of `A-Z`, `a-z`, `0-9`, `_` and `-`        | URL-safe, and wide enough for slugs, UUIDs and generated user ids            |
