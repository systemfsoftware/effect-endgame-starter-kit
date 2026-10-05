import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import * as S from 'effect/Schema'

import { Route } from './serve-page.schema'

export const ServePage = Span.declare({
  id: 'front_door.serve_page',
  name: 'front_door.serve_page',
  attrs: S.Struct({ 'app.front_door.route': Route }),
})

export const frontDoorTaxonomy = Taxonomy.make('front_door').pipe(Taxonomy.add(ServePage))
