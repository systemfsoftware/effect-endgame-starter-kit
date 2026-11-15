import { Cell } from '@systemfsoftware/effect-cell-types'
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

export interface TodoCells {
  readonly todo_list: Cell.Cell<
    S.Schema.Type<typeof ListTodosRequest>,
    S.Schema.Type<typeof ListTodosResponse>,
    S.Schema.Type<typeof ListTodosRefusal>
  >
  readonly todo_add: Cell.Cell<
    S.Schema.Type<typeof AddTodoRequest>,
    S.Schema.Type<typeof AddTodoResponse>,
    S.Schema.Type<typeof AddTodoRefusal>
  >
  readonly todo_complete: Cell.Cell<
    S.Schema.Type<typeof CompleteTodoRequest>,
    S.Schema.Type<typeof CompleteTodoResponse>,
    S.Schema.Type<typeof CompleteTodoRefusal>
  >
  readonly todo_rename: Cell.Cell<
    S.Schema.Type<typeof RenameTodoRequest>,
    S.Schema.Type<typeof RenameTodoResponse>,
    S.Schema.Type<typeof RenameTodoRefusal>
  >
  readonly todo_reorder: Cell.Cell<
    S.Schema.Type<typeof ReorderTodoRequest>,
    S.Schema.Type<typeof ReorderTodoResponse>,
    S.Schema.Type<typeof ReorderTodoRefusal>
  >
  readonly todo_remove: Cell.Cell<
    S.Schema.Type<typeof RemoveTodoRequest>,
    S.Schema.Type<typeof RemoveTodoResponse>,
    S.Schema.Type<typeof RemoveTodoRefusal>
  >
}

export const TodoHandlers = (cells: TodoCells) => ({
  todo_list: (request: S.Schema.Type<typeof ListTodosRequest>) => cells.todo_list.run(request),
  todo_add: (request: S.Schema.Type<typeof AddTodoRequest>) => cells.todo_add.run(request),
  todo_complete: (request: S.Schema.Type<typeof CompleteTodoRequest>) => cells.todo_complete.run(request),
  todo_rename: (request: S.Schema.Type<typeof RenameTodoRequest>) => cells.todo_rename.run(request),
  todo_reorder: (request: S.Schema.Type<typeof ReorderTodoRequest>) => cells.todo_reorder.run(request),
  todo_remove: (request: S.Schema.Type<typeof RemoveTodoRequest>) => cells.todo_remove.run(request),
})
