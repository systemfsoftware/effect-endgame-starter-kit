import type {
  Cell,
  CitationCheck,
  Direction,
  Flag,
  Kind,
  MainBaseline,
  Ratchet,
  RatstackSupport,
  RowOutcome,
  Verdict,
} from './cell.ts'

type ByTag<T extends { readonly _tag: string }> = { [V in T as V['_tag']]: V }
export type Cases<M, R> = { readonly [K in keyof M]: (value: M[K]) => R }

const dispatch = <M, K extends keyof M, R>(tag: K, value: M[K], cases: Cases<M, R>): R => cases[tag](value)

export const matchCell = <R>(cell: Cell, cases: Cases<ByTag<Cell>, R>): R =>
  dispatch<ByTag<Cell>, Cell['_tag'], R>(cell._tag, cell, cases)

export const matchCheck = <R>(check: CitationCheck, cases: Cases<ByTag<CitationCheck>, R>): R =>
  dispatch<ByTag<CitationCheck>, CitationCheck['_tag'], R>(check._tag, check, cases)

export const matchVerdict = <R>(verdict: Verdict, cases: Cases<ByTag<Verdict>, R>): R =>
  dispatch<ByTag<Verdict>, Verdict['_tag'], R>(verdict._tag, verdict, cases)

export const matchOutcome = <R>(outcome: RowOutcome, cases: Cases<ByTag<RowOutcome>, R>): R =>
  dispatch<ByTag<RowOutcome>, RowOutcome['_tag'], R>(outcome._tag, outcome, cases)

export const matchRatchet = <R>(ratchet: Ratchet, cases: Cases<ByTag<Ratchet>, R>): R =>
  dispatch<ByTag<Ratchet>, Ratchet['_tag'], R>(ratchet._tag, ratchet, cases)

export const matchBaseline = <R>(baseline: MainBaseline, cases: Cases<ByTag<MainBaseline>, R>): R =>
  dispatch<ByTag<MainBaseline>, MainBaseline['_tag'], R>(baseline._tag, baseline, cases)

export const matchFlag = <R>(flag: Flag, cases: Cases<ByTag<Flag>, R>): R =>
  dispatch<ByTag<Flag>, Flag['_tag'], R>(flag._tag, flag, cases)

export const matchSupport = <R>(support: RatstackSupport, cases: Cases<ByTag<RatstackSupport>, R>): R =>
  dispatch<ByTag<RatstackSupport>, RatstackSupport['_tag'], R>(support._tag, support, cases)

export const matchDirection = <R>(direction: Direction, cases: { readonly [K in Direction]: () => R }): R =>
  cases[direction]()

export const matchKind = <R>(kind: Kind, cases: { readonly [K in Kind]: () => R }): R => cases[kind]()

export const firstRule = <R>(rules: readonly (readonly [boolean, () => R])[], otherwise: () => R): R =>
  rules.reduceRight<() => R>(
    (later, [guard, thunk]) => ({ true: thunk, false: later })[`${guard}` as const],
    otherwise,
  )()
