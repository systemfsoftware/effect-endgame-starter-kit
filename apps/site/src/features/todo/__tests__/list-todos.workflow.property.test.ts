import { describe, it } from '@systemfsoftware/vitest'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  ListTodos,
  listTodos,
  type ListTodosRefusal,
  PersonId,
  type Todo,
  TodoListed,
  Todos,
  TodosRead,
  TodoStoreFailed,
  TodoStoreUnavailable,
} from '@endgame/site/todo'

type Listed = Result.Result<TodoListed, ListTodosRefusal>

const sameTodo = (todo: Todo, other: Todo | undefined): boolean =>
  other !== undefined &&
  todo.id === other.id &&
  todo.text === other.text &&
  todo.done === other.done &&
  todo.position === other.position &&
  todo.version === other.version &&
  todo.createdAt === other.createdAt

const sameTodos = (left: Todos, right: Todos): boolean =>
  left.length === right.length && left.every((todo, index) => sameTodo(todo, right[index]))

const listedAs = (outcome: Listed, todos: Todos): boolean =>
  Result.match(outcome, {
    onSuccess: (listed) => sameTodos(listed.todos, todos),
    onFailure: () => false,
  })

const refusedAs = (outcome: Listed, isRefusal: (refused: ListTodosRefusal) => boolean): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) => isRefusal(refused) && refused.message !== '',
  })

describe('Feature: the todo list is read whole for the person who asks, or the read is refused', () => {
  it.prop(
    '∀d_List_=ProbeTodos',
    { of: { todos: Todos, person: PersonId }, subject: listTodos },
    (subject, { todos, person }) =>
      listedAs(subject(new ListTodos({ person, probe: new TodosRead({ todos }) })), todos),
  )

  it.prop(
    '∀d_Refusal_=StoreUnavailableOnFailedRead',
    { of: { person: PersonId, detail: S.String }, subject: listTodos },
    (subject, { person, detail }) =>
      refusedAs(
        subject(new ListTodos({ person, probe: new TodoStoreFailed({ detail }) })),
        S.is(TodoStoreUnavailable),
      ),
  )
})
