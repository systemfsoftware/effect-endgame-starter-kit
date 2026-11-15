import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import type { RpcClientError } from 'effect/rpc'
import * as S from 'effect/Schema'

import { siteClient, SiteClientProtocol } from '../../api/site-rpc-client'
import { newCredential } from './todo-ids'
import { TodoOperations } from './todo.contract'
import type {
  TodoNotFound,
  TodoNotMovable,
  TodoRateLimited,
  TodoStoreUnavailable,
  TodoTextMissing,
  TodoTextTooLong,
  TodoVersionConflict,
} from './todo.schema'
import { TodoCredential } from './todo.schema'

export type TodoOperation = keyof typeof TodoOperations

export type TodoRequest<Name extends TodoOperation> = S.Schema.Type<(typeof TodoOperations)[Name]['request']>

export type TodoInput<Name extends TodoOperation> = Omit<TodoRequest<Name>, 'credential'>

export type TodoResponse<Name extends TodoOperation> = S.Schema.Type<(typeof TodoOperations)[Name]['response']>

export type TodoView = TodoResponse<'todo_add'>['todo']

export type TodoRefusal =
  | TodoTextMissing
  | TodoTextTooLong
  | TodoRateLimited
  | TodoNotFound
  | TodoNotMovable
  | TodoVersionConflict
  | TodoStoreUnavailable

export type TodoFailure = TodoRefusal | RpcClientError.RpcClientError

const CREDENTIAL_KEY = 'todo.credential'

const call = <A, E>(use: (client: Effect.Success<typeof siteClient>) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.scoped(Effect.flatMap(siteClient, use)).pipe(Effect.provide(SiteClientProtocol))

const refuse = <A>(failure: TodoRefusal): Effect.Effect<A, TodoFailure> => Effect.fail(failure)

const storedCredential = (): Option.Option<TodoCredential> =>
  Option.fromNullishOr(globalThis.localStorage.getItem(CREDENTIAL_KEY)).pipe(
    Option.flatMap((raw) => S.decodeOption(TodoCredential)(raw)),
  )

export const credential: Effect.Effect<TodoCredential> = Effect.suspend(() =>
  Option.match(storedCredential(), {
    onNone: () =>
      Effect.sync(() => {
        const minted = newCredential()
        globalThis.localStorage.setItem(CREDENTIAL_KEY, minted)
        return minted
      }),
    onSome: (value) => Effect.succeed(value),
  })
)

export const listTodos: Effect.Effect<TodoResponse<'todo_list'>, TodoFailure> = Effect.flatMap(
  credential,
  (value) => call((client) => client.todo_list({ credential: value })),
)

export const addTodo = (input: TodoInput<'todo_add'>): Effect.Effect<TodoView, TodoFailure> =>
  Effect.flatMap(credential, (value) =>
    call((client) => client.todo_add({ ...input, credential: value })).pipe(
      Effect.map((response) => response.todo),
      Effect.catchTags({
        TodoTextMissing: refuse<TodoView>,
        TodoTextTooLong: refuse<TodoView>,
        TodoRateLimited: refuse<TodoView>,
        TodoStoreUnavailable: refuse<TodoView>,
      }),
    ))

export const completeTodo = (input: TodoInput<'todo_complete'>): Effect.Effect<TodoView, TodoFailure> =>
  Effect.flatMap(credential, (value) =>
    call((client) => client.todo_complete({ ...input, credential: value })).pipe(
      Effect.map((response) => response.todo),
      Effect.catchTags({
        TodoNotFound: refuse<TodoView>,
        TodoVersionConflict: refuse<TodoView>,
        TodoStoreUnavailable: refuse<TodoView>,
      }),
    ))

export const renameTodo = (input: TodoInput<'todo_rename'>): Effect.Effect<TodoView, TodoFailure> =>
  Effect.flatMap(credential, (value) =>
    call((client) => client.todo_rename({ ...input, credential: value })).pipe(
      Effect.map((response) => response.todo),
      Effect.catchTags({
        TodoTextMissing: refuse<TodoView>,
        TodoTextTooLong: refuse<TodoView>,
        TodoNotFound: refuse<TodoView>,
        TodoVersionConflict: refuse<TodoView>,
        TodoStoreUnavailable: refuse<TodoView>,
      }),
    ))

export const reorderTodo = (
  input: TodoInput<'todo_reorder'>,
): Effect.Effect<TodoResponse<'todo_reorder'>['todos'], TodoFailure> =>
  Effect.flatMap(credential, (value) =>
    call((client) => client.todo_reorder({ ...input, credential: value })).pipe(
      Effect.map((response) => response.todos),
      Effect.catchTags({
        TodoNotFound: refuse<TodoResponse<'todo_reorder'>['todos']>,
        TodoNotMovable: refuse<TodoResponse<'todo_reorder'>['todos']>,
        TodoVersionConflict: refuse<TodoResponse<'todo_reorder'>['todos']>,
        TodoStoreUnavailable: refuse<TodoResponse<'todo_reorder'>['todos']>,
      }),
    ))

export const removeTodo = (input: TodoInput<'todo_remove'>): Effect.Effect<TodoView, TodoFailure> =>
  Effect.flatMap(credential, (value) =>
    call((client) => client.todo_remove({ ...input, credential: value })).pipe(
      Effect.map((response) => response.todo),
      Effect.catchTags({
        TodoNotFound: refuse<TodoView>,
        TodoVersionConflict: refuse<TodoView>,
        TodoStoreUnavailable: refuse<TodoView>,
      }),
    ))
