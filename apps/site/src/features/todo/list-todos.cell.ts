import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'

import { listTodos } from './list-todos.workflow'
import { personOf } from './todo-credential'
import { readTodos } from './todo-probe'
import { ListTodosRequest, TodoStoreUnavailable } from './todo.schema'

export const listTodosCell = Sandwich.named('todo.list')((request: S.Schema.Type<typeof ListTodosRequest>) =>
  Effect.gen(function*() {
    const person = yield* personOf(request.credential)
    const probe = yield* readTodos(person)
    return { person, probe }
  })
)
  .decide(listTodos)
  .write({
    TodoListed: (decision) => Effect.succeed(decision.todos),
    TodoStoreUnavailable: (failure) => Effect.fail(new TodoStoreUnavailable({ detail: failure.detail })),
    CommandRejected: ({ issue }) => Effect.die(new Error(issue)),
  })
