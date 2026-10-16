import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { createFileRoute } from '@tanstack/react-router'

import { workerHealthStatus } from '../api/health-atoms'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const health = AtomReact.useAtomValue(workerHealthStatus)

  return (
    <main>
      <h1>Endgame Starter</h1>
      <p>One Cloudflare Worker, built the systemfsoftware way.</p>
      <p role='status'>Worker health: {health}</p>
    </main>
  )
}
