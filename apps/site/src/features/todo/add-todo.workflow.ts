import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

import {
  AddTodoRefusal,
  PersonId,
  Todo,
  TodoRateLimited,
  Todos,
  TodosRead,
  TodoStoreFailed,
  TodoStoreUnavailable,
  TodoText,
  TodoTextMissing,
  TodoTextTooLong,
  Uuid,
} from './todo.schema.ts'

const AddTodoTypeId: unique symbol = Symbol.for('site/AddTodo')

const CREATES_PER_MINUTE = 30
const CREATES_WINDOW_MS = 60_000

export class AddTodo extends S.Class<AddTodo, { readonly brand: unique symbol }>('AddTodo')({
  person: PersonId,
  text: S.String,
  id: Uuid,
  now: S.Int,
  probe: S.Union([TodosRead, TodoStoreFailed]),
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

export class TodoAdded extends S.TaggedClass<TodoAdded, { readonly brand: unique symbol }>()('TodoAdded', {
  todo: Todo,
}) {
  readonly [AddTodoTypeId] = AddTodoTypeId
}

const textOf = (raw: string): Result.Result<TodoText, TodoTextMissing | TodoTextTooLong> => {
  const text = Str.trim(raw)
  return Match.value(Str.isEmpty(text)).pipe(
    Match.when(true, () => Result.fail(new TodoTextMissing({}))),
    Match.when(false, () => Result.mapError(S.decodeResult(TodoText)(text), () => new TodoTextTooLong({}))),
    Match.exhaustive,
  )
}

const rateLimitOf = (creates: number): Result.Result<number, TodoRateLimited> =>
  Match.value(creates >= CREATES_PER_MINUTE).pipe(
    Match.when(true, () => Result.fail(new TodoRateLimited({ limit: CREATES_PER_MINUTE }))),
    Match.when(false, () => Result.succeed(creates)),
    Match.exhaustive,
  )

const nextPosition = (todos: Todos): number => todos.reduce((highest, todo) => Num.max(highest, todo.position), -1) + 1

const addedOf = (
  command: AddTodo,
  todos: Todos,
): Result.Result<TodoAdded, TodoTextMissing | TodoTextTooLong | TodoRateLimited> =>
  Result.gen(function*() {
    const text = yield* textOf(command.text)
    const creates = todos.filter((todo) => command.now - todo.createdAt < CREATES_WINDOW_MS).length
    yield* rateLimitOf(creates)
    const todo: Todo = {
      id: command.id,
      text,
      done: false,
      position: nextPosition(todos),
      version: 1,
      createdAt: command.now,
    }
    return new TodoAdded({ todo })
  })

export const addTodo = Workflow.make({
  command: AddTodo,
  decision: TodoAdded,
  error: AddTodoRefusal,
  decide: (command) =>
    Match.value(command.probe).pipe(
      Match.tag('TodosRead', (read) => addedOf(command, read.todos)),
      Match.tag('TodoStoreFailed', (failure) => Result.fail(new TodoStoreUnavailable({ detail: failure.detail }))),
      Match.exhaustive,
    ),
})
