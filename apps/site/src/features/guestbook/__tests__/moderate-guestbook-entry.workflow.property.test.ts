import { describe, it } from '@systemfsoftware/vitest'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { EntryState, LifecycleEvent } from '../guestbook.schema.ts'
import {
  type EntryMoved,
  type IllegalTransition,
  ModerateGuestbookEntry,
  moderateGuestbookEntry,
} from '../moderate-guestbook-entry.workflow.ts'

type Moderated = Result.Result<EntryMoved, IllegalTransition>
type Moderate = (command: ModerateGuestbookEntry) => Moderated
type Move = readonly [EntryState, LifecycleEvent, EntryState]

const STATE_NAMES: ReadonlyArray<string> = ['Visible', 'Flagged', 'Hidden']

const LEGAL_MOVES: ReadonlyArray<Move> = [
  ['Visible', 'Flag', 'Flagged'],
  ['Flagged', 'Vouch', 'Visible'],
  ['Flagged', 'Flag', 'Hidden'],
]

const targetOf = (state: EntryState, event: LifecycleEvent): EntryState | undefined =>
  LEGAL_MOVES.find(([from, on]) => from === state && on === event)?.[2]

interface Step {
  readonly before: EntryState
  readonly event: LifecycleEvent
  readonly outcome: Moderated
  readonly after: EntryState
}

const stateAfter = (before: EntryState, outcome: Moderated): EntryState =>
  Result.match(outcome, { onSuccess: (moved) => moved.to, onFailure: () => before })

const walk = (moderate: Moderate, events: ReadonlyArray<LifecycleEvent>): ReadonlyArray<Step> =>
  events.reduce<ReadonlyArray<Step>>((steps, event) => {
    const before = steps.at(-1)?.after ?? 'Visible'
    const outcome = moderate(new ModerateGuestbookEntry({ state: before, event }))
    return [...steps, { before, event, outcome, after: stateAfter(before, outcome) }]
  }, [])

const refusalKeepsState = ({ before, event, outcome, after }: Step): boolean =>
  Result.match(outcome, {
    onSuccess: () => true,
    onFailure: (refused) =>
      refused.state === before && refused.event === event && after === before &&
      refused.message.includes(before) && refused.message.includes(event),
  })

const movesOf = (steps: ReadonlyArray<Step>): ReadonlyArray<Move> =>
  steps.flatMap(({ before, event, outcome }) =>
    Result.match(outcome, {
      onSuccess: (moved): ReadonlyArray<Move> => [[before, event, moved.to]],
      onFailure: (): ReadonlyArray<Move> => [],
    })
  )

const tableMovesOf = (events: ReadonlyArray<LifecycleEvent>): ReadonlyArray<Move> =>
  events.reduce<{ readonly state: EntryState; readonly moves: ReadonlyArray<Move> }>(
    ({ state, moves }, event) => {
      const to = targetOf(state, event)
      return to === undefined ? { state, moves } : { state: to, moves: [...moves, [state, event, to]] }
    },
    { state: 'Visible', moves: [] },
  ).moves

const takes = ([from, on, to]: Move) => (events: ReadonlyArray<LifecycleEvent>): boolean =>
  tableMovesOf(events).some(([state, event, target]) => state === from && event === on && target === to)

const decodeCommand = (input: { readonly state: string; readonly event: LifecycleEvent }) =>
  S.decodeResult(ModerateGuestbookEntry)(input)

describe('moderateGuestbookEntry — a visitor event moves an entry along R1, or is refused', () => {
  it.prop(
    '∀e_ReachedState_∈EntryState',
    { of: { events: S.Array(LifecycleEvent) }, subject: moderateGuestbookEntry },
    (subject, { events }) => walk(subject, events).every(({ after }) => S.is(EntryState)(after)),
  )

  it.prop(
    '∀e_RefusedEvent_=UnchangedState',
    { of: { events: S.Array(LifecycleEvent) }, subject: moderateGuestbookEntry },
    (subject, { events }) => walk(subject, events).every(refusalKeepsState),
  )

  it.prop(
    '∀e_HiddenEvent_⊥Move',
    { of: { event: LifecycleEvent }, subject: moderateGuestbookEntry },
    (subject, { event }) =>
      Result.match(subject(new ModerateGuestbookEntry({ state: 'Hidden', event })), {
        onSuccess: () => false,
        onFailure: (refused) => refused.state === 'Hidden' && refused.event === event,
      }),
  )

  it.prop(
    '∀p_LegalPair_≡HandWrittenTable',
    { of: { state: EntryState, event: LifecycleEvent }, subject: moderateGuestbookEntry },
    (subject, { state, event }) =>
      Result.match(subject(new ModerateGuestbookEntry({ state, event })), {
        onSuccess: (moved) => moved.from === state && moved.to === targetOf(state, event),
        onFailure: () => targetOf(state, event) === undefined,
      }),
  )

  it.prop(
    '∀p_MoveActions_=Empty',
    { of: { state: EntryState, event: LifecycleEvent }, subject: moderateGuestbookEntry },
    (subject, { state, event }) =>
      Result.match(subject(new ModerateGuestbookEntry({ state, event })), {
        onSuccess: (moved) => moved.actions === 0,
        onFailure: () => true,
      }),
  )

  it.prop(
    '∀e_WalkMoves_≡HandWrittenTableWalk',
    {
      of: [S.Array(LifecycleEvent)],
      subject: moderateGuestbookEntry,
      cover: {
        visibleFlag: [takes(['Visible', 'Flag', 'Flagged']), 0.1],
        flaggedVouch: [takes(['Flagged', 'Vouch', 'Visible']), 0.1],
        flaggedFlag: [takes(['Flagged', 'Flag', 'Hidden']), 0.1],
      },
    },
    (subject, [events]) => JSON.stringify(movesOf(walk(subject, events))) === JSON.stringify(tableMovesOf(events)),
  )

  it.prop(
    '∀s_CommandStateDecode_≡ThreeNameMembership',
    { of: { state: S.Union([EntryState, S.String]), event: LifecycleEvent }, subject: decodeCommand },
    (decode, { state, event }) => Result.isSuccess(decode({ state, event })) === STATE_NAMES.includes(state),
  )
})
