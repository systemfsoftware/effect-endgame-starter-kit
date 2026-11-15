import { Cell } from '@systemfsoftware/effect-cell-types'
import type * as Context from 'effect/Context'

import { addTodoCell } from './add-todo.cell.ts'
import { completeTodoCell } from './complete-todo.cell.ts'
import { listTodosCell } from './list-todos.cell.ts'
import { removeTodoCell } from './remove-todo.cell.ts'
import { renameTodoCell } from './rename-todo.cell.ts'
import { reorderTodoCell } from './reorder-todo.cell.ts'
import { type TodoCells } from './todo-handlers.ts'
import { TodoStore } from './todo-store.service.ts'

export const todoCellsOf = (context: Context.Context<TodoStore>): TodoCells => ({
  todo_list: Cell.provideContext(listTodosCell, context),
  todo_add: Cell.provideContext(addTodoCell, context),
  todo_complete: Cell.provideContext(completeTodoCell, context),
  todo_rename: Cell.provideContext(renameTodoCell, context),
  todo_reorder: Cell.provideContext(reorderTodoCell, context),
  todo_remove: Cell.provideContext(removeTodoCell, context),
})
