import * as S from 'effect/Schema'

export const Health = S.Struct({ status: S.Literal('ok') })
export type Health = S.Schema.Type<typeof Health>
