import { createFileRoute } from '@tanstack/react-router'
import * as Effect from 'effect/Effect'
import { useEffect, useState } from 'react'

import { siteClient, SiteClientProtocol } from '../api/site-rpc-client'

export const Route = createFileRoute('/')({ component: Home })

const workerHealth = Effect.scoped(Effect.flatMap(siteClient, (client) => client.Health())).pipe(
  Effect.map((health) => health.status),
  Effect.catchCause(() => Effect.succeed('unreachable')),
  Effect.provide(SiteClientProtocol),
)

function Home() {
  const [health, setHealth] = useState('checking')

  useEffect(() => {
    void Effect.runPromise(workerHealth).then(setHealth)
  }, [])

  return (
    <main>
      <h1>Endgame Starter</h1>
      <p>One Cloudflare Worker, built the systemfsoftware way.</p>
      <p role='status'>Worker health: {health}</p>
    </main>
  )
}
