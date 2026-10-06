import { Match } from 'effect'
import type { Cell, Side } from '../src/model/cell.ts'

export interface CacheCell {
  readonly id: string
  readonly side: Side
  readonly measured: { readonly cell: Cell }
}

const isInstrumentError = (cell: Cell): boolean =>
  Match.value(cell).pipe(Match.tag('InstrumentError', () => true), Match.orElse(() => false))

export const cacheRefusal = (cells: readonly CacheCell[]): string | undefined => {
  const broken = cells.filter((cell) => cell.side === 'ratstack' && isInstrumentError(cell.measured.cell))
  return broken.length === 0
    ? undefined
    : `rat-stack instrument errors on ${broken.map((cell) => cell.id).join(', ')}`
}
