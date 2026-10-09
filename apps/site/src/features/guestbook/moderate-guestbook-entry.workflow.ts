import { Workflow } from '@systemfsoftware/effect-cell-types'
import { createMachine, type StateMachine } from '@systemfsoftware/xstate'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { EntryState, LifecycleEvent } from './guestbook.schema.ts'

const ModerateGuestbookEntryTypeId: unique symbol = Symbol()

export class ModerateGuestbookEntry extends S.Class<ModerateGuestbookEntry>('ModerateGuestbookEntry')({
  state: EntryState,
  event: LifecycleEvent,
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

export class EntryMoved extends S.TaggedClass<EntryMoved>()('EntryMoved', {
  from: EntryState,
  to: EntryState,
  actions: S.Int,
}) {
  readonly [ModerateGuestbookEntryTypeId] = ModerateGuestbookEntryTypeId
}

export class IllegalTransition extends S.TaggedError<IllegalTransition>()('IllegalTransition', {
  state: EntryState,
  event: LifecycleEvent,
}) {
  override get message(): string {
    return `An entry that is ${this.state} can't take ${this.event}.`
  }
}

const machine = createMachine({
  initial: 'Visible',
  states: {
    Visible: { on: { Flag: { target: 'Flagged' } } },
    Flagged: { on: { Vouch: { target: 'Visible' }, Flag: { target: 'Hidden' } } },
    Hidden: {},
  },
})

type MachineWidenedToStateMachine = typeof machine extends StateMachine<
  infer Context,
  infer Event,
  infer Children,
  infer Value,
  infer Tag,
  infer Input,
  infer Output,
  infer Emitted,
  infer Meta,
  infer Config,
  infer Actions,
  infer Actors,
  infer Guards,
  infer Delays,
  infer InternalEvent,
  infer TransitionMeta
> ? StateMachine<
    Context,
    Event,
    Children,
    Value,
    Tag,
    Input,
    Output,
    Emitted,
    Meta,
    Config,
    Actions,
    Actors,
    Guards,
    Delays,
    InternalEvent,
    TransitionMeta
  >
  : never

const lifecycle: MachineWidenedToStateMachine = machine

export const moderateGuestbookEntry = Workflow.make({
  command: ModerateGuestbookEntry,
  decision: EntryMoved,
  error: IllegalTransition,
  decide: (command) => {
    const snapshot = lifecycle.resolveState({ value: command.state })
    const [next, actions] = lifecycle.transition(snapshot, { type: command.event })
    return Match.value(next === snapshot).pipe(
      Match.when(true, () => Result.fail(new IllegalTransition({ state: command.state, event: command.event }))),
      Match.when(
        false,
        () => Result.succeed(new EntryMoved({ from: command.state, to: next.value, actions: actions.length })),
      ),
      Match.exhaustive,
    )
  },
})
