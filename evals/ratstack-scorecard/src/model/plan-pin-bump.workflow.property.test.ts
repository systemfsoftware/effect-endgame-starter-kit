import { fc, test } from '@fast-check/vitest'
import { describe } from 'vitest'
import { planPinBump } from './plan-pin-bump.workflow.ts'
import { sha } from './scorecard.arbitrary.ts'

const otherThan = (commit: string, index: number): string => {
  const at = index % commit.length
  const replacement = commit[at] === 'a' ? 'b' : 'a'
  return `${commit.slice(0, at)}${replacement}${commit.slice(at + 1)}`
}

describe('planPinBump', () => {
  test.prop([sha])(
    'a remote head equal to the pin plans nothing',
    (commit) => planPinBump({ pinned: commit, remoteHead: commit })._tag === 'PinCurrent',
  )

  test.prop([sha, fc.nat()])('any other remote head plans a bump to exactly that commit', (pinned, index) => {
    const remoteHead = otherThan(pinned, index)
    const plan = planPinBump({ pinned, remoteHead })
    return plan._tag === 'PinMoved' && plan.to === remoteHead && plan.from === pinned
  })
})
