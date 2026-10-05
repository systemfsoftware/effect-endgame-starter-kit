import { Context, Effect } from 'effect'

export class HtmlPort extends Context.Service<HtmlPort, {
  readonly render: (request: Request) => Effect.Effect<Response>
}>()('HtmlPort') {}
