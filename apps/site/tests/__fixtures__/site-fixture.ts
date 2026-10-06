import { Effect, Function } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'
import type { HttpClientError } from 'effect/http/HttpClientError'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { homeOpeningOf } from '../../readme-opening-plugin.ts'
import { WorkerdWorker } from './miniflare-worker.layer.ts'

export interface PageResponse {
  readonly status: number
  readonly contentType: string | null
  readonly vary: string | null
  readonly body: string
  readonly logs: ReadonlyArray<string>
}

export type PageEffect = Effect.Effect<PageResponse, HttpClientError, HttpClient.HttpClient | WorkerdWorker>
export type PageRequest = (path: string, accept?: string) => PageEffect

export const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'

const readme = (): string => readFileSync(fileURLToPath(new URL('../../../../README.md', import.meta.url)), 'utf8')

export const readmeOpening = (): string => homeOpeningOf(readme())

export const readmeHeading = (): string =>
  (readmeOpening().split('\n').find((line) => line.startsWith('# ')) ?? '').replace(/^#\s+/, '')

const pageRequest: PageRequest = (path, accept) =>
  Effect.gen(function*() {
    const worker = yield* WorkerdWorker
    const client = yield* HttpClient.HttpClient
    const base = HttpClientRequest.get(`${worker.origin}${path}`)
    const request = accept === undefined ? base : HttpClientRequest.setHeader(base, 'accept', accept)
    const response = yield* client.execute(request)
    return {
      status: response.status,
      contentType: response.headers['content-type'] ?? null,
      vary: response.headers['vary'] ?? null,
      body: yield* Effect.orDie(response.text),
      logs: yield* worker.logs,
    }
  })

export const fetchPage = Function.dual<
  (accept?: string) => (path: string) => PageEffect,
  PageRequest
>(2, pageRequest)
