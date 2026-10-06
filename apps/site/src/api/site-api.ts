import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

import { Health } from './health.schema'

export const SiteApi = HttpApi.make('site').add(
  HttpApiGroup.make('health').add(HttpApiEndpoint.get('health', '/api/health', { success: Health })),
)
