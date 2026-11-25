import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type {
  PersonId,
  Todo,
  TodoMove,
  TodoNotFound,
  Todos,
  TodoStoreUnavailable,
  TodoVersionConflict,
  Uuid,
} from './todo.schema'

export class TodoStore extends Context.Service<TodoStore, {
  readonly list: (person: PersonId) => Effect.Effect<Todos, TodoStoreUnavailable>
  readonly todo: (person: PersonId, id: Uuid) => Effect.Effect<Todo, TodoNotFound | TodoStoreUnavailable>
  readonly add: (person: PersonId, todo: Todo) => Effect.Effect<Todo, TodoStoreUnavailable>
  readonly update: (
    person: PersonId,
    todo: Todo,
    expectedVersion: number,
  ) => Effect.Effect<Todo, TodoNotFound | TodoStoreUnavailable | TodoVersionConflict>
  readonly remove: (
    person: PersonId,
    id: Uuid,
    expectedVersion: number,
  ) => Effect.Effect<Uuid, TodoNotFound | TodoStoreUnavailable | TodoVersionConflict>
  readonly reorder: (
    person: PersonId,
    first: TodoMove,
    second: TodoMove,
  ) => Effect.Effect<Todos, TodoNotFound | TodoStoreUnavailable | TodoVersionConflict>
}>()('site/TodoStore') {}
