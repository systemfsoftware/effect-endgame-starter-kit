import { Schema as S } from 'effect'

export class TraceNotReceived extends S.TaggedError<TraceNotReceived>()('TraceNotReceived', { spanName: S.String }) {}
