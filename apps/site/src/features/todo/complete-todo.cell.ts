import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'

import { completeTodo } from './complete-todo.workflow'
import { personOf } from './todo-credential'
import { readTodo } from './todo-probe'
import { TodoStore } from './todo-store.service'
import { CompleteTodoRequest, TodoNotFound, TodoStoreUnavailable, TodoVersionConflict } from './todo.schema'

export const completeTodoCell = Sandwich.named('todo.complete')(
  (request: S.Schema.Type<typeof CompleteTodoRequest>) =>
    Effect.gen(function*() {
      const person = yield* personOf(request.credential)
      const probe = yield* readTodo({ person, id: request.id })
      return {
        person,
        id: request.id,
        version: request.version,
        done: request.done,
        probe,
      }
    }),
)
  .decide(completeTodo)
  .write({
    TodoCompleted: (decision, command) =>
      Effect.flatMap(TodoStore, (store) => store.update(command.person, decision.todo, command.version)).pipe(
        Effect.map((todo) => ({ todo })),
      ),
    TodoNotFound: (missing) => Effect.fail(new TodoNotFound({ id: missing.id })),
    TodoVersionConflict: (conflict) =>
      Effect.fail(new TodoVersionConflict({ id: conflict.id, expected: conflict.expected, actual: conflict.actual })),
    TodoStoreUnavailable: (failure) => Effect.fail(new TodoStoreUnavailable({ detail: failure.detail })),
    CommandRejected: ({ issue }) => Effect.die(new Error(issue)),
  })
