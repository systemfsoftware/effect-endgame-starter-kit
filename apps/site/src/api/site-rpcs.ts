import { Rpc, RpcGroup } from 'effect/rpc'

import { GuestbookRpcs } from '../features/guestbook/guestbook-rpcs'
import { DatabaseUnreachable } from './check-health.workflow'
import { Health } from './health.schema'

export const SITE_RPC_PATH = '/api/rpc'

export const HealthRpcs = RpcGroup.make(Rpc.make('health', { success: Health, error: DatabaseUnreachable }))

export const SiteRpcs = HealthRpcs.merge(GuestbookRpcs)
