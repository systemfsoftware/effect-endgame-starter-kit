import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

import {
  PersonId,
  RenameTodoRefusal,
  Todo,
  TodoFound,
  TodoMissing,
  TodoNotFound,
  TodoStoreFailed,
  TodoStoreUnavailable,
  TodoText,
  TodoTextMissing,
  TodoTextTooLong,
  TodoVersionConflict,
  Uuid,
} from './todo.schema.ts'

const RenameTodoTypeId: unique symbol = Symbol.for('site/RenameTodo')

export class RenameTodo extends S.Class<RenameTodo, { readonly brand: unique symbol }>('RenameTodo')({
  person: PersonId,
  id: Uuid,
  version: S.Int,
  text: S.String,
  probe: S.Union([TodoFound, TodoMissing, TodoStoreFailed]),
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

export class TodoRenamed extends S.TaggedClass<TodoRenamed, { readonly brand: unique symbol }>()('TodoRenamed', {
  todo: Todo,
}) {
  readonly [RenameTodoTypeId] = RenameTodoTypeId
}

const textOf = (raw: string): Result.Result<TodoText, TodoTextMissing | TodoTextTooLong> => {
  const text = Str.trim(raw)
  return Match.value(Str.isEmpty(text)).pipe(
    Match.when(true, () => Result.fail(new TodoTextMissing({}))),
    Match.when(false, () => Result.mapError(S.decodeResult(TodoText)(text), () => new TodoTextTooLong({}))),
    Match.exhaustive,
  )
}

const renamedOf = (
  command: RenameTodo,
  todo: Todo,
): Result.Result<TodoRenamed, TodoTextMissing | TodoTextTooLong | TodoVersionConflict> =>
  Result.gen(function*() {
    const version = yield* Match.value(todo.version === command.version).pipe(
      Match.when(true, () => Result.succeed(todo.version)),
      Match.when(
        false,
        () => Result.fail(new TodoVersionConflict({ id: todo.id, expected: command.version, actual: todo.version })),
      ),
      Match.exhaustive,
    )
    const text = yield* textOf(command.text)
    return new TodoRenamed({
      todo: {
        id: todo.id,
        text,
        done: todo.done,
        position: todo.position,
        version: version + 1,
        createdAt: todo.createdAt,
      },
    })
  })

export const renameTodo = Workflow.make({
  command: RenameTodo,
  decision: TodoRenamed,
  error: RenameTodoRefusal,
  decide: (command) =>
    Match.value(command.probe).pipe(
      Match.tag('TodoFound', (found) => renamedOf(command, found.todo)),
      Match.tag('TodoMissing', (missing) => Result.fail(new TodoNotFound({ id: missing.id }))),
      Match.tag('TodoStoreFailed', (failure) => Result.fail(new TodoStoreUnavailable({ detail: failure.detail }))),
      Match.exhaustive,
    ),
})
