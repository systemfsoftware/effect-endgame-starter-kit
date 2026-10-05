import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const Document = (props: Readonly<{ children: ReactNode }>) => (
  <html lang='en'>
    <head>
      <HeadContent />
    </head>
    <body>
      {props.children}
      <Scripts />
    </body>
  </html>
)

export const Route = createRootRoute({
  component: () => (
    <Document>
      <Outlet />
    </Document>
  ),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { title: 'Endgame Starter' },
    ],
  }),
})
