import { describe, it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { GuestMessage, GuestName } from '../guestbook.schema.ts'
import {
  type EntryAccepted,
  MessageMissing,
  MessageTooLong,
  NameMissing,
  NameTooLong,
  SignGuestbook,
  signGuestbook,
  type SignGuestbookRefusal,
} from '../sign-guestbook.workflow.ts'

const NAME_CAP = 40
const MESSAGE_CAP = 280

const ONLY_WHITESPACE = /^\s*$/
const ONE_NON_WHITESPACE_CODE_UNIT = /^\S$/

type Signed = Result.Result<EntryAccepted, SignGuestbookRefusal>

const acceptedAs = (signed: Signed, guest: string, message: string): boolean =>
  Result.match(signed, {
    onSuccess: (entry) => entry.guest === guest && entry.message === message,
    onFailure: () => false,
  })

const refusedAs = (signed: Signed, isRefusal: (refused: SignGuestbookRefusal) => boolean): boolean =>
  Result.match(signed, {
    onSuccess: () => false,
    onFailure: (refused) => isRefusal(refused) && refused.message !== '',
  })

describe('signGuestbook — an entry is accepted trimmed, or refused for its first fault', () => {
  it.prop(
    '∀d_AcceptedEntry_=DomainValuesUnpadded',
    {
      of: {
        name: GuestName,
        message: GuestMessage,
        lead: S.String.check(S.isPattern(ONLY_WHITESPACE)),
        trail: S.String.check(S.isPattern(ONLY_WHITESPACE)),
      },
      subject: signGuestbook,
    },
    (subject, { name, message, lead, trail }) =>
      acceptedAs(
        subject(new SignGuestbook({ name: `${lead}${name}${trail}`, message: `${lead}${message}${trail}` })),
        name,
        message,
      ),
  )

  it.prop(
    '∀d_Refusal_=NameMissingForBlankName',
    { of: { blank: S.String.check(S.isPattern(ONLY_WHITESPACE)), message: S.String }, subject: signGuestbook },
    (subject, { blank, message }) => refusedAs(subject(new SignGuestbook({ name: blank, message })), S.is(NameMissing)),
  )

  it.prop(
    '∀d_Refusal_=MessageMissingForBlankMessage',
    { of: { name: GuestName, blank: S.String.check(S.isPattern(ONLY_WHITESPACE)) }, subject: signGuestbook },
    (subject, { name, blank }) => refusedAs(subject(new SignGuestbook({ name, message: blank })), S.is(MessageMissing)),
  )

  it.prop(
    '∀d_Outcome_=NameTooLongOnlyPastTheCap',
    {
      of: {
        glyph: S.String.check(S.isPattern(ONE_NON_WHITESPACE_CODE_UNIT)),
        pastTheCap: S.Boolean,
        message: GuestMessage,
      },
      subject: signGuestbook,
    },
    (subject, { glyph, pastTheCap, message }) => {
      const name = glyph.repeat(NAME_CAP + Number(pastTheCap))
      const signed = subject(new SignGuestbook({ name, message }))
      return Match.value(pastTheCap).pipe(
        Match.when(true, () => refusedAs(signed, S.is(NameTooLong))),
        Match.when(false, () => acceptedAs(signed, name, message)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Outcome_=MessageTooLongOnlyPastTheCap',
    {
      of: { name: GuestName, glyph: S.String.check(S.isPattern(ONE_NON_WHITESPACE_CODE_UNIT)), pastTheCap: S.Boolean },
      subject: signGuestbook,
    },
    (subject, { name, glyph, pastTheCap }) => {
      const message = glyph.repeat(MESSAGE_CAP + Number(pastTheCap))
      const signed = subject(new SignGuestbook({ name, message }))
      return Match.value(pastTheCap).pipe(
        Match.when(true, () => refusedAs(signed, S.is(MessageTooLong))),
        Match.when(false, () => acceptedAs(signed, name, message)),
        Match.exhaustive,
      )
    },
  )
})
