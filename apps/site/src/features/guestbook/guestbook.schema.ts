import * as S from 'effect/Schema'

export const GuestName = S.Trimmed.pipe(S.check(S.isMinLength(1), S.isMaxLength(40)), S.brand('GuestName'))
export type GuestName = S.Schema.Type<typeof GuestName>

export const GuestMessage = S.Trimmed.pipe(S.check(S.isMinLength(1), S.isMaxLength(280)), S.brand('GuestMessage'))
export type GuestMessage = S.Schema.Type<typeof GuestMessage>

export const EntryId = S.Int.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
  S.brand('EntryId'),
)
export type EntryId = S.Schema.Type<typeof EntryId>

export const GuestbookEntry = S.Struct({ id: EntryId, guest: GuestName, message: GuestMessage })
export type GuestbookEntry = S.Schema.Type<typeof GuestbookEntry>

export const GuestbookEntries = S.Array(GuestbookEntry)
export type GuestbookEntries = S.Schema.Type<typeof GuestbookEntries>

export class GuestbookUnavailable extends S.TaggedError<GuestbookUnavailable>()('GuestbookUnavailable', {
  detail: S.String,
}) {
  override get message(): string {
    return `The guestbook's database failed: ${this.detail}`
  }
}

export class GuestbookRowInvalid extends S.TaggedError<GuestbookRowInvalid>()('GuestbookRowInvalid', {
  detail: S.String,
}) {
  override get message(): string {
    return `A guestbook row did not decode: ${this.detail}`
  }
}
