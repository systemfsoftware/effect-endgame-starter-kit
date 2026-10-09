import * as S from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'

export const GuestName = S.Trimmed.pipe(S.check(S.isMinLength(1), S.isMaxLength(40)), S.brand('GuestName'))
export type GuestName = S.Schema.Type<typeof GuestName>

export const GuestMessage = S.Trimmed.pipe(S.check(S.isMinLength(1), S.isMaxLength(280)), S.brand('GuestMessage'))
export type GuestMessage = S.Schema.Type<typeof GuestMessage>

export const EntryId = S.Int.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
  S.brand('EntryId'),
)
export type EntryId = S.Schema.Type<typeof EntryId>

export const EntryState = S.Literals(['Visible', 'Flagged', 'Hidden'])
export type EntryState = S.Schema.Type<typeof EntryState>

export const StoredEntryState = S.String.pipe(S.decodeTo(EntryState, SchemaTransformation.passthroughSupertype()))

export const StoredStateRow = S.Struct({ state: S.String })

export const LifecycleEvent = S.Literals(['Flag', 'Vouch'])
export type LifecycleEvent = S.Schema.Type<typeof LifecycleEvent>

export const ModerationRequest = S.Struct({ id: EntryId, event: LifecycleEvent })
export type ModerationRequest = S.Schema.Type<typeof ModerationRequest>

export const GuestbookEntry = S.Struct({ id: EntryId, guest: GuestName, message: GuestMessage, state: EntryState })
export type GuestbookEntry = S.Schema.Type<typeof GuestbookEntry>

export const GuestbookEntries = S.Array(GuestbookEntry)
export type GuestbookEntries = S.Schema.Type<typeof GuestbookEntries>

export class EntryNotFound extends S.TaggedError<EntryNotFound>()('EntryNotFound', { id: EntryId }) {
  override get message(): string {
    return `There is no entry ${this.id}.`
  }
}

export class StoredStateInvalid extends S.TaggedError<StoredStateInvalid>()('StoredStateInvalid', {
  detail: S.String,
}) {
  override get message(): string {
    return `This entry's stored state is not one the lifecycle knows: ${this.detail}`
  }
}

export class TransitionConflict extends S.TaggedError<TransitionConflict>()('TransitionConflict', {
  id: EntryId,
  from: EntryState,
}) {
  override get message(): string {
    return `Entry ${this.id} changed after it was read as ${this.from}; reload and try again.`
  }
}

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
