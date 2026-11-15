import { env } from 'cloudflare:workers'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { todoCellsOf, TodoHandlers } from '@endgame/site/todo'

import * as D1TodoStore from '../features/todo/d1-todo-store'

export const TodoStoreLive = D1TodoStore.layer(env.TODO_DB)

export const TodoContextLive = Layer.mergeAll(TodoStoreLive)

export const todoCells = Effect.gen(function*() {
  const context = yield* Layer.build(TodoContextLive)
  return todoCellsOf(context)
})

export const todoHandlers = Effect.gen(function*() {
  const cells = yield* todoCells
  return TodoHandlers(cells)
})
