import { Context, Effect } from 'effect'

import type { CspNonce } from './content-security-policy.schema'

export class HtmlPort extends Context.Service<HtmlPort, {
  readonly render: (request: Request, nonce: CspNonce) => Effect.Effect<Response>
}>()('HtmlPort') {}
