import type { NewAuditRow } from './workshop-driver.ts'
import type { AuditedDecision } from './workshop-store.schema.ts'

export interface Audited {
  readonly decision: AuditedDecision
  readonly command: { readonly now: number }
  readonly outcome: object
}

export const auditRow = ({ decision, command, outcome }: Audited): NewAuditRow => ({
  decision,
  command: JSON.stringify(command),
  outcome: JSON.stringify(outcome),
  decidedAt: command.now,
})
