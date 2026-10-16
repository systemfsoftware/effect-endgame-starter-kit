import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { siteRpcLayerAtom } from '../api/health-atoms'
import { SiteClientProtocol } from '../api/site-rpc-client'

const siteRegistry = Atom.Registry.make({
  initialValues: [Atom.initialValue(siteRpcLayerAtom, SiteClientProtocol)],
  scheduleTask: AtomReact.scheduleTask,
})

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
    <AtomReact.RegistryContext.Provider value={siteRegistry}>
      <Document>
        <Outlet />
      </Document>
    </AtomReact.RegistryContext.Provider>
  ),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { title: 'Endgame Starter' },
    ],
  }),
})
