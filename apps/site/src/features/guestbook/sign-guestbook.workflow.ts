import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'

import { GuestMessage, GuestName } from './guestbook.schema.ts'

const SignGuestbookTypeId: unique symbol = Symbol()

export class SignGuestbook extends S.Class<SignGuestbook>('SignGuestbook')({
  name: S.String,
  message: S.String,
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

export class EntryAccepted extends S.TaggedClass<EntryAccepted>()('EntryAccepted', {
  guest: GuestName,
  message: GuestMessage,
}) {
  readonly [SignGuestbookTypeId] = SignGuestbookTypeId
}

export class NameMissing extends S.TaggedError<NameMissing>()('NameMissing', {}) {
  override get message(): string {
    return 'Write your name.'
  }
}

export class NameTooLong extends S.TaggedError<NameTooLong>()('NameTooLong', {}) {
  override get message(): string {
    return 'Your name is too long for the guestbook.'
  }
}

export class MessageMissing extends S.TaggedError<MessageMissing>()('MessageMissing', {}) {
  override get message(): string {
    return 'Write a message.'
  }
}

export class MessageTooLong extends S.TaggedError<MessageTooLong>()('MessageTooLong', {}) {
  override get message(): string {
    return 'Your message is too long for the guestbook.'
  }
}

export const SignGuestbookRefusal = S.Union([NameMissing, NameTooLong, MessageMissing, MessageTooLong])
export type SignGuestbookRefusal = S.Schema.Type<typeof SignGuestbookRefusal>

const guestNameOf = (raw: string): Result.Result<GuestName, NameMissing | NameTooLong> => {
  const name = Str.trim(raw)
  return Match.value(Str.isEmpty(name)).pipe(
    Match.when(true, () => Result.fail(new NameMissing({}))),
    Match.when(false, () => Result.mapError(S.decodeResult(GuestName)(name), () => new NameTooLong({}))),
    Match.exhaustive,
  )
}

const guestMessageOf = (raw: string): Result.Result<GuestMessage, MessageMissing | MessageTooLong> => {
  const message = Str.trim(raw)
  return Match.value(Str.isEmpty(message)).pipe(
    Match.when(true, () => Result.fail(new MessageMissing({}))),
    Match.when(false, () => Result.mapError(S.decodeResult(GuestMessage)(message), () => new MessageTooLong({}))),
    Match.exhaustive,
  )
}

export const signGuestbook = Workflow.make({
  command: SignGuestbook,
  decision: EntryAccepted,
  error: SignGuestbookRefusal,
  decide: (command) =>
    Result.gen(function*() {
      const guest = yield* guestNameOf(command.name)
      const message = yield* guestMessageOf(command.message)
      return new EntryAccepted({ guest, message })
    }),
})
