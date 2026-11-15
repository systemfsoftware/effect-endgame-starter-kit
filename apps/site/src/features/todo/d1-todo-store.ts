import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as S from 'effect/Schema'

import { TodoStore } from './todo-store.service'
import {
  type PersonId,
  Todo,
  TodoMove,
  TodoNotFound,
  TodoRow,
  Todos,
  TodoStoreUnavailable,
  TodoVersionConflict,
  type Uuid,
} from './todo.schema'

const COLUMNS = 'id, text, done, position, version, created_at AS createdAt'

type TodoRow = S.Schema.Type<typeof TodoRow>

const query = <A>(run: () => Promise<A>): Effect.Effect<A, TodoStoreUnavailable> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new TodoStoreUnavailable({ detail: cause instanceof Error ? cause.message : 'the query was rejected' }),
  })

const rowInvalid = (error: S.SchemaError): TodoStoreUnavailable =>
  new TodoStoreUnavailable({ detail: `a todo row did not decode: ${error.message.split('\n')[0] ?? 'unknown'}` })

const todoOf = (row: TodoRow): Todo => ({
  id: row.id,
  text: row.text,
  done: row.done,
  position: row.position,
  version: row.version,
  createdAt: row.createdAt,
})

const selectTodos = (database: D1Database, person: PersonId): Effect.Effect<Todos, TodoStoreUnavailable> =>
  query(() =>
    database
      .prepare(`SELECT ${COLUMNS} FROM todos WHERE person = ?1 ORDER BY position ASC, created_at ASC`)
      .bind(person)
      .all()
  ).pipe(
    Effect.flatMap(({ results }) =>
      S.decodeUnknownEffect(S.Array(TodoRow))(results).pipe(
        Effect.mapError(rowInvalid),
        Effect.map((rows) => rows.map(todoOf)),
      )
    ),
  )

const selectTodo = (
  database: D1Database,
  person: PersonId,
  id: Uuid,
): Effect.Effect<Todo, TodoNotFound | TodoStoreUnavailable> =>
  query(() => database.prepare(`SELECT ${COLUMNS} FROM todos WHERE person = ?1 AND id = ?2`).bind(person, id).first())
    .pipe(
      Effect.flatMap((row) => Effect.mapError(Effect.fromNullishOr(row), () => new TodoNotFound({ id }))),
      Effect.flatMap((row) => S.decodeUnknownEffect(TodoRow)(row).pipe(Effect.mapError(rowInvalid))),
      Effect.map(todoOf),
    )

const insertTodo = (
  database: D1Database,
  person: PersonId,
  todo: Todo,
): Effect.Effect<Todo, TodoStoreUnavailable> =>
  query(() =>
    database
      .prepare(
        'INSERT INTO todos (id, person, text, done, position, version, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING ' +
          COLUMNS,
      )
      .bind(todo.id, person, todo.text, todo.done ? 1 : 0, todo.position, todo.version, todo.createdAt)
      .first()
  ).pipe(
    Effect.flatMap((row) => S.decodeUnknownEffect(TodoRow)(row).pipe(Effect.mapError(rowInvalid))),
    Effect.map(todoOf),
  )

const conflictOf = (
  database: D1Database,
  person: PersonId,
  id: Uuid,
  expectedVersion: number,
): Effect.Effect<Todo, TodoNotFound | TodoStoreUnavailable | TodoVersionConflict> =>
  selectTodo(database, person, id).pipe(
    Effect.flatMap((current) =>
      Effect.fail(new TodoVersionConflict({ id, expected: expectedVersion, actual: current.version }))
    ),
  )

const updateTodo = (
  database: D1Database,
  person: PersonId,
  todo: Todo,
  expectedVersion: number,
): Effect.Effect<Todo, TodoNotFound | TodoStoreUnavailable | TodoVersionConflict> =>
  query(() =>
    database
      .prepare(
        'UPDATE todos SET text = ?2, done = ?3, position = ?4, version = ?5 WHERE person = ?1 AND id = ?6 AND version = ?7',
      )
      .bind(person, todo.text, todo.done ? 1 : 0, todo.position, todo.version, todo.id, expectedVersion)
      .run()
  ).pipe(
    Effect.flatMap(({ meta }) =>
      Effect.suspend(() =>
        meta.changes === 1
          ? Effect.succeed(todo)
          : conflictOf(database, person, todo.id, expectedVersion)
      )
    ),
  )

const deleteTodo = (
  database: D1Database,
  person: PersonId,
  id: Uuid,
  expectedVersion: number,
): Effect.Effect<Uuid, TodoNotFound | TodoStoreUnavailable | TodoVersionConflict> =>
  query(() =>
    database
      .prepare('DELETE FROM todos WHERE person = ?1 AND id = ?2 AND version = ?3')
      .bind(person, id, expectedVersion)
      .run()
  ).pipe(
    Effect.flatMap(({ meta }) =>
      Effect.suspend(() =>
        meta.changes === 1
          ? Effect.succeed(id)
          : conflictOf(database, person, id, expectedVersion).pipe(Effect.map((current) => current.id))
      )
    ),
  )

const reorderFailure = (
  database: D1Database,
  person: PersonId,
  first: TodoMove,
  second: TodoMove,
): Effect.Effect<never, TodoNotFound | TodoStoreUnavailable | TodoVersionConflict> =>
  selectTodo(database, person, first.id).pipe(
    Effect.flatMap((current) =>
      current.version === first.expectedVersion
        ? selectTodo(database, person, second.id).pipe(
          Effect.flatMap((other) =>
            Effect.fail(
              new TodoVersionConflict({
                id: other.id,
                expected: second.expectedVersion,
                actual: other.version,
              }),
            )
          ),
        )
        : Effect.fail(
          new TodoVersionConflict({
            id: current.id,
            expected: first.expectedVersion,
            actual: current.version,
          }),
        )
    ),
  )

const reorderTodos = (
  database: D1Database,
  person: PersonId,
  first: TodoMove,
  second: TodoMove,
): Effect.Effect<Todos, TodoNotFound | TodoStoreUnavailable | TodoVersionConflict> =>
  query(() =>
    database
      .prepare(
        'UPDATE todos SET position = CASE id WHEN ?2 THEN ?3 ELSE ?4 END, version = CASE id WHEN ?2 THEN ?5 ELSE ?6 END ' +
          'WHERE person = ?1 AND id IN (?2, ?7) AND (SELECT COUNT(*) FROM todos WHERE person = ?1 ' +
          'AND ((id = ?2 AND version = ?8) OR (id = ?7 AND version = ?9))) = 2',
      )
      .bind(
        person,
        first.id,
        first.position,
        second.position,
        first.version,
        second.version,
        second.id,
        first.expectedVersion,
        second.expectedVersion,
      )
      .run()
  ).pipe(
    Effect.flatMap(({ meta }) =>
      Effect.suspend(() =>
        meta.changes === 2
          ? selectTodos(database, person)
          : reorderFailure(database, person, first, second).pipe(
            Effect.flatMap((failure) => Effect.fail(failure)),
          )
      )
    ),
  )

export const layer = (database: D1Database): Layer.Layer<TodoStore> =>
  Layer.succeed(TodoStore, {
    list: (person) => selectTodos(database, person),
    todo: (person, id) => selectTodo(database, person, id),
    add: (person, todo) => insertTodo(database, person, todo),
    update: (person, todo, expectedVersion) => updateTodo(database, person, todo, expectedVersion),
    remove: (person, id, expectedVersion) => deleteTodo(database, person, id, expectedVersion),
    reorder: (person, first, second) => reorderTodos(database, person, first, second),
  })
