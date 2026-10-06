import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import * as S from 'effect/Schema'

import { CspAttributeText } from './record-csp-violation.schema'
import { RecordCspViolationDecisionTagSchema } from './record-csp-violation.workflow'
import { Route } from './serve-page.schema'
import { ServePageDecisionTagSchema } from './serve-page.workflow'

export const ServePage = Span.declare({
  id: 'front_door.serve_page',
  name: 'front_door.serve_page',
  attrs: S.Struct({
    'app.front_door.route': Route,
    'app.front_door.serve_page.decision': ServePageDecisionTagSchema,
  }),
})

export const RecordCspViolation = Span.declare({
  id: 'front_door.record_csp_violation',
  name: 'front_door.record_csp_violation',
  attrs: S.Struct({
    'app.csp.directive': CspAttributeText,
    'app.front_door.record_csp_violation.decision': RecordCspViolationDecisionTagSchema,
    'app.csp.blocked': S.optionalKey(CspAttributeText),
  }),
})

export const frontDoorTaxonomy = Taxonomy.make('front_door').pipe(
  Taxonomy.add(ServePage),
  Taxonomy.add(RecordCspViolation),
  Taxonomy.forbid(RecordCspViolation, { unless: 'csp-report' }),
)
