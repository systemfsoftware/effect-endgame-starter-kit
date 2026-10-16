import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

import { SiteDatabase } from '../site-database.service'
import { checkHealth, DatabaseUnreachable, ProbeAnswered, ProbeUnanswered } from './check-health.workflow'
import type { Health } from './health.schema'

const healthy: Health = { status: 'ok' }

const probeDatabase = Effect.flatMap(
  SiteDatabase,
  (database) => Effect.tryPromise(() => database.prepare('SELECT 1').first()),
).pipe(
  Effect.match({ onSuccess: () => new ProbeAnswered({}), onFailure: () => new ProbeUnanswered({}) }),
)

export const checkHealthCell = Sandwich.named('site.health')(() => Effect.map(probeDatabase, (probe) => ({ probe })))
  .decide(checkHealth)
  .write({
    Healthy: () => Effect.succeed(healthy),
    DatabaseUnreachable: () => Effect.fail(new DatabaseUnreachable({})),
    CommandRejected: ({ issue }) => Effect.die(new Error(issue)),
  })
