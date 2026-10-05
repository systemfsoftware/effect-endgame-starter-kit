import { describe, it } from '@systemfsoftware/vitest'
import * as Result from 'effect/Result'
import type { Route } from '../serve-page.schema'
import { MediaPreference } from '../serve-page.schema'
import { servePage, ServePageCommand } from '../serve-page.workflow'

interface Preference {
  readonly pattern: string
  readonly q: number
}

const qFor = (preferences: ReadonlyArray<Preference>, pattern: string): number | undefined => {
  for (const preference of preferences) if (preference.pattern === pattern) return preference.q
  return undefined
}

const effectiveQ = (preferences: ReadonlyArray<Preference>, media: string): number => {
  const [major = ''] = media.split('/')
  const exact = qFor(preferences, media)
  if (exact !== undefined) return exact
  const partial = qFor(preferences, `${major}/*`)
  if (partial !== undefined) return partial
  const wildcard = qFor(preferences, '*/*')
  if (wildcard !== undefined) return wildcard
  return 0
}

const htmlWins = (preferences: ReadonlyArray<Preference>): boolean =>
  effectiveQ(preferences, 'text/html') > effectiveQ(preferences, 'text/markdown')

const expectsHtml = (route: Route, preferences: ReadonlyArray<Preference>): boolean =>
  route === 'llms_txt' ? false : htmlWins(preferences)

const referenceTag = (route: Route, preferences: ReadonlyArray<Preference>): string => {
  if (route === 'llms_txt') return 'ServeLlmsTxt'
  if (route === 'home') return expectsHtml(route, preferences) ? 'ServeHtmlPage' : 'ServeMarkdownPage'
  return expectsHtml(route, preferences) ? 'ServeHtmlPage' : 'ServeMarkdownNotFound'
}

const observedTag = (result: ReturnType<typeof servePage>): string =>
  Result.match(result, { onFailure: () => 'failed', onSuccess: (decision) => decision._tag })

describe('servePage — Accept negotiation', () => {
  it.prop(
    '∀c_Tag_=Reference',
    { of: [ServePageCommand], subject: servePage },
    (subject, [command]) => observedTag(subject(command)) === referenceTag(command.path, command.accept),
  )

  it.prop(
    '∀c_HtmlQ0_≠ServeHtmlPage',
    { of: [ServePageCommand], subject: servePage },
    (subject, [command]) => {
      const withoutHtml = command.accept.filter((preference) => preference.pattern !== 'text/html')
      const zeroed = ServePageCommand.make({
        path: command.path,
        accept: [...withoutHtml, MediaPreference.make({ pattern: 'text/html', q: 0 })],
        origin: command.origin,
      })
      return observedTag(subject(zeroed)) !== 'ServeHtmlPage'
    },
  )
})
