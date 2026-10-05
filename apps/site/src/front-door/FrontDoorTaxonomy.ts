import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import * as S from 'effect/Schema'

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

export const frontDoorTaxonomy = Taxonomy.make('front_door').pipe(Taxonomy.add(ServePage))
