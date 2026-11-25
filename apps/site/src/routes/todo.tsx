import { createFileRoute } from '@tanstack/react-router'

import { TodoPage } from '../features/todo/todo-page'

export const Route = createFileRoute('/todo')({
  component: TodoPage,
  head: () => ({
    links: [{ rel: 'stylesheet', href: '/todo.css' }],
    meta: [{ title: 'Todos' }],
  }),
})
