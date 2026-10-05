import { Context, Effect } from 'effect'
import { HttpEffect, HttpServerRequest } from 'effect/http'

import { HtmlPort } from './front-door/html-port.service'
import { servePageCell } from './front-door/serve-page.cell'

export { HtmlPort } from './front-door/html-port.service'

const ServerRequest = HttpServerRequest.HttpServerRequest

export const frontDoor = Effect.flatMap(ServerRequest, (request) => servePageCell.run(request))

export const frontDoorHandlerWith = (context: Context.Context<HtmlPort>) =>
  HttpEffect.toWebHandler(frontDoor.pipe(Effect.provideContext(context)))
