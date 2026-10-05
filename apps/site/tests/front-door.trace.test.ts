import { NodeFileSystem } from '@effect/platform-node'
import { frontDoorHandlerWith, frontDoorTaxonomy, HtmlPort, ServePage } from '@endgame/site'
import { Contract, ObservationWindow, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { it } from '@systemfsoftware/vitest'
import { Context, Effect, Layer } from 'effect'

interface FrontDoorRequest {
  readonly path: string
  readonly accept?: string | undefined
}

const frontDoorStimulus = Stimulus.make<FrontDoorRequest, void, never, HtmlPort>({
  name: 'site.front_door',
  run: ({ input, traceparent }) =>
    Effect.gen(function*() {
      const port = yield* HtmlPort
      const context = yield* Effect.context<HtmlPort>()
      const handler = frontDoorHandlerWith(Context.make(HtmlPort, port))
      yield* Effect.promise(() =>
        handler(
          new Request(`https://site.example${input.path}`, {
            headers: input.accept === undefined ? { traceparent } : { traceparent, accept: input.accept },
          }),
          context,
        )
      )
    }),
})

const contractFor = (
  route: 'home' | 'llms_txt' | 'unknown',
  decision: 'ServeMarkdownPage' | 'ServeLlmsTxt' | 'ServeMarkdownNotFound',
) =>
  Contract.of(frontDoorTaxonomy).pipe(
    Contract.stimulate(frontDoorStimulus),
    Contract.holds(
      Rel.all(
        Rel.exists(ServePage),
        Rel.attrs(ServePage, { 'app.front_door.route': route }),
        Rel.forall(
          ServePage,
          (node) => node.attrs['app.front_door.serve_page.decision'] === decision,
          `the ${ServePage.name} span records the ${decision} decision`,
        ),
        Rel.forall(
          ServePage,
          (node) => node.parentSpanId !== null,
          `the ${ServePage.name} span is parented under the request span that continues the contract traceparent`,
        ),
      ),
    ),
  )

const HtmlPortFails = Layer.succeed(HtmlPort, {
  render: () => Effect.die(new Error('the HTML port must not be reached by a trace scenario')),
})

const harness = Layer.mergeAll(
  ObservationWindow.make('endgame-site').layer,
  NodeFileSystem.layer,
  HtmlPortFails,
)

Suite.make({ it })('front door span graph')
  .withScenarioLayer(harness)
  .live('the failure dump writes the decoded graph through the real Node file system')
  .body(({ Case }) => {
    Case('a request with no Accept header serves the Markdown home page', contractFor('home', 'ServeMarkdownPage'), {
      path: '/',
    })
    Case('a request for llms.txt serves the llms text page', contractFor('llms_txt', 'ServeLlmsTxt'), {
      path: '/llms.txt',
    })
    Case(
      'a request for an unknown path serves the Markdown not-found page',
      contractFor('unknown', 'ServeMarkdownNotFound'),
      { path: '/not-a-page' },
    )
  })
