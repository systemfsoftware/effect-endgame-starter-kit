import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'

import { addTodo } from './add-todo.workflow'
import { personOf } from './todo-credential'
import { newId } from './todo-ids'
import { readTodos } from './todo-probe'
import { TodoStore } from './todo-store.service'
import { AddTodoRequest, TodoRateLimited, TodoStoreUnavailable, TodoTextMissing, TodoTextTooLong } from './todo.schema'

export const addTodoCell = Sandwich.named('todo.add')((request: S.Schema.Type<typeof AddTodoRequest>) =>
  Effect.gen(function*() {
    const person = yield* personOf(request.credential)
    const now = yield* Clock.currentTimeMillis
    const probe = yield* readTodos(person)
    return {
      person,
      text: request.text,
      id: newId(),
      now,
      probe,
    }
  })
)
  .decide(addTodo)
  .write({
    TodoAdded: (decision, command) =>
      Effect.flatMap(TodoStore, (store) => store.add(command.person, decision.todo)).pipe(
        Effect.map((todo) => ({ todo })),
      ),
    TodoTextMissing: () => Effect.fail(new TodoTextMissing({})),
    TodoTextTooLong: () => Effect.fail(new TodoTextTooLong({})),
    TodoRateLimited: (failure) => Effect.fail(new TodoRateLimited({ limit: failure.limit })),
    TodoStoreUnavailable: (failure) => Effect.fail(new TodoStoreUnavailable({ detail: failure.detail })),
    CommandRejected: ({ issue }) => Effect.die(new Error(issue)),
  })
