import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  CompleteTodoRefusal,
  PersonId,
  Todo,
  TodoFound,
  TodoMissing,
  TodoNotFound,
  TodoStoreFailed,
  TodoStoreUnavailable,
  TodoVersionConflict,
  Uuid,
} from './todo.schema.ts'

const CompleteTodoTypeId: unique symbol = Symbol.for('site/CompleteTodo')

export class CompleteTodo extends S.Class<CompleteTodo, { readonly brand: unique symbol }>('CompleteTodo')({
  person: PersonId,
  id: Uuid,
  version: S.Int,
  done: S.Boolean,
  probe: S.Union([TodoFound, TodoMissing, TodoStoreFailed]),
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

export class TodoCompleted extends S.TaggedClass<TodoCompleted, { readonly brand: unique symbol }>()('TodoCompleted', {
  todo: Todo,
}) {
  readonly [CompleteTodoTypeId] = CompleteTodoTypeId
}

const completedOf = (command: CompleteTodo, todo: Todo): Result.Result<TodoCompleted, TodoVersionConflict> =>
  Match.value(todo.version === command.version).pipe(
    Match.when(
      true,
      () =>
        Result.succeed(
          new TodoCompleted({
            todo: {
              id: todo.id,
              text: todo.text,
              done: command.done,
              position: todo.position,
              version: todo.version + 1,
              createdAt: todo.createdAt,
            },
          }),
        ),
    ),
    Match.when(
      false,
      () => Result.fail(new TodoVersionConflict({ id: todo.id, expected: command.version, actual: todo.version })),
    ),
    Match.exhaustive,
  )

export const completeTodo = Workflow.make({
  command: CompleteTodo,
  decision: TodoCompleted,
  error: CompleteTodoRefusal,
  decide: (command) =>
    Match.value(command.probe).pipe(
      Match.tag('TodoFound', (found) => completedOf(command, found.todo)),
      Match.tag('TodoMissing', (missing) => Result.fail(new TodoNotFound({ id: missing.id }))),
      Match.tag('TodoStoreFailed', (failure) => Result.fail(new TodoStoreUnavailable({ detail: failure.detail }))),
      Match.exhaustive,
    ),
})
