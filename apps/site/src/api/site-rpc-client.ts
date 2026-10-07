import * as Effect from 'effect/Effect'
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http'
import * as Layer from 'effect/Layer'
import { RpcClient, RpcSerialization } from 'effect/rpc'

import { SITE_RPC_PATH, SiteRpcs } from './site-rpcs'

export const siteClient = RpcClient.make(SiteRpcs)

export const SiteClientProtocol = Layer.effect(RpcClient.Protocol)(
  Effect.flatMap(
    HttpClient.HttpClient,
    (client) => RpcClient.makeProtocolHttp(HttpClient.mapRequest(client, HttpClientRequest.setUrl(SITE_RPC_PATH))),
  ),
).pipe(
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer),
)
