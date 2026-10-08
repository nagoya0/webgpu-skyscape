// Exposure by the sun's altitude (night). The night is about a hundred thousand times darker than
// the day; the scene is pre-exposed through takram's luminance scale, so that its luminance stays
// within half-float precision (at the final exposure alone the night sky banded), and the final
// exposure before tone mapping stays the day's. In between, the factor follows the sun's altitude
// on a log scale.
//
// Making up all of the difference would show the night as bright as the day, as a photograph of
// a moonlit landscape exposed in full looks like daytime. As photographers do, the night is shown
// a few stops darker than that (the maintainer, 2026-10-08), and dusk part of the way.
//
// At night the exposure also follows the moon, part of the way, as an eye or a camera adapts: a
// full moon lights the ground about twelve times more than a night sky without it, which showed
// the terrain too bright under a full moon and too dark without one (the maintainer, 2026-10-08).

import { NIGHT_GROUND_ILLUMINANCE } from './nightGlow'

/** Pre-exposure that makes up all of the night's darkness: a moonlit scene at the day's brightness. */
export const NIGHT_PRE_EXPOSURE = 1e5
/** How many stops (halvings) darker than that the night is shown. */
export const NIGHT_DARKER_STOPS = 2.5
/** The sun's altitude in degrees above which the pre-exposure is the day's (1). */
export const DAY_ALTITUDE = 5
/**
 * The sun's altitude in degrees below which the pre-exposure is the night's. -12° first; at -10°
 * the sky still glowed with twilight under a night's exposure, and the maintainer preferred -15°
 * (2026-10-09), which keeps dusk darker.
 */
export const NIGHT_ALTITUDE = -15
/** The illuminance a full moon overhead gives the ground, in lux. */
export const FULL_MOON_ILLUMINANCE = 0.25
/** The night's illuminance the exposure is set for, in lux: between a full moon and none. */
export const NIGHT_REFERENCE_ILLUMINANCE = 0.07
/**
 * How much of the difference from that the exposure makes up, 0 to 1: half where the night is
 * darker (without the moon), nearly all where it is brighter (under a high moon), so that a full
 * moon does not light the terrain much more than the reference (the maintainer, 2026-10-08).
 */
export const MOON_ADAPTATION_DARK = 0.5
export const MOON_ADAPTATION_BRIGHT = 0.9
/**
 * The sun's altitudes in degrees between which the exposure starts and finishes following the
 * moon: only once the twilight has faded, as the estimate leaves the twilight out (at -10° a night
 * without the moon was exposed as a dark one while the sky still glowed).
 */
export const MOON_FROM_ALTITUDE = -10
export const MOON_FULL_ALTITUDE = -16

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

/** The illuminance on the ground at night, in lux: the moonlight by its altitude and the night sky's. */
export function nightIlluminance(moonDegrees: number): number {
  return FULL_MOON_ILLUMINANCE * Math.max(Math.sin((moonDegrees * Math.PI) / 180), 0) + NIGHT_GROUND_ILLUMINANCE
}

/** The part of the pre-exposure that follows the moon at night: 1 by day and at dusk. */
export function moonAdaptation(sunDegrees: number, moonDegrees: number): number {
  const illuminance = nightIlluminance(moonDegrees)
  const share = illuminance > NIGHT_REFERENCE_ILLUMINANCE ? MOON_ADAPTATION_BRIGHT : MOON_ADAPTATION_DARK
  const adaptation = (NIGHT_REFERENCE_ILLUMINANCE / illuminance) ** share
  const x = Math.min(Math.max((MOON_FROM_ALTITUDE - sunDegrees) / (MOON_FROM_ALTITUDE - MOON_FULL_ALTITUDE), 0), 1)
  return adaptation ** (x * x * (3 - 2 * x))
}

/** The pre-exposure for the sun and the moon at the given altitudes: by the sun, then at night by the moon. */
export function preExposure(sunDegrees: number, moonDegrees: number): number {
  return preExposureForSunAltitude(sunDegrees) * moonAdaptation(sunDegrees, moonDegrees)
}
