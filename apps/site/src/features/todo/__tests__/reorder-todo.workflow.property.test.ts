import { describe, it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  PersonId,
  ReorderTodo,
  reorderTodo,
  type ReorderTodoRefusal,
  TodoMove,
  TodoNotFound,
  TodoReordered,
  Todos,
  TodosRead,
  TodoStoreFailed,
  TodoStoreUnavailable,
  Uuid,
} from '@endgame/site/todo'

type Reordered = Result.Result<TodoReordered, ReorderTodoRefusal>

const uuidOf = (index: number): string => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`

const listOf = (size: number): Todos =>
  Array.from({ length: size }, (_, index) => ({
    id: uuidOf(index),
    text: `todo ${index}`,
    done: false,
    position: index,
    version: 1,
    createdAt: index,
  }))

const sameMove = (move: TodoMove, expected: TodoMove): boolean =>
  move.id === expected.id &&
  move.position === expected.position &&
  move.version === expected.version &&
  move.expectedVersion === expected.expectedVersion

const reorderedAs = (
  outcome: Reordered,
  expected: { readonly first: TodoMove; readonly second: TodoMove },
): boolean =>
  Result.match(outcome, {
    onSuccess: (reordered) => sameMove(reordered.first, expected.first) && sameMove(reordered.second, expected.second),
    onFailure: () => false,
  })

const conflictAs = (outcome: Reordered, expected: number, actual: number): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) =>
      Match.value(refused).pipe(
        Match.tag('TodoVersionConflict', (conflict) => conflict.expected === expected && conflict.actual === actual),
        Match.orElse(() => false),
      ),
  })

const notMovableAs = (outcome: Reordered, id: string, edge: 'top' | 'bottom'): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) =>
      Match.value(refused).pipe(
        Match.tag('TodoNotMovable', (refusal) => refusal.id === id && refusal.edge === edge),
        Match.orElse(() => false),
      ),
  })

const refusedAs = (outcome: Reordered, isRefusal: (refused: ReorderTodoRefusal) => boolean): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) => isRefusal(refused) && refused.message !== '',
  })

describe('Feature: a todo moves one place up or down the list, or the move is refused at its edge', () => {
  it.prop(
    '∀d_Reordered_=SwappedNeighbour',
    {
      of: { size: S.Int.check(S.isBetween({ minimum: 2, maximum: 5 })), version: S.Int, person: PersonId },
      subject: reorderTodo,
    },
    (subject, { size, version, person }) => {
      const todos = listOf(size)
      const outcome = subject(
        new ReorderTodo({ person, id: uuidOf(1), version, direction: 'up', probe: new TodosRead({ todos }) }),
      )
      return Match.value(version === 1).pipe(
        Match.when(
          true,
          () =>
            reorderedAs(outcome, {
              first: { id: uuidOf(1), position: 0, version: 2, expectedVersion: 1 },
              second: { id: uuidOf(0), position: 1, version: 2, expectedVersion: 1 },
            }),
        ),
        Match.when(false, () => conflictAs(outcome, version, 1)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Refusal_=NotMovableAtTheTopEdge',
    {
      of: { size: S.Int.check(S.isBetween({ minimum: 1, maximum: 5 })), version: S.Int, person: PersonId },
      subject: reorderTodo,
    },
    (subject, { size, version, person }) => {
      const todos = listOf(size)
      const outcome = subject(
        new ReorderTodo({ person, id: uuidOf(0), version, direction: 'up', probe: new TodosRead({ todos }) }),
      )
      return Match.value(version === 1).pipe(
        Match.when(true, () => notMovableAs(outcome, uuidOf(0), 'top')),
        Match.when(false, () => conflictAs(outcome, version, 1)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Refusal_=NotMovableAtTheBottomEdge',
    {
      of: { size: S.Int.check(S.isBetween({ minimum: 1, maximum: 5 })), version: S.Int, person: PersonId },
      subject: reorderTodo,
    },
    (subject, { size, version, person }) => {
      const todos = listOf(size)
      const last = uuidOf(size - 1)
      const outcome = subject(
        new ReorderTodo({ person, id: last, version, direction: 'down', probe: new TodosRead({ todos }) }),
      )
      return Match.value(version === 1).pipe(
        Match.when(true, () => notMovableAs(outcome, last, 'bottom')),
        Match.when(false, () => conflictAs(outcome, version, 1)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Refusal_=NotFoundOnMissingTodo',
    {
      of: { index: S.Int.check(S.isBetween({ minimum: 0, maximum: 1000 })), version: S.Int, person: PersonId },
      subject: reorderTodo,
    },
    (subject, { index, version, person }) =>
      refusedAs(
        subject(
          new ReorderTodo({
            person,
            id: uuidOf(1000 + index),
            version,
            direction: 'up',
            probe: new TodosRead({ todos: listOf(1) }),
          }),
        ),
        S.is(TodoNotFound),
      ),
  )

  it.prop(
    '∀d_Refusal_=StoreUnavailableOnFailedRead',
    { of: { id: Uuid, version: S.Int, person: PersonId, detail: S.String }, subject: reorderTodo },
    (subject, { id, version, person, detail }) =>
      refusedAs(
        subject(
          new ReorderTodo({
            person,
            id,
            version,
            direction: 'up',
            probe: new TodoStoreFailed({ detail }),
          }),
        ),
        S.is(TodoStoreUnavailable),
      ),
  )
})
