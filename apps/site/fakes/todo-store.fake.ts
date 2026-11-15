import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import {
  type PersonId,
  Todo,
  TodoMove,
  TodoNotFound,
  Todos,
  TodoStore,
  TodoVersionConflict,
  type Uuid,
} from '@endgame/site/todo'

interface Row {
  readonly person: PersonId
  readonly todo: Todo
}

export interface TodoStoreFake {
  readonly layer: Layer.Layer<TodoStore>
  readonly todosOf: (person: PersonId) => Effect.Effect<Todos, never>
}

const keyOf = (person: PersonId, id: Uuid): string => `${person}/${id}`

const listOf = (rows: Map<string, Row>, person: PersonId): Todos =>
  [...rows.values()]
    .filter((row) => row.person === person)
    .map((row) => row.todo)
    .sort((left, right) => left.position - right.position)

const storedOf = (
  rows: Map<string, Row>,
  person: PersonId,
  id: Uuid,
): Effect.Effect<Todo, TodoNotFound> =>
  Effect.suspend((): Effect.Effect<Todo, TodoNotFound> => {
    const row = rows.get(keyOf(person, id))
    return row === undefined ? Effect.fail(new TodoNotFound({ id })) : Effect.succeed(row.todo)
  })

const versionGuard = (todo: Todo, expectedVersion: number): Effect.Effect<Todo, TodoVersionConflict> =>
  Effect.suspend((): Effect.Effect<Todo, TodoVersionConflict> =>
    todo.version === expectedVersion
      ? Effect.succeed(todo)
      : Effect.fail(new TodoVersionConflict({ id: todo.id, expected: expectedVersion, actual: todo.version }))
  )

const placed = (todo: Todo, move: TodoMove): Todo => ({
  id: todo.id,
  text: todo.text,
  done: todo.done,
  position: move.position,
  version: move.version,
  createdAt: todo.createdAt,
})

export const make = (): TodoStoreFake => {
  const rows = new Map<string, Row>()

  const layer = Layer.succeed(TodoStore, {
    list: (person) => Effect.succeed(listOf(rows, person)),
    todo: (person, id) => storedOf(rows, person, id),
    add: (person, todo) =>
      Effect.sync(() => {
        rows.set(keyOf(person, todo.id), { person, todo })
        return todo
      }),
    update: (person, todo, expectedVersion) =>
      Effect.flatMap(
        storedOf(rows, person, todo.id),
        (stored) =>
          Effect.flatMap(versionGuard(stored, expectedVersion), () =>
            Effect.sync(() => {
              rows.set(keyOf(person, todo.id), { person, todo })
              return todo
            })),
      ),
    remove: (person, id, expectedVersion) =>
      Effect.flatMap(
        storedOf(rows, person, id),
        (stored) =>
          Effect.flatMap(versionGuard(stored, expectedVersion), () =>
            Effect.sync(() => {
              rows.delete(keyOf(person, id))
              return id
            })),
      ),
    reorder: (person, first, second) =>
      Effect.flatMap(
        storedOf(rows, person, first.id),
        (storedFirst) =>
          Effect.flatMap(storedOf(rows, person, second.id), (storedSecond) =>
            Effect.flatMap(versionGuard(storedFirst, first.expectedVersion), () =>
              Effect.flatMap(versionGuard(storedSecond, second.expectedVersion), () =>
                Effect.sync(() => {
                  rows.set(keyOf(person, first.id), { person, todo: placed(storedFirst, first) })
                  rows.set(keyOf(person, second.id), { person, todo: placed(storedSecond, second) })
                  return listOf(rows, person)
                })))),
      ),
  })

  return {
    layer,
    todosOf: (person) => Effect.succeed(listOf(rows, person)),
  }
}
