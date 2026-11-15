import { Tool, Toolkit } from 'effect/ai'
import { Rpc, RpcGroup } from 'effect/rpc'
import * as S from 'effect/Schema'

import {
  AddTodoRefusal,
  AddTodoRequest,
  AddTodoResponse,
  CompleteTodoRefusal,
  CompleteTodoRequest,
  CompleteTodoResponse,
  ListTodosRefusal,
  ListTodosRequest,
  ListTodosResponse,
  RemoveTodoRefusal,
  RemoveTodoRequest,
  RemoveTodoResponse,
  RenameTodoRefusal,
  RenameTodoRequest,
  RenameTodoResponse,
  ReorderTodoRefusal,
  ReorderTodoRequest,
  ReorderTodoResponse,
} from './todo.schema'

const operation = <
  const Name extends string,
  Request extends S.Top,
  Response extends S.Top,
  Refusal extends S.Top,
>(
  name: Name,
  schemas: { readonly request: Request; readonly response: Response; readonly refusal: Refusal },
) => ({
  name,
  request: schemas.request,
  response: schemas.response,
  refusal: schemas.refusal,
  rpc: Rpc.make(name, { payload: schemas.request, success: schemas.response, error: schemas.refusal }),
  tool: Tool.make(name, { parameters: schemas.request, success: schemas.response, failure: schemas.refusal }),
})

export const TodoOperations = {
  todo_list: operation('todo_list', {
    request: ListTodosRequest,
    response: ListTodosResponse,
    refusal: ListTodosRefusal,
  }),
  todo_add: operation('todo_add', {
    request: AddTodoRequest,
    response: AddTodoResponse,
    refusal: AddTodoRefusal,
  }),
  todo_complete: operation('todo_complete', {
    request: CompleteTodoRequest,
    response: CompleteTodoResponse,
    refusal: CompleteTodoRefusal,
  }),
  todo_rename: operation('todo_rename', {
    request: RenameTodoRequest,
    response: RenameTodoResponse,
    refusal: RenameTodoRefusal,
  }),
  todo_reorder: operation('todo_reorder', {
    request: ReorderTodoRequest,
    response: ReorderTodoResponse,
    refusal: ReorderTodoRefusal,
  }),
  todo_remove: operation('todo_remove', {
    request: RemoveTodoRequest,
    response: RemoveTodoResponse,
    refusal: RemoveTodoRefusal,
  }),
}

export const TodoRpcs = RpcGroup.make(...Object.values(TodoOperations).map((declared) => declared.rpc))

export const TodoTools = Toolkit.make(...Object.values(TodoOperations).map((declared) => declared.tool))
