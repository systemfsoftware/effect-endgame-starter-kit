import * as S from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

export const Uuid = S.String.pipe(S.check(S.isUUID(4)))
export type Uuid = S.Schema.Type<typeof Uuid>

export const TodoCredential = S.String.pipe(S.check(S.isMinLength(43), S.isMaxLength(43)))
export type TodoCredential = S.Schema.Type<typeof TodoCredential>

export const PersonId = S.String.pipe(S.check(S.isMinLength(64), S.isMaxLength(64)), S.brand('PersonId'))
export type PersonId = S.Schema.Type<typeof PersonId>

export const TodoText = S.Trimmed.pipe(S.check(S.isMinLength(1), S.isMaxLength(280)), S.brand('TodoText'))
export type TodoText = S.Schema.Type<typeof TodoText>

export const TodoTextValue = S.Trimmed.pipe(S.check(S.isMinLength(1), S.isMaxLength(280)))
export type TodoTextValue = S.Schema.Type<typeof TodoTextValue>

export const Todo = S.Struct({
  id: Uuid,
  text: TodoTextValue,
  done: S.Boolean,
  position: S.Int,
  version: S.Int,
  createdAt: S.Int,
})
export type Todo = S.Schema.Type<typeof Todo>

export const Todos = S.Array(Todo)
export type Todos = S.Schema.Type<typeof Todos>

export const TodoMove = S.Struct({
  id: Uuid,
  position: S.Int,
  version: S.Int,
  expectedVersion: S.Int,
})
export type TodoMove = S.Schema.Type<typeof TodoMove>

export const Done = S.Literals([0, 1]).pipe(
  S.decodeTo(S.Boolean, {
    decode: SchemaGetter.transform<boolean, 0 | 1>((value) => value === 1),
    encode: SchemaGetter.transform<0 | 1, boolean>((value) => (value ? 1 : 0)),
  }),
)

export const TodoRow = S.Struct({
  id: Uuid,
  text: S.String,
  done: Done,
  position: S.Int,
  version: S.Int,
  createdAt: S.Int,
})

export const TodoDirection = S.Literals(['up', 'down'])
export type TodoDirection = S.Schema.Type<typeof TodoDirection>

export class TodoNotFound extends S.TaggedError<TodoNotFound, { readonly brand: unique symbol }>()('TodoNotFound', {
  id: S.String,
}) {
  override get message(): string {
    return `There is no todo ${this.id}.`
  }
}

export class TodoVersionConflict
  extends S.TaggedError<TodoVersionConflict, { readonly brand: unique symbol }>()('TodoVersionConflict', {
    id: S.String,
    expected: S.Int,
    actual: S.Int,
  })
{
  override get message(): string {
    return `Todo ${this.id} changed after you read it (you saw version ${this.expected}, it is now ${this.actual}); reload and try again.`
  }
}

export class TodoNotMovable
  extends S.TaggedError<TodoNotMovable, { readonly brand: unique symbol }>()('TodoNotMovable', {
    id: S.String,
    edge: S.Literals(['top', 'bottom']),
  })
{
  override get message(): string {
    return `Todo ${this.id} is already at the ${this.edge} of the list.`
  }
}

export class TodoTextMissing
  extends S.TaggedError<TodoTextMissing, { readonly brand: unique symbol }>()('TodoTextMissing', {})
{
  override get message(): string {
    return 'Write what the todo is.'
  }
}

export class TodoTextTooLong
  extends S.TaggedError<TodoTextTooLong, { readonly brand: unique symbol }>()('TodoTextTooLong', {})
{
  override get message(): string {
    return 'That todo is too long.'
  }
}

export class TodoRateLimited
  extends S.TaggedError<TodoRateLimited, { readonly brand: unique symbol }>()('TodoRateLimited', {
    limit: S.Int,
  })
{
  override get message(): string {
    return `You can add ${this.limit} todos a minute; wait a moment and try again.`
  }
}

export class TodoStoreUnavailable extends S.TaggedError<TodoStoreUnavailable, { readonly brand: unique symbol }>()(
  'TodoStoreUnavailable',
  { detail: S.String },
) {
  override get message(): string {
    return `The todo store is unavailable: ${this.detail}`
  }
}

export class TodosRead
  extends S.TaggedClass<TodosRead, { readonly brand: unique symbol }>()('TodosRead', { todos: Todos })
{}

export class TodoFound
  extends S.TaggedClass<TodoFound, { readonly brand: unique symbol }>()('TodoFound', { todo: Todo })
{}

export class TodoMissing
  extends S.TaggedClass<TodoMissing, { readonly brand: unique symbol }>()('TodoMissing', { id: S.String })
{}

export class TodoStoreFailed
  extends S.TaggedClass<TodoStoreFailed, { readonly brand: unique symbol }>()('TodoStoreFailed', { detail: S.String })
{}

export const ListTodosRequest = S.Struct({ credential: TodoCredential })
export const ListTodosResponse = S.Array(Todo)
export const ListTodosRefusal = TodoStoreUnavailable
export type ListTodosRefusal = S.Schema.Type<typeof ListTodosRefusal>

export const AddTodoRequest = S.Struct({ credential: TodoCredential, text: S.String })
export const AddTodoResponse = S.Struct({ todo: Todo })
export const AddTodoRefusal = S.Union([TodoTextMissing, TodoTextTooLong, TodoRateLimited, TodoStoreUnavailable])
export type AddTodoRefusal = S.Schema.Type<typeof AddTodoRefusal>

export const CompleteTodoRequest = S.Struct({ credential: TodoCredential, id: Uuid, version: S.Int, done: S.Boolean })
export const CompleteTodoResponse = S.Struct({ todo: Todo })
export const CompleteTodoRefusal = S.Union([TodoNotFound, TodoVersionConflict, TodoStoreUnavailable])
export type CompleteTodoRefusal = S.Schema.Type<typeof CompleteTodoRefusal>

export const RenameTodoRequest = S.Struct({ credential: TodoCredential, id: Uuid, version: S.Int, text: S.String })
export const RenameTodoResponse = S.Struct({ todo: Todo })
export const RenameTodoRefusal = S.Union([
  TodoTextMissing,
  TodoTextTooLong,
  TodoNotFound,
  TodoVersionConflict,
  TodoStoreUnavailable,
])
export type RenameTodoRefusal = S.Schema.Type<typeof RenameTodoRefusal>

export const ReorderTodoRequest = S.Struct({
  credential: TodoCredential,
  id: Uuid,
  version: S.Int,
  direction: TodoDirection,
})
export const ReorderTodoResponse = S.Struct({ todos: Todos })
export const ReorderTodoRefusal = S.Union([TodoNotFound, TodoVersionConflict, TodoNotMovable, TodoStoreUnavailable])
export type ReorderTodoRefusal = S.Schema.Type<typeof ReorderTodoRefusal>

export const RemoveTodoRequest = S.Struct({ credential: TodoCredential, id: Uuid, version: S.Int })
export const RemoveTodoResponse = S.Struct({ todo: Todo })
export const RemoveTodoRefusal = S.Union([TodoNotFound, TodoVersionConflict, TodoStoreUnavailable])
export type RemoveTodoRefusal = S.Schema.Type<typeof RemoveTodoRefusal>
