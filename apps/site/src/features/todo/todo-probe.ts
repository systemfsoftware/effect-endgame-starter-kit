import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'

import { TodoStore } from './todo-store.service'
import { type PersonId, TodoFound, TodoMissing, TodosRead, TodoStoreFailed, type Uuid } from './todo.schema'

export const readTodos = (person: PersonId): Effect.Effect<TodosRead | TodoStoreFailed, never, TodoStore> =>
  Effect.flatMap(TodoStore, (store) =>
    store.list(person).pipe(
      Effect.match({
        onSuccess: (todos) => new TodosRead({ todos }),
        onFailure: (failure) => new TodoStoreFailed({ detail: failure.detail }),
      }),
    ))

export interface TodoLookup {
  readonly person: PersonId
  readonly id: Uuid
}

export const readTodo = (
  lookup: TodoLookup,
): Effect.Effect<TodoFound | TodoMissing | TodoStoreFailed, never, TodoStore> =>
  Effect.flatMap(TodoStore, (store) =>
    store.todo(lookup.person, lookup.id).pipe(
      Effect.match({
        onSuccess: (todo) => new TodoFound({ todo }),
        onFailure: (failure) =>
          Match.value(failure).pipe(
            Match.tag('TodoNotFound', (missing) => new TodoMissing({ id: missing.id })),
            Match.tag('TodoStoreUnavailable', (unavailable) => new TodoStoreFailed({ detail: unavailable.detail })),
            Match.exhaustive,
          ),
      }),
    ))
