import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  ListTodosRefusal,
  ListTodosResponse,
  PersonId,
  TodosRead,
  TodoStoreFailed,
  TodoStoreUnavailable,
} from './todo.schema.ts'

const ListTodosTypeId: unique symbol = Symbol.for('site/ListTodos')

export class ListTodos extends S.Class<ListTodos, { readonly brand: unique symbol }>('ListTodos')({
  person: PersonId,
  probe: S.Union([TodosRead, TodoStoreFailed]),
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

export class TodoListed extends S.TaggedClass<TodoListed, { readonly brand: unique symbol }>()('TodoListed', {
  todos: ListTodosResponse,
}) {
  readonly [ListTodosTypeId] = ListTodosTypeId
}

export const listTodos = Workflow.make({
  command: ListTodos,
  decision: TodoListed,
  error: ListTodosRefusal,
  decide: (command) =>
    Match.value(command.probe).pipe(
      Match.tag('TodosRead', (read) => Result.succeed(new TodoListed({ todos: read.todos }))),
      Match.tag('TodoStoreFailed', (failure) => Result.fail(new TodoStoreUnavailable({ detail: failure.detail }))),
      Match.exhaustive,
    ),
})
