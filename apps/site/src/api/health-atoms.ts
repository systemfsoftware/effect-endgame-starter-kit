import { Atom } from '@systemfsoftware/effect-atom'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { RpcClient } from 'effect/rpc'

import { siteClient } from './site-rpc-client'

export const siteRpcLayerAtom = Atom.make(
  Layer.effect(RpcClient.Protocol)(Effect.die('no site RPC layer was provided')),
)

export const siteRuntime = Atom.context()((get) => get(siteRpcLayerAtom))

const checkWorker = Effect.flatMap(siteClient, (client) => client.health())

export const workerHealth = Atom.withServerValueInitial(siteRuntime.atom(checkWorker))

export const healthStatusOf = (result: Atom.Type<typeof workerHealth>): string =>
  Atom.AsyncResult.match(result, {
    onInitial: () => 'checking',
    onFailure: () => 'unreachable',
    onSuccess: ({ value }) => (Context.isContext(value) ? 'checking' : value.status),
  })

export const workerHealthStatus = Atom.withServerValue(
  Atom.map(workerHealth, healthStatusOf),
  () => healthStatusOf(Atom.AsyncResult.initial(true)),
)
