import { Schema } from 'effect'

const Cell = Schema.Union([
  Schema.TaggedStruct('Measured', { runs: Schema.Array(Schema.Finite) }),
  Schema.TaggedStruct('InstrumentError', { error: Schema.String }),
])
export type Cell = typeof Cell.Type

export const Family = Schema.Struct({
  family: Schema.Literal('static'),
  cells: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      side: Schema.Literals(['ratstack', 'starter']),
      measured: Schema.Struct({ cell: Cell }),
    }),
  ),
})

export type Family = typeof Family.Type
