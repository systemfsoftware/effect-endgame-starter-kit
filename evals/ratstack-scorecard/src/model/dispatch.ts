import { Function } from 'effect'
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

type ByTag<T extends Readonly<Record<'_tag', string>>> = { [V in T as V['_tag']]: V }
export type Cases<M, R> = { readonly [K in keyof M]: (value: M[K]) => R }

const dispatch = <M, K extends keyof M, R>(tag: K, value: M[K], cases: Cases<M, R>): R => cases[tag](value)

export const matchCell: {
  <R>(cases: Cases<ByTag<Cell>, R>): (cell: Cell) => R
  <R>(cell: Cell, cases: Cases<ByTag<Cell>, R>): R
} = Function.dual(
  2,
  <R>(cell: Cell, cases: Cases<ByTag<Cell>, R>): R => dispatch<ByTag<Cell>, Cell['_tag'], R>(cell._tag, cell, cases),
)

export const matchCheck: {
  <R>(cases: Cases<ByTag<CitationCheck>, R>): (check: CitationCheck) => R
  <R>(check: CitationCheck, cases: Cases<ByTag<CitationCheck>, R>): R
} = Function.dual(
  2,
  <R>(check: CitationCheck, cases: Cases<ByTag<CitationCheck>, R>): R =>
    dispatch<ByTag<CitationCheck>, CitationCheck['_tag'], R>(check._tag, check, cases),
)

export const matchVerdict: {
  <R>(cases: Cases<ByTag<Verdict>, R>): (verdict: Verdict) => R
  <R>(verdict: Verdict, cases: Cases<ByTag<Verdict>, R>): R
} = Function.dual(
  2,
  <R>(verdict: Verdict, cases: Cases<ByTag<Verdict>, R>): R =>
    dispatch<ByTag<Verdict>, Verdict['_tag'], R>(verdict._tag, verdict, cases),
)

export const matchOutcome: {
  <R>(cases: Cases<ByTag<RowOutcome>, R>): (outcome: RowOutcome) => R
  <R>(outcome: RowOutcome, cases: Cases<ByTag<RowOutcome>, R>): R
} = Function.dual(
  2,
  <R>(outcome: RowOutcome, cases: Cases<ByTag<RowOutcome>, R>): R =>
    dispatch<ByTag<RowOutcome>, RowOutcome['_tag'], R>(outcome._tag, outcome, cases),
)

export const matchRatchet: {
  <R>(cases: Cases<ByTag<Ratchet>, R>): (ratchet: Ratchet) => R
  <R>(ratchet: Ratchet, cases: Cases<ByTag<Ratchet>, R>): R
} = Function.dual(
  2,
  <R>(ratchet: Ratchet, cases: Cases<ByTag<Ratchet>, R>): R =>
    dispatch<ByTag<Ratchet>, Ratchet['_tag'], R>(ratchet._tag, ratchet, cases),
)

export const matchBaseline: {
  <R>(cases: Cases<ByTag<MainBaseline>, R>): (baseline: MainBaseline) => R
  <R>(baseline: MainBaseline, cases: Cases<ByTag<MainBaseline>, R>): R
} = Function.dual(
  2,
  <R>(baseline: MainBaseline, cases: Cases<ByTag<MainBaseline>, R>): R =>
    dispatch<ByTag<MainBaseline>, MainBaseline['_tag'], R>(baseline._tag, baseline, cases),
)

export const matchFlag: {
  <R>(cases: Cases<ByTag<Flag>, R>): (flag: Flag) => R
  <R>(flag: Flag, cases: Cases<ByTag<Flag>, R>): R
} = Function.dual(
  2,
  <R>(flag: Flag, cases: Cases<ByTag<Flag>, R>): R => dispatch<ByTag<Flag>, Flag['_tag'], R>(flag._tag, flag, cases),
)

export const matchSupport: {
  <R>(cases: Cases<ByTag<RatstackSupport>, R>): (support: RatstackSupport) => R
  <R>(support: RatstackSupport, cases: Cases<ByTag<RatstackSupport>, R>): R
} = Function.dual(
  2,
  <R>(support: RatstackSupport, cases: Cases<ByTag<RatstackSupport>, R>): R =>
    dispatch<ByTag<RatstackSupport>, RatstackSupport['_tag'], R>(support._tag, support, cases),
)

export const matchDirection: {
  <R>(cases: { readonly [K in Direction]: () => R }): (direction: Direction) => R
  <R>(direction: Direction, cases: { readonly [K in Direction]: () => R }): R
} = Function.dual(
  2,
  <R>(direction: Direction, cases: { readonly [K in Direction]: () => R }): R => cases[direction](),
)

export const matchKind: {
  <R>(cases: { readonly [K in Kind]: () => R }): (kind: Kind) => R
  <R>(kind: Kind, cases: { readonly [K in Kind]: () => R }): R
} = Function.dual(2, <R>(kind: Kind, cases: { readonly [K in Kind]: () => R }): R => cases[kind]())

export const firstRule: {
  <R>(rules: readonly (readonly [boolean, () => R])[]): (otherwise: () => R) => R
  <R>(rules: readonly (readonly [boolean, () => R])[], otherwise: () => R): R
} = Function.dual(
  2,
  <R>(rules: readonly (readonly [boolean, () => R])[], otherwise: () => R): R =>
    rules.reduceRight<() => R>(
      (later, [guard, thunk]) => ({ true: thunk, false: later })[`${guard}` as const],
      otherwise,
    )(),
)
