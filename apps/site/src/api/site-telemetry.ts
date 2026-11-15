import { FetchHttpClient } from 'effect/http'
import * as Layer from 'effect/Layer'
import * as Otlp from 'effect/observability/Otlp'

export const SITE_SERVICE_NAME = 'endgame-site'

const isConfigured = (endpoint: string): boolean => endpoint !== ''

export const telemetryLayer = (endpoint: string): Layer.Layer<never> =>
  isConfigured(endpoint)
    ? Otlp.layerJson({
      baseUrl: endpoint,
      resource: { serviceName: SITE_SERVICE_NAME },
    }).pipe(Layer.provide(FetchHttpClient.layer))
    : Layer.empty
