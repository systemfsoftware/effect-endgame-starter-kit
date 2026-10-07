import { env } from 'cloudflare:workers'
import * as Effect from 'effect/Effect'
import { HttpServer } from 'effect/http'
import * as Layer from 'effect/Layer'
import { RpcSerialization, RpcServer } from 'effect/rpc'

import { GuestbookHandlers } from '../features/guestbook/guestbook-handlers'
import { CheckHealth, checkHealth, ProbeAnswered, ProbeUnanswered } from './check-health.workflow'
import type { Health } from './health.schema'
import { HealthRpcs, SITE_RPC_PATH, SiteRpcs } from './site-rpcs'

const healthy: Health = { status: 'ok' }

const probeDatabase = Effect.tryPromise(() => env.DB.prepare('SELECT 1').first()).pipe(
  Effect.match({ onSuccess: () => new ProbeAnswered({}), onFailure: () => new ProbeUnanswered({}) }),
)

const HealthHandlers = HealthRpcs.toLayer({
  health: () =>
    probeDatabase.pipe(
      Effect.flatMap((probe) => Effect.fromResult(checkHealth(new CheckHealth({ probe })))),
      Effect.as(healthy),
    ),
})

export const SiteRpcLive = RpcServer.layerHttp({ group: SiteRpcs, path: SITE_RPC_PATH, protocol: 'http' }).pipe(
  Layer.provide(HealthHandlers),
  Layer.provide(GuestbookHandlers),
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(HttpServer.layerServices),
)
