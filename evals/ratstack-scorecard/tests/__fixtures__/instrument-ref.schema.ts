import { Schema } from 'effect'

export const InstrumentRefSelection = Schema.Struct({
  code: Schema.Finite,
  stdout: Schema.String,
  stderr: Schema.String,
  base: Schema.String,
  head: Schema.String,
  graded: Schema.NullOr(Schema.String),
})

export const InstrumentRefJson = Schema.fromJsonString(InstrumentRefSelection)

export type InstrumentRefSelection = typeof InstrumentRefSelection.Type
