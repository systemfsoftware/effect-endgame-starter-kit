import * as Effect from 'effect/Effect'
import { HttpServer } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import * as Layer from 'effect/Layer'

import type { Health } from './health.schema'
import { SiteApi } from './site-api'

const healthy: Health = { status: 'ok' }

const HealthHandlers = HttpApiBuilder.group(
  SiteApi,
  'health',
  (handlers) => handlers.handle('health', () => Effect.succeed(healthy)),
)

export const SiteApiLive = HttpApiBuilder.layer(SiteApi, { openapiPath: '/api/openapi.json' }).pipe(
  Layer.provide(HealthHandlers),
  Layer.provide(HttpServer.layerServices),
)
