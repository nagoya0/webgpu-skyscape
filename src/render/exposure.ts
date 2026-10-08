// Exposure by the sun's altitude (night). The night is about a hundred thousand times darker than
// the day; the scene is pre-exposed through takram's luminance scale, so that its luminance stays
// within half-float precision (at the final exposure alone the night sky banded), and the final
// exposure before tone mapping stays the day's. In between, the factor follows the sun's altitude
// on a log scale.
//
// Making up all of the difference would show the night as bright as the day, as a photograph of
// a moonlit landscape exposed in full looks like daytime. As photographers do, the night is shown
// a few stops darker than that (the maintainer, 2026-10-08), and dusk part of the way.

/** Pre-exposure that makes up all of the night's darkness: a moonlit scene at the day's brightness. */
export const NIGHT_PRE_EXPOSURE = 1e5
/** How many stops (halvings) darker than that the night is shown. */
export const NIGHT_DARKER_STOPS = 2.5
/** The sun's altitude in degrees above which the pre-exposure is the day's (1). */
export const DAY_ALTITUDE = 5
/** The sun's altitude in degrees below which the pre-exposure is the night's. */
export const NIGHT_ALTITUDE = -12

/** How far into the night the sun's altitude is: 0 by day, 1 at night, smooth in between. */
function nightness(degrees: number): number {
  const x = Math.min(Math.max((degrees - NIGHT_ALTITUDE) / (DAY_ALTITUDE - NIGHT_ALTITUDE), 0), 1)
  return 1 - x * x * (3 - 2 * x)
}

/** The factor the scene's luminance is multiplied by, for the sun at the given altitude. */
export function preExposureForSunAltitude(degrees: number): number {
  const night = nightness(degrees)
  return NIGHT_PRE_EXPOSURE ** night * 2 ** (-NIGHT_DARKER_STOPS * night)
}
