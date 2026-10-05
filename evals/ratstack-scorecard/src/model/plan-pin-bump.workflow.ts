import { firstRule } from './dispatch.ts'

export interface PlanPinBumpInput {
  readonly pinned: string
  readonly remoteHead: string
}

export type PinPlan =
  | { readonly _tag: 'PinCurrent'; readonly commit: string }
  | { readonly _tag: 'PinMoved'; readonly from: string; readonly to: string }

export const planPinBump = (input: PlanPinBumpInput): PinPlan =>
  firstRule<PinPlan>(
    [[input.remoteHead === input.pinned, () => ({ _tag: 'PinCurrent', commit: input.pinned })]],
    () => ({ _tag: 'PinMoved', from: input.pinned, to: input.remoteHead }),
  )
