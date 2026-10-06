// Demo areas selectable with ?area=. Tokyo is the decided area (ADR 0023); Hakone is a trial,
// started 2026-10-06 at the maintainer's request, of flying higher over mountains, the coast and
// Mount Fuji instead of low over the city (docs/ideas.md).
import { DEFAULT_TERRAIN, type TerrainOptions } from './terrain/terrain'

export type AreaName = 'tokyo' | 'hakone'

export interface Area {
  /** World origin (ADR 0017): degrees and metres above the ellipsoid. */
  origin: { longitude: number; latitude: number; height: number }
  terrain: TerrainOptions
  /** Whether PLATEAU buildings exist for the area in this demo. */
  buildings: boolean
}

export const AREAS: Record<AreaName, Area> = {
  tokyo: {
    origin: { longitude: 139.757, latitude: 35.665, height: 0 },
    terrain: DEFAULT_TERRAIN,
    buildings: true
  },
  // North of Lake Ashi: Mount Fuji about 28 km west-north-west, Sagami Bay about 15 km south-east.
  // Coarser root tiles reach the horizon, which is about 200 km away from 3 km up.
  hakone: {
    origin: { longitude: 139.02, latitude: 35.23, height: 0 },
    terrain: {
      ...DEFAULT_TERRAIN,
      longitude: 139.02,
      latitude: 35.23,
      extentDegrees: 1.5,
      rootZoom: 8,
      maxTiles: 400
    },
    buildings: false
  }
}
