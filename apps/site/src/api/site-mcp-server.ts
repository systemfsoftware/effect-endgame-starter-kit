import { McpProtocol, McpServer } from 'effect/ai'
import * as Effect from 'effect/Effect'
import { HttpServer } from 'effect/http'
import * as Layer from 'effect/Layer'

import { TodoHandlers, TodoTools } from '@endgame/site/todo'

import { todoCells } from './site-todo-cells'

export const SITE_MCP_PATH = '/mcp'

const TodoRegistrationsLive = Layer.effectDiscard(
  Effect.gen(function*() {
    const cells = yield* todoCells
    const handlers = TodoHandlers(cells)
    yield* Layer.build(McpServer.toolkit(TodoTools).pipe(Layer.provide(TodoTools.toLayer(handlers))))
  }),
)

export const SiteMcpLive = McpServer.layerHttpRequestScoped({
  name: 'todo-app',
  version: '1.0.0',
  path: SITE_MCP_PATH,
  protocols: [McpProtocol.v2026_07_28],
  registrations: TodoRegistrationsLive,
}).pipe(Layer.provideMerge(HttpServer.layerServices))
