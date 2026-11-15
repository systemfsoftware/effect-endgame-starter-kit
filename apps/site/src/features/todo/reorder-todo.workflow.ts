import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  PersonId,
  ReorderTodoRefusal,
  Todo,
  TodoDirection,
  TodoMove,
  TodoNotFound,
  TodoNotMovable,
  Todos,
  TodosRead,
  TodoStoreFailed,
  TodoStoreUnavailable,
  TodoVersionConflict,
  Uuid,
} from './todo.schema.ts'

const ReorderTodoTypeId: unique symbol = Symbol.for('site/ReorderTodo')

export class ReorderTodo extends S.Class<ReorderTodo, { readonly brand: unique symbol }>('ReorderTodo')({
  person: PersonId,
  id: Uuid,
  version: S.Int,
  direction: TodoDirection,
  probe: S.Union([TodosRead, TodoStoreFailed]),
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

export class TodoReordered extends S.TaggedClass<TodoReordered, { readonly brand: unique symbol }>()('TodoReordered', {
  first: TodoMove,
  second: TodoMove,
}) {
  readonly [ReorderTodoTypeId] = ReorderTodoTypeId
}

const neighbourIndex = (index: number, direction: TodoDirection): number =>
  Match.value(direction).pipe(
    Match.when('up', () => index - 1),
    Match.when('down', () => index + 1),
    Match.exhaustive,
  )

const edgeOf = (direction: TodoDirection): 'top' | 'bottom' =>
  Match.value(direction).pipe(
    Match.when('up', (): 'top' => 'top'),
    Match.when('down', (): 'bottom' => 'bottom'),
    Match.exhaustive,
  )

const movesOf = (todo: Todo, neighbour: Todo): { readonly first: TodoMove; readonly second: TodoMove } => ({
  first: {
    id: todo.id,
    position: neighbour.position,
    version: todo.version + 1,
    expectedVersion: todo.version,
  },
  second: {
    id: neighbour.id,
    position: todo.position,
    version: neighbour.version + 1,
    expectedVersion: neighbour.version,
  },
})

const swappedOf = (
  command: ReorderTodo,
  todo: Todo,
  index: number,
  todos: Todos,
): Result.Result<TodoReordered, TodoNotMovable> =>
  Match.value(Option.fromNullishOr(todos[neighbourIndex(index, command.direction)])).pipe(
    Match.tag('None', () => Result.fail(new TodoNotMovable({ id: todo.id, edge: edgeOf(command.direction) }))),
    Match.tag('Some', (some) => Result.succeed(new TodoReordered(movesOf(todo, some.value)))),
    Match.exhaustive,
  )

const reorderedOf = (
  command: ReorderTodo,
  todos: Todos,
): Result.Result<TodoReordered, TodoNotFound | TodoVersionConflict | TodoNotMovable> =>
  Match.value(Option.fromNullishOr(todos.find((candidate) => candidate.id === command.id))).pipe(
    Match.tag('None', () => Result.fail(new TodoNotFound({ id: command.id }))),
    Match.tag('Some', (some) => {
      const todo = some.value
      const index = todos.findIndex((candidate) => candidate.id === todo.id)
      return Match.value(todo.version === command.version).pipe(
        Match.when(
          false,
          () =>
            Result.fail(
              new TodoVersionConflict({
                id: todo.id,
                expected: command.version,
                actual: todo.version,
              }),
            ),
        ),
        Match.when(true, () => swappedOf(command, todo, index, todos)),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )

export const reorderTodo = Workflow.make({
  command: ReorderTodo,
  decision: TodoReordered,
  error: ReorderTodoRefusal,
  decide: (command) =>
    Match.value(command.probe).pipe(
      Match.tag('TodosRead', (read) => reorderedOf(command, read.todos)),
      Match.tag('TodoStoreFailed', (failure) => Result.fail(new TodoStoreUnavailable({ detail: failure.detail }))),
      Match.exhaustive,
    ),
})
