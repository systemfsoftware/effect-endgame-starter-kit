import startHandler from '@tanstack/react-start/server-entry'
import { Context, Effect } from 'effect'

import { frontDoorHandlerWith, HtmlPort } from './mod'

export default {
  fetch(request: Request): Promise<Response> {
    const context = Context.make(HtmlPort, {
      render: (web: Request) => Effect.promise(() => Promise.resolve(startHandler.fetch(web))),
    })
    return frontDoorHandlerWith(context)(request)
  },
}
