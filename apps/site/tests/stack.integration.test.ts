import { NodeFileSystem } from '@effect/platform-node'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, FileSystem } from 'effect'

const Feature = makeFeature({ it })

const importStack = () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const alchemyDir = new URL('../.alchemy', import.meta.url).pathname
    yield* Effect.ignore(fs.remove(alchemyDir, { recursive: true, force: true }))
    const calls: Array<Parameters<typeof fetch>> = []
    const original = globalThis.fetch
    globalThis.fetch = (...args: Parameters<typeof fetch>) => {
      calls.push(args)
      return Promise.reject(new Error('network disabled'))
    }
    try {
      const stack = yield* Effect.promise(() => import('../alchemy.run.ts'))
      const alchemy = yield* Effect.orDie(fs.exists(alchemyDir))
      return { calls: calls.length, alchemy, hasDefault: Object.keys(stack).includes('default') }
    } finally {
      globalThis.fetch = original
    }
  })

Feature('Importing the stack')
  .withLayer(NodeFileSystem.layer)
  .live('importing the stack module and reading the filesystem are real Node I/O')
  .body(({ scenario }) => {
    scenario(
      'Importing the stack deploys nothing',
      Gherkin.Do.pipe(
        When('the stack module is imported with no credentials')('result', () => importStack()),
        Then('no request was made and no state was written')((s, expect) =>
          expect(s.result).toEqual({ calls: 0, alchemy: false, hasDefault: true })
        ),
      ),
    )
  })
