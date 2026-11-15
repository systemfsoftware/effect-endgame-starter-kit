import { Config, ConfigProvider, Effect, Layer, Option } from 'effect'
import * as McpClient from 'effect/ai/McpClient'
import * as McpProtocol from 'effect/ai/McpProtocol'
import { FetchHttpClient } from 'effect/http'
import * as S from 'effect/Schema'

const siteUrl = Effect.orDie(
  Config.String('SITE_URL').pipe(
    Config.withDefault('http://localhost:1337'),
    (config) => config.parse(ConfigProvider.fromEnv()),
  ),
)

export const McpClientLive = Layer.unwrap(
  Effect.map(siteUrl, (origin) =>
    McpClient.layerHttp({
      name: 'todo-agent',
      version: '1.0.0',
      protocol: McpProtocol.v2026_07_28,
      url: `${origin}/mcp`,
    })),
).pipe(Layer.provide(FetchHttpClient.layer), Layer.orDie)

const TodoShape = S.Struct({
  id: S.String,
  text: S.String,
  done: S.Boolean,
  position: S.Int,
  version: S.Int,
  createdAt: S.Int,
})

const AddedShape = S.Struct({ todo: TodoShape })

const ListedShape = S.Array(TodoShape)

export interface ToolOutcome {
  readonly tools: ReadonlyArray<string>
  readonly added: S.Schema.Type<typeof AddedShape>
  readonly listed: S.Schema.Type<typeof ListedShape>
}

export const credential = (): string => `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().slice(0, 11)}`

const callTool = (name: string, args: { readonly credential: string; readonly text?: string }) =>
  Effect.gen(function*() {
    const client = yield* McpClient.McpClient
    const tools = yield* client.listTools()
    const tool = Option.fromNullishOr(tools.find((candidate) => candidate.name === name))
    return yield* Option.match(tool, {
      onNone: () => Effect.die(new Error(`the server does not offer ${name}`)),
      onSome: (found) => client.callTool({ tool: found, arguments: args }),
    })
  })

export const throughTheTools: Effect.Effect<ToolOutcome, never, McpClient.McpClient> = Effect.gen(function*() {
  const client = yield* McpClient.McpClient
  const tools = yield* client.listTools()
  const key = credential()
  const added = yield* callTool('todo_add', { credential: key, text: 'buy milk' })
  const listed = yield* callTool('todo_list', { credential: key })
  return {
    tools: tools.map((tool) => tool.name),
    added: yield* S.decodeUnknownEffect(AddedShape)(added.structuredContent),
    listed: yield* S.decodeUnknownEffect(ListedShape)(listed.structuredContent),
  }
}).pipe(Effect.orDie)
