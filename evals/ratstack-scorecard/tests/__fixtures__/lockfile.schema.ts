import { Schema } from 'effect'

export const LockfileDocuments = Schema.Struct({
  documents: Schema.Array(
    Schema.Struct({
      lockfileVersion: Schema.String,
      packages: Schema.Array(Schema.String),
    }),
  ),
})

export type LockfileDocuments = typeof LockfileDocuments.Type
