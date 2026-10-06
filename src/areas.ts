// Demo areas selectable with ?area=. Tokyo is the decided area (ADR 0023); Hakone is a trial,
// started 2026-10-06 at the maintainer's request, of flying higher over mountains, the coast and
// Mount Fuji instead of low over the city (docs/ideas.md).
import { DEFAULT_RACETRACK, type RacetrackOptions } from './flight/placeholderPath'
import { DEFAULT_TERRAIN, type TerrainOptions } from './terrain/terrain'

export type AreaName = 'tokyo' | 'hakone'

export interface Area {
  /** World origin (ADR 0017): degrees and metres above the ellipsoid. */
  origin: { longitude: number; latitude: number; height: number }
  terrain: TerrainOptions
  /** Whether PLATEAU buildings exist for the area in this demo. */
  buildings: boolean
  /** The placeholder course, centred on the origin. */
  course: RacetrackOptions
  /**
   * What lies beyond the terrain: the flat placeholder disc, which lies on the origin's tangent
   * plane and so beyond about 25 km rises above the curving sea and hides it; or a sea-level
   * sphere drawn as water (src/terrain/seaSphere.ts).
   */
  beyondTerrain: 'disc' | 'sea'
}

export const AREAS: Record<AreaName, Area> = {
  tokyo: {
    origin: { longitude: 139.757, latitude: 35.665, height: 0 },
    terrain: DEFAULT_TERRAIN,
    buildings: true,
    course: { ...DEFAULT_RACETRACK, height: 450 },
    beyondTerrain: 'disc'
  },
  // North of Lake Ashi: Mount Fuji about 28 km west-north-west, Sagami Bay about 15 km south-east.
  // Coarser root tiles reach the horizon, which is about 200 km away from 3 km up; at 1.5° the
  // terrain stopped short of it and left a dark line of specks along the horizon.
  hakone: {
    origin: { longitude: 139.02, latitude: 35.23, height: 0 },
    terrain: {
      ...DEFAULT_TERRAIN,
      longitude: 139.02,
      latitude: 35.23,
      extentDegrees: 2.5,
      rootZoom: 8,
      maxTiles: 1000
    },
    buildings: false,
    // From Sagami Bay off Odawara towards Mount Fuji (heading 293°), turn short of it, fly back
    // and repeat; simple on purpose for looking into rendering problems (ADR 0028).
    course: { ...DEFAULT_RACETRACK, height: 3000, headingDegrees: 293, straightSeconds: 120, bankDegrees: 45 },
    beyondTerrain: 'sea'
  }
}
