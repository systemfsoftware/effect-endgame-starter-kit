import { describe, it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  CompleteTodo,
  completeTodo,
  type CompleteTodoRefusal,
  PersonId,
  Todo,
  TodoCompleted,
  TodoFound,
  TodoMissing,
  TodoNotFound,
  TodoStoreFailed,
  TodoStoreUnavailable,
  Uuid,
} from '@endgame/site/todo'

type Completed = Result.Result<TodoCompleted, CompleteTodoRefusal>

const sameTodo = (todo: Todo, other: Todo): boolean =>
  todo.id === other.id &&
  todo.text === other.text &&
  todo.done === other.done &&
  todo.position === other.position &&
  todo.version === other.version &&
  todo.createdAt === other.createdAt

const completedAs = (outcome: Completed, expected: Todo): boolean =>
  Result.match(outcome, {
    onSuccess: (completed) => sameTodo(completed.todo, expected),
    onFailure: () => false,
  })

const conflictAs = (outcome: Completed, expected: number, actual: number): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) =>
      Match.value(refused).pipe(
        Match.tag('TodoVersionConflict', (conflict) => conflict.expected === expected && conflict.actual === actual),
        Match.orElse(() => false),
      ),
  })

const refusedAs = (outcome: Completed, isRefusal: (refused: CompleteTodoRefusal) => boolean): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) => isRefusal(refused) && refused.message !== '',
  })

describe('Feature: a todo is marked done or not done at the next version, or the mark is refused', () => {
  it.prop(
    '∀d_Completed_=DoneStateAtTheNextVersion',
    { of: { todo: Todo, version: S.Int, done: S.Boolean, person: PersonId }, subject: completeTodo },
    (subject, { todo, version, done, person }) => {
      const outcome = subject(
        new CompleteTodo({ person, id: todo.id, version, done, probe: new TodoFound({ todo }) }),
      )
      return Match.value(todo.version === version).pipe(
        Match.when(true, () => completedAs(outcome, { ...todo, done, version: todo.version + 1 })),
        Match.when(false, () => conflictAs(outcome, version, todo.version)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Refusal_=NotFoundOnMissingTodo',
    { of: { id: Uuid, version: S.Int, done: S.Boolean, person: PersonId }, subject: completeTodo },
    (subject, { id, version, done, person }) =>
      refusedAs(
        subject(new CompleteTodo({ person, id, version, done, probe: new TodoMissing({ id }) })),
        S.is(TodoNotFound),
      ),
  )

  it.prop(
    '∀d_Refusal_=StoreUnavailableOnFailedRead',
    {
      of: { id: Uuid, version: S.Int, done: S.Boolean, person: PersonId, detail: S.String },
      subject: completeTodo,
    },
    (subject, { id, version, done, person, detail }) =>
      refusedAs(
        subject(new CompleteTodo({ person, id, version, done, probe: new TodoStoreFailed({ detail }) })),
        S.is(TodoStoreUnavailable),
      ),
  )
})
