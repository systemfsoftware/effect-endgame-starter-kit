import { fc, test } from '@fast-check/vitest'
import { Match, Result } from 'effect'
import { type PinCurrent, type PinMoved, PlanPinBump, planPinBump } from '../plan-pin-bump.workflow.ts'
import { sha } from '../scorecard.arbitrary.ts'

const otherThan = (commit: string, index: number): string => {
  const at = index % commit.length
  const replacement = commit[at] === 'a' ? 'b' : 'a'
  return `${commit.slice(0, at)}${replacement}${commit.slice(at + 1)}`
}

const plan = (pinned: string, remoteHead: string): PinCurrent | PinMoved =>
  Result.getOrThrow(planPinBump(new PlanPinBump({ pinned, remoteHead })))

const isCurrent = (planned: PinCurrent | PinMoved): boolean =>
  Match.value(planned).pipe(
    Match.tag('PinCurrent', () => true),
    Match.tag('PinMoved', () => false),
    Match.exhaustive,
  )

const movedFromTo = (planned: PinCurrent | PinMoved, from: string, to: string): boolean =>
  Match.value(planned).pipe(
    Match.tag('PinMoved', (moved) => moved.from === from && moved.to === to),
    Match.tag('PinCurrent', () => false),
    Match.exhaustive,
  )

test.prop([sha])('a remote head equal to the pin plans nothing', (commit) => isCurrent(plan(commit, commit)))

test.prop([sha, fc.nat()])('any other remote head plans a bump to exactly that commit', (pinned, index) => {
  const remoteHead = otherThan(pinned, index)
  return movedFromTo(plan(pinned, remoteHead), pinned, remoteHead)
})
