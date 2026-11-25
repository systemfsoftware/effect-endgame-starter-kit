import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'

import { removeTodo } from './remove-todo.workflow'
import { personOf } from './todo-credential'
import { readTodo } from './todo-probe'
import { TodoStore } from './todo-store.service'
import { RemoveTodoRequest, TodoNotFound, TodoStoreUnavailable, TodoVersionConflict } from './todo.schema'

export const removeTodoCell = Sandwich.named('todo.remove')(
  (request: S.Schema.Type<typeof RemoveTodoRequest>) =>
    Effect.gen(function*() {
      const person = yield* personOf(request.credential)
      const probe = yield* readTodo({ person, id: request.id })
      return {
        person,
        id: request.id,
        version: request.version,
        probe,
      }
    }),
)
  .decide(removeTodo)
  .write({
    TodoRemoved: (decision, command) =>
      Effect.flatMap(TodoStore, (store) => store.remove(command.person, command.id, command.version)).pipe(
        Effect.as({ todo: decision.todo }),
      ),
    TodoNotFound: (missing) => Effect.fail(new TodoNotFound({ id: missing.id })),
    TodoVersionConflict: (conflict) =>
      Effect.fail(new TodoVersionConflict({ id: conflict.id, expected: conflict.expected, actual: conflict.actual })),
    TodoStoreUnavailable: (failure) => Effect.fail(new TodoStoreUnavailable({ detail: failure.detail })),
    CommandRejected: ({ issue }) => Effect.die(new Error(issue)),
  })
