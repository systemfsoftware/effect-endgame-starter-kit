import { createFileRoute } from '@tanstack/react-router'
import ReadmeOpening from 'virtual:readme-opening'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main>
      <ReadmeOpening />
    </main>
  )
}
