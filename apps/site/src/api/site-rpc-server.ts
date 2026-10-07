import { env } from 'cloudflare:workers'
import * as Effect from 'effect/Effect'
import { HttpServer } from 'effect/http'
import * as Layer from 'effect/Layer'
import { RpcSerialization, RpcServer } from 'effect/rpc'

import type { Health } from './health.schema'
import { SITE_RPC_PATH, SiteRpcs } from './site-rpcs'

const healthy: Health = { status: 'ok' }

const HealthHandlers = SiteRpcs.toLayer({
  health: () => Effect.promise(() => env.DB.prepare('SELECT 1').first()).pipe(Effect.as(healthy)),
})

export const SiteRpcLive = RpcServer.layerHttp({ group: SiteRpcs, path: SITE_RPC_PATH, protocol: 'http' }).pipe(
  Layer.provide(HealthHandlers),
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(HttpServer.layerServices),
)
