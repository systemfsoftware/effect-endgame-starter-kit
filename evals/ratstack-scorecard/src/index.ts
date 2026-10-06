export { cacheAccepted, cacheSave } from './harness/cache-policy.ts'
export { ratstackCacheKey } from './model/cache-key.ts'
export type { RatstackCacheInputs } from './model/cache-key.ts'
export type {
  Cell,
  CellProvenance,
  MeasuredCell,
  Ratchet,
  Row,
  RowDefinition,
  RowId,
  RowOutcome,
  ScorecardDocument,
  Side,
  Verdict,
} from './model/cell.ts'
export { directivesIn, isSourceFile, tallyDirectives, totalDirectives, vendoredRootsOf } from './model/directives.ts'
export { distinctPackages } from './model/lockfile.ts'
export { assembleScorecard } from './model/scorecard-document.ts'
export type { AssembleInput, DefinedRow, FamilyResult, RowFlag, SideCell } from './model/scorecard-document.ts'
export { renderSummary } from './model/summary-table.ts'
