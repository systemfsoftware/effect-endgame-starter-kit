import { FetchHttpClient } from 'effect/http'
import * as Layer from 'effect/Layer'
import { RpcClient, RpcSerialization } from 'effect/rpc'

import { SITE_RPC_PATH, SiteRpcs } from './site-rpcs'

export const siteClient = RpcClient.make(SiteRpcs)

export const SiteClientProtocol = RpcClient.layerProtocolHttp({ url: SITE_RPC_PATH }).pipe(
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer),
)
