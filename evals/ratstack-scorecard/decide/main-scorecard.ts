import { Effect, Option } from 'effect'

export interface WorkflowRun {
  readonly id: number
  readonly head_sha: string
}

export interface MainBaseline {
  readonly run: WorkflowRun
  readonly text: string
}

export const mainBaselineOf = <E, R>(
  runs: readonly WorkflowRun[],
  documentOf: (run: WorkflowRun) => Effect.Effect<string, E, R>,
): Effect.Effect<Option.Option<MainBaseline>, E, R> =>
  Option.match(Option.fromUndefinedOr(runs[0]), {
    onNone: () => Effect.succeed(Option.none()),
    onSome: (run) => Effect.map(documentOf(run), (text): Option.Option<MainBaseline> => Option.some({ run, text })),
  })
