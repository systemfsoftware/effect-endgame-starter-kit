import { createFileRoute } from '@tanstack/react-router'

import { GuestbookPage } from '../features/guestbook/guestbook-page'

export const Route = createFileRoute('/guestbook')({ component: GuestbookPage })
