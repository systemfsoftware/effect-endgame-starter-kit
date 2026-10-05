import type { Side } from '../model/cell.ts'

export interface VendoredRoot {
  readonly root: string
  readonly reason: string
}

export interface SideAdapter {
  readonly side: Side
  readonly lockfile: string
  readonly vendored: readonly VendoredRoot[]
}
