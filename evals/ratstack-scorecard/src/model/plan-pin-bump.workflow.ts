import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

const PinPlanTypeId: unique symbol = Symbol.for('@starter/ratstack-scorecard/PinPlan')

export class PinCurrent extends S.TaggedClass<PinCurrent>()('PinCurrent', { commit: S.String }) {
  readonly [PinPlanTypeId] = PinPlanTypeId
}

export class PinMoved extends S.TaggedClass<PinMoved>()('PinMoved', { from: S.String, to: S.String }) {
  readonly [PinPlanTypeId] = PinPlanTypeId
}

export class PlanPinBump extends S.TaggedClass<PlanPinBump>()('PlanPinBump', {
  pinned: S.String,
  remoteHead: S.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = { pinned: 'app.scorecard.plan.pin' } as const
}

const pass = (plan: PinCurrent | PinMoved): Result.Result<PinCurrent | PinMoved, never> => Result.succeed(plan)

const decide = ({ pinned, remoteHead }: PlanPinBump): Result.Result<PinCurrent | PinMoved, never> =>
  Match.value(remoteHead === pinned).pipe(
    Match.when(true, () => pass(new PinCurrent({ commit: pinned }))),
    Match.when(false, () => pass(new PinMoved({ from: pinned, to: remoteHead }))),
    Match.exhaustive,
  )

export const planPinBump = Workflow.make({
  command: PlanPinBump,
  decision: S.Union([PinCurrent, PinMoved]),
  error: S.Never,
  decide,
})
