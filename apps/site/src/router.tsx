import { createRouter, type Router } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'

import type { CspNonce } from './front-door/content-security-policy.schema'
import { routeTree } from './routeTree.gen'

export type AppRouter = Router<typeof routeTree>

const requestNonceOf = (): CspNonce | undefined => getGlobalStartContext()?.nonce

export const getRouter = (): AppRouter => {
  const nonce = requestNonceOf()
  return createRouter({
    routeTree,
    scrollRestoration: true,
    ...(nonce === undefined ? {} : { ssr: { nonce } }),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
    server: { requestContext: { readonly nonce: CspNonce } }
  }
}
