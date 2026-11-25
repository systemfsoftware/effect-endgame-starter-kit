import * as Clock from 'effect/Clock'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'

export interface FakeClock extends Clock.Clock {
  readonly set: (millis: number) => void
  readonly advance: (millis: number) => void
}

const NANOS_PER_MILLI = 1_000_000n

export const make = (start: number = 1_700_000_000_000): FakeClock => {
  let now = start
  return {
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.sync(() => now),
    currentTimeNanosUnsafe: () => BigInt(now) * NANOS_PER_MILLI,
    currentTimeNanos: Effect.sync(() => BigInt(now) * NANOS_PER_MILLI),
    monotonicTimeNanosUnsafe: () => BigInt(now) * NANOS_PER_MILLI,
    monotonicTimeNanos: Effect.sync(() => BigInt(now) * NANOS_PER_MILLI),
    sleep: (duration: Duration.Duration) => Effect.sleep(duration),
    set: (millis: number) => {
      now = millis
    },
    advance: (millis: number) => {
      now = now + millis
    },
  }
}
