// The demo's area (ADR 0028): Sagami Bay, Hakone and Mount Fuji. Kept as a structure of its own
// so that another area, such as a mountain area like Okutama, can be added later (ADR 0036).
import { DEFAULT_TERRAIN, type TerrainOptions } from './terrain/terrain'

export interface Area {
  /** World origin (ADR 0017): degrees and metres above the ellipsoid. */
  origin: { longitude: number; latitude: number; height: number }
  terrain: TerrainOptions
  /** The flight path flown by default: a JSBSim path in public/paths/ (ADR 0035). */
  path: string
  /**
   * Magnetic declination in degrees, east positive, for the HUD's magnetic heading: a single value
   * for the area, roughly from GSI's magnetic charts (Japan's is west, 5 to 9°).
   */
  magneticDeclination: number
}

// North of Lake Ashi: Mount Fuji about 28 km west-north-west, Sagami Bay about 15 km south-east.
// Coarser root tiles reach the horizon, which is about 200 km away from 3 km up; at 1.5° the
// terrain stopped short of it and left a dark line of specks along the horizon. Beyond the
// terrain lies a sea-level sphere drawn as water (ADR 0030).
export const AREA: Area = {
  origin: { longitude: 139.02, latitude: 35.23, height: 0 },
  terrain: {
    ...DEFAULT_TERRAIN,
    longitude: 139.02,
    latitude: 35.23,
    extentDegrees: 2.5,
    rootZoom: 8,
    maxTiles: 1000
  },
  // The demo's course (ADR 0035), computed with JSBSim by tools/flightpath/fly.py.
  path: 'course',
  magneticDeclination: -7.5
}
