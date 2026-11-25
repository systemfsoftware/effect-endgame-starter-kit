import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'

import { renameTodo } from './rename-todo.workflow'
import { personOf } from './todo-credential'
import { readTodo } from './todo-probe'
import { TodoStore } from './todo-store.service'
import {
  RenameTodoRequest,
  TodoNotFound,
  TodoStoreUnavailable,
  TodoTextMissing,
  TodoTextTooLong,
  TodoVersionConflict,
} from './todo.schema'

export const renameTodoCell = Sandwich.named('todo.rename')(
  (request: S.Schema.Type<typeof RenameTodoRequest>) =>
    Effect.gen(function*() {
      const person = yield* personOf(request.credential)
      const probe = yield* readTodo({ person, id: request.id })
      return {
        person,
        id: request.id,
        version: request.version,
        text: request.text,
        probe,
      }
    }),
)
  .decide(renameTodo)
  .write({
    TodoRenamed: (decision, command) =>
      Effect.flatMap(TodoStore, (store) => store.update(command.person, decision.todo, command.version)).pipe(
        Effect.map((todo) => ({ todo })),
      ),
    TodoTextMissing: () => Effect.fail(new TodoTextMissing({})),
    TodoTextTooLong: () => Effect.fail(new TodoTextTooLong({})),
    TodoNotFound: (missing) => Effect.fail(new TodoNotFound({ id: missing.id })),
    TodoVersionConflict: (conflict) =>
      Effect.fail(new TodoVersionConflict({ id: conflict.id, expected: conflict.expected, actual: conflict.actual })),
    TodoStoreUnavailable: (failure) => Effect.fail(new TodoStoreUnavailable({ detail: failure.detail })),
    CommandRejected: ({ issue }) => Effect.die(new Error(issue)),
  })
