import type { Direction } from './cell.ts'
import { matchDirection } from './dispatch.ts'

export const smallerIsBetter = (direction: Direction, runs: readonly number[]): readonly number[] =>
  runs.map((value) => value * matchDirection(direction, { lower: () => 1, higher: () => -1 }))

export const median = (runs: readonly number[]): number => {
  const sorted = [...runs].sort((a, b) => a - b)
  const lower = Math.ceil(sorted.length / 2) - 1
  const upper = Math.floor(sorted.length / 2)
  return sorted.slice(lower, upper + 1).reduce((sum, value) => sum + value, 0) / (upper - lower + 1)
}
