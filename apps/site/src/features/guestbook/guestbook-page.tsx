import * as Effect from 'effect/Effect'
import { type SubmitEvent, useEffect, useState } from 'react'

import { siteClient, SiteClientProtocol } from '../../api/site-rpc-client'
import type { GuestbookEntries } from './guestbook.schema'
import { SignGuestbook } from './sign-guestbook.workflow'

interface GuestbookView {
  readonly entries: GuestbookEntries
  readonly notice: string
}

const UNAVAILABLE = 'The guestbook is unavailable right now.'

const loading: GuestbookView = { entries: [], notice: '' }

const latestEntries: Effect.Effect<GuestbookView> = Effect.scoped(
  Effect.flatMap(siteClient, (client) => client.list()),
).pipe(
  Effect.map((entries): GuestbookView => ({ entries, notice: '' })),
  Effect.catchCause(() => Effect.succeed<GuestbookView>({ entries: [], notice: UNAVAILABLE })),
  Effect.provide(SiteClientProtocol),
)

const signEntry = (command: SignGuestbook): Effect.Effect<string> =>
  Effect.scoped(Effect.flatMap(siteClient, (client) => client.sign(command))).pipe(
    Effect.as(''),
    Effect.catchTags({
      NameMissing: (refusal) => Effect.succeed(refusal.message),
      NameTooLong: (refusal) => Effect.succeed(refusal.message),
      MessageMissing: (refusal) => Effect.succeed(refusal.message),
      MessageTooLong: (refusal) => Effect.succeed(refusal.message),
    }),
    Effect.catchCause(() => Effect.succeed(UNAVAILABLE)),
    Effect.provide(SiteClientProtocol),
  )

export function GuestbookPage() {
  const [view, setView] = useState(loading)
  const [ready, setReady] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void Effect.runPromise(latestEntries).then((loaded) => {
      setView(loaded)
      setReady(true)
    })
  }, [])

  const sign = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    void Effect.runPromise(signEntry(new SignGuestbook({ name, message }))).then((notice) =>
      notice === ''
        ? Effect.runPromise(latestEntries).then((loaded) => {
          setView(loaded)
          setMessage('')
        })
        : setView({ entries: view.entries, notice })
    )
  }

  return (
    <main>
      <h1>Guestbook</h1>
      <form onSubmit={sign}>
        <label>
          Name <input name='name' value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Message <textarea name='message' value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <button type='submit' disabled={!ready}>Sign the guestbook</button>
      </form>
      <p role='alert'>{view.notice}</p>
      <ol aria-label='Entries'>
        {view.entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.guest}</strong> {entry.message}
          </li>
        ))}
      </ol>
    </main>
  )
}
