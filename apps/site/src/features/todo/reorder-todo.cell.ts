import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'

import { reorderTodo } from './reorder-todo.workflow'
import { personOf } from './todo-credential'
import { readTodos } from './todo-probe'
import { TodoStore } from './todo-store.service'
import {
  ReorderTodoRequest,
  TodoNotFound,
  TodoNotMovable,
  TodoStoreUnavailable,
  TodoVersionConflict,
} from './todo.schema'

export const reorderTodoCell = Sandwich.named('todo.reorder')(
  (request: S.Schema.Type<typeof ReorderTodoRequest>) =>
    Effect.gen(function*() {
      const person = yield* personOf(request.credential)
      const probe = yield* readTodos(person)
      return {
        person,
        id: request.id,
        version: request.version,
        direction: request.direction,
        probe,
      }
    }),
)
  .decide(reorderTodo)
  .write({
    TodoReordered: (decision, command) =>
      Effect.flatMap(TodoStore, (store) => store.reorder(command.person, decision.first, decision.second)).pipe(
        Effect.map((todos) => ({ todos })),
      ),
    TodoNotFound: (failure) => Effect.fail(new TodoNotFound({ id: failure.id })),
    TodoNotMovable: (failure) => Effect.fail(new TodoNotMovable({ id: failure.id, edge: failure.edge })),
    TodoVersionConflict: (failure) =>
      Effect.fail(new TodoVersionConflict({ id: failure.id, expected: failure.expected, actual: failure.actual })),
    TodoStoreUnavailable: (failure) => Effect.fail(new TodoStoreUnavailable({ detail: failure.detail })),
    CommandRejected: ({ issue }) => Effect.die(new Error(issue)),
  })
