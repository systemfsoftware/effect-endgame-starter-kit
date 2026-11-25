import { describe, it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  PersonId,
  RemoveTodo,
  removeTodo,
  type RemoveTodoRefusal,
  Todo,
  TodoFound,
  TodoMissing,
  TodoNotFound,
  TodoRemoved,
  TodoStoreFailed,
  TodoStoreUnavailable,
  Uuid,
} from '@endgame/site/todo'

type Removed = Result.Result<TodoRemoved, RemoveTodoRefusal>

const sameTodo = (todo: Todo, other: Todo): boolean =>
  todo.id === other.id &&
  todo.text === other.text &&
  todo.done === other.done &&
  todo.position === other.position &&
  todo.version === other.version &&
  todo.createdAt === other.createdAt

const removedAs = (outcome: Removed, expected: Todo): boolean =>
  Result.match(outcome, {
    onSuccess: (removed) => sameTodo(removed.todo, expected),
    onFailure: () => false,
  })

const conflictAs = (outcome: Removed, expected: number, actual: number): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) =>
      Match.value(refused).pipe(
        Match.tag('TodoVersionConflict', (conflict) => conflict.expected === expected && conflict.actual === actual),
        Match.orElse(() => false),
      ),
  })

const refusedAs = (outcome: Removed, isRefusal: (refused: RemoveTodoRefusal) => boolean): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) => isRefusal(refused) && refused.message !== '',
  })

describe('Feature: a todo is removed at the version the reader saw, or the removal is refused', () => {
  it.prop(
    '∀d_Removed_=TheFoundTodo',
    { of: { todo: Todo, version: S.Int, person: PersonId }, subject: removeTodo },
    (subject, { todo, version, person }) => {
      const outcome = subject(
        new RemoveTodo({ person, id: todo.id, version, probe: new TodoFound({ todo }) }),
      )
      return Match.value(todo.version === version).pipe(
        Match.when(true, () => removedAs(outcome, todo)),
        Match.when(false, () => conflictAs(outcome, version, todo.version)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Refusal_=NotFoundOnMissingTodo',
    { of: { id: Uuid, version: S.Int, person: PersonId }, subject: removeTodo },
    (subject, { id, version, person }) =>
      refusedAs(
        subject(new RemoveTodo({ person, id, version, probe: new TodoMissing({ id }) })),
        S.is(TodoNotFound),
      ),
  )

  it.prop(
    '∀d_Refusal_=StoreUnavailableOnFailedRead',
    { of: { id: Uuid, version: S.Int, person: PersonId, detail: S.String }, subject: removeTodo },
    (subject, { id, version, person, detail }) =>
      refusedAs(
        subject(new RemoveTodo({ person, id, version, probe: new TodoStoreFailed({ detail }) })),
        S.is(TodoStoreUnavailable),
      ),
  )
})
