import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  PersonId,
  RemoveTodoRefusal,
  Todo,
  TodoFound,
  TodoMissing,
  TodoNotFound,
  TodoStoreFailed,
  TodoStoreUnavailable,
  TodoVersionConflict,
  Uuid,
} from './todo.schema.ts'

const RemoveTodoTypeId: unique symbol = Symbol.for('site/RemoveTodo')

export class RemoveTodo extends S.Class<RemoveTodo, { readonly brand: unique symbol }>('RemoveTodo')({
  person: PersonId,
  id: Uuid,
  version: S.Int,
  probe: S.Union([TodoFound, TodoMissing, TodoStoreFailed]),
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

export class TodoRemoved extends S.TaggedClass<TodoRemoved, { readonly brand: unique symbol }>()('TodoRemoved', {
  todo: Todo,
}) {
  readonly [RemoveTodoTypeId] = RemoveTodoTypeId
}

const removedOf = (command: RemoveTodo, todo: Todo): Result.Result<TodoRemoved, TodoVersionConflict> =>
  Match.value(todo.version === command.version).pipe(
    Match.when(true, () => Result.succeed(new TodoRemoved({ todo }))),
    Match.when(
      false,
      () => Result.fail(new TodoVersionConflict({ id: todo.id, expected: command.version, actual: todo.version })),
    ),
    Match.exhaustive,
  )

export const removeTodo = Workflow.make({
  command: RemoveTodo,
  decision: TodoRemoved,
  error: RemoveTodoRefusal,
  decide: (command) =>
    Match.value(command.probe).pipe(
      Match.tag('TodoFound', (found) => removedOf(command, found.todo)),
      Match.tag('TodoMissing', (missing) => Result.fail(new TodoNotFound({ id: missing.id }))),
      Match.tag('TodoStoreFailed', (failure) => Result.fail(new TodoStoreUnavailable({ detail: failure.detail }))),
      Match.exhaustive,
    ),
})
