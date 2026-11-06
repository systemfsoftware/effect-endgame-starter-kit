import { Cell } from '@systemfsoftware/effect-cell-types'
import { env } from 'cloudflare:workers'
import * as Effect from 'effect/Effect'
import { HttpServer } from 'effect/http'
import * as Layer from 'effect/Layer'
import { RpcSerialization, RpcServer } from 'effect/rpc'

import * as D1GuestbookStore from '../features/guestbook/d1-guestbook-store'
import { GuestbookHandlers } from '../features/guestbook/guestbook-handlers'
import { listGuestbookEntriesCell } from '../features/guestbook/list-guestbook-entries.cell'
import { moderateGuestbookEntryCell } from '../features/guestbook/moderate-guestbook-entry.cell'
import { signGuestbookCell } from '../features/guestbook/sign-guestbook.cell'
import { SiteDatabase } from '../site-database.service'
import { checkHealthCell } from './check-health.cell'
import { SITE_RPC_PATH, SiteRpcs } from './site-rpcs'

const SiteDatabaseLive = Layer.succeed(SiteDatabase, env.DB)

const GuestbookStoreLive = D1GuestbookStore.layer(env.DB)

const SiteHandlers = SiteRpcs.toLayer(
  Effect.gen(function*() {
    const context = yield* Layer.build(Layer.mergeAll(SiteDatabaseLive, GuestbookStoreLive))
    const health = Cell.provideContext(checkHealthCell, context)
    const guestbook = GuestbookHandlers({
      sign: Cell.provideContext(signGuestbookCell, context),
      list: Cell.provideContext(listGuestbookEntriesCell, context),
      moderate: Cell.provideContext(moderateGuestbookEntryCell, context),
    })
    return { health: () => health.run(undefined), ...guestbook }
  }),
)

export const SiteRpcLive = RpcServer.layerHttp({ group: SiteRpcs, path: SITE_RPC_PATH, protocol: 'http' }).pipe(
  Layer.provide(SiteHandlers),
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(HttpServer.layerServices),
)
