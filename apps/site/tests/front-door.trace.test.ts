import { NodeFileSystem } from '@effect/platform-node'
import { frontDoorHandlerWith, frontDoorTaxonomy, HtmlPort, RecordCspViolation, ServePage } from '@endgame/site'
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

interface ReportRequest {
  readonly body: string
}

const reportStimulus = Stimulus.make<ReportRequest, void, never, HtmlPort>({
  name: 'site.csp_report',
  run: ({ input, traceparent }) =>
    Effect.gen(function*() {
      const port = yield* HtmlPort
      const context = yield* Effect.context<HtmlPort>()
      const handler = frontDoorHandlerWith(Context.make(HtmlPort, port))
      yield* Effect.promise(() =>
        handler(
          new Request('https://site.example/csp-report', {
            method: 'POST',
            headers: { 'content-type': 'application/csp-report', traceparent },
            body: input.body,
          }),
          context,
        )
      )
    }),
})

const legacyReport = (directive: string, blockedUri: string): string =>
  JSON.stringify({ 'csp-report': { 'effective-directive': directive, 'blocked-uri': blockedUri } })

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
        Rel.fromTaxonomy(frontDoorTaxonomy, { path: 'serve-page' }),
      ),
    ),
  )

interface ReportCase {
  readonly directive: string
  readonly blockedUri: string
  readonly decision: 'RecordBlockedOrigin' | 'RecordBlockedKeyword' | 'RecordBlockedUnrecognized'
  readonly blocked: string | undefined
}

const reportContract = ({ directive, decision, blocked }: ReportCase) =>
  Contract.of(frontDoorTaxonomy).pipe(
    Contract.stimulate(reportStimulus),
    Contract.holds(
      Rel.all(
        Rel.exists(RecordCspViolation),
        Rel.attrs(RecordCspViolation, { 'app.csp.directive': directive }),
        Rel.forall(
          RecordCspViolation,
          (node) => node.attrs['app.front_door.record_csp_violation.decision'] === decision,
          `the ${RecordCspViolation.name} span records the ${decision} decision`,
        ),
        Rel.forall(
          RecordCspViolation,
          (node) => node.attrs['app.csp.blocked'] === blocked,
          `the ${RecordCspViolation.name} span records blocked '${blocked ?? 'nothing'}'`,
        ),
        Rel.fromTaxonomy(frontDoorTaxonomy, { path: 'csp-report' }),
      ),
    ),
  )

const originCase: ReportCase = {
  directive: 'script-src',
  blockedUri: 'https://evil.example/path?q=1',
  decision: 'RecordBlockedOrigin',
  blocked: 'https://evil.example',
}

const opaqueSchemeCase: ReportCase = {
  directive: 'img-src',
  blockedUri: 'data:text/html,blocked',
  decision: 'RecordBlockedKeyword',
  blocked: 'data',
}

const unknownOpaqueSchemeCase: ReportCase = {
  directive: 'script-src',
  blockedUri: 'web+evil:foo',
  decision: 'RecordBlockedKeyword',
  blocked: 'other',
}

const keywordCase: ReportCase = {
  directive: 'style-src',
  blockedUri: 'inline',
  decision: 'RecordBlockedKeyword',
  blocked: 'inline',
}

const unrecognizedCase: ReportCase = {
  directive: 'script-src',
  blockedUri: '  Inline  ',
  decision: 'RecordBlockedUnrecognized',
  blocked: undefined,
}

const HtmlPortFails = Layer.succeed(HtmlPort, {
  render: () => Effect.die(new Error('the HTML port must not be reached by a trace scenario')),
})

const harness = Layer.mergeAll(
  ObservationWindow.make('endgame-site').layer,
  NodeFileSystem.layer,
  HtmlPortFails,
)

const reportInput = (spec: ReportCase): ReportRequest => ({ body: legacyReport(spec.directive, spec.blockedUri) })

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
    Case(
      'a posted report of a blocked origin records the origin without its path or query',
      reportContract(originCase),
      reportInput(originCase),
    )
    Case(
      'a posted report of an opaque scheme records the scheme keyword',
      reportContract(opaqueSchemeCase),
      reportInput(opaqueSchemeCase),
    )
    Case(
      'a posted report of an unknown opaque scheme records the bounded keyword other',
      reportContract(unknownOpaqueSchemeCase),
      reportInput(unknownOpaqueSchemeCase),
    )
    Case(
      'a posted report of an inline token records the keyword',
      reportContract(keywordCase),
      reportInput(keywordCase),
    )
    Case(
      'a posted report of an unrecognized token records no blocked value',
      reportContract(unrecognizedCase),
      reportInput(unrecognizedCase),
    )
  })
