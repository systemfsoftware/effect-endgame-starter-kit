import { AtomReact } from '@systemfsoftware/effect-atom-react'
import type { SubmitEvent } from 'react'

import {
  guestbookNotice,
  guestbookReady,
  listedEntries,
  moderateGuestbookEntry,
  moderationInFlight,
  signDraft,
  signGuestbookEntry,
  statusLabelOf,
} from './guestbook-atoms'

export function GuestbookPage() {
  const [draft, writeDraft] = AtomReact.useAtom(signDraft)
  const entries = AtomReact.useAtomValue(listedEntries)
  const ready = AtomReact.useAtomValue(guestbookReady)
  const notice = AtomReact.useAtomValue(guestbookNotice)
  const busy = AtomReact.useAtomValue(moderationInFlight)
  const sign = AtomReact.useAtomSet(signGuestbookEntry)
  const moderate = AtomReact.useAtomSet(moderateGuestbookEntry)

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    sign(draft)
  }

  return (
    <main>
      <h1>Guestbook</h1>
      <form onSubmit={submit}>
        <label>
          Name{' '}
          <input
            name='name'
            value={draft.name}
            onChange={(event) => writeDraft({ name: event.target.value, message: draft.message })}
          />
        </label>
        <label>
          Message{' '}
          <textarea
            name='message'
            value={draft.message}
            onChange={(event) => writeDraft({ name: draft.name, message: event.target.value })}
          />
        </label>
        <button type='submit' disabled={!ready || busy}>Sign the guestbook</button>
      </form>
      <p role='alert'>{notice}</p>
      <ol aria-label='Entries'>
        {entries.map((entry) => {
          const statusLabel = statusLabelOf(entry)
          return (
            <li key={entry.id}>
              <span>
                <strong>{entry.guest}</strong> {entry.message}
              </span>
              {statusLabel === null ? null : <span>{statusLabel}</span>}
              <button type='button' disabled={busy} onClick={() => moderate({ id: entry.id, event: 'Flag' })}>
                Flag {entry.guest}'s entry
              </button>
              <button type='button' disabled={busy} onClick={() => moderate({ id: entry.id, event: 'Vouch' })}>
                Vouch for {entry.guest}'s entry
              </button>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
