import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main>
      <h1>Endgame Starter</h1>
      <p>One Cloudflare Worker, built the systemfsoftware way.</p>
    </main>
  )
}
