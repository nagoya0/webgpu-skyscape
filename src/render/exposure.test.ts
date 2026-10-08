import { describe, expect, it } from 'vitest'

import {
  DAY_ALTITUDE,
  NIGHT_ALTITUDE,
  NIGHT_DARKER_STOPS,
  NIGHT_PRE_EXPOSURE,
  nightIlluminance,
  preExposure,
  preExposureForSunAltitude
} from './exposure'

describe('preExposureForSunAltitude', () => {
  const night = NIGHT_PRE_EXPOSURE / 2 ** NIGHT_DARKER_STOPS

  it('is 1 by day, and at night makes up the darkness less a few stops', () => {
    expect(preExposureForSunAltitude(60)).toBe(1)
    expect(preExposureForSunAltitude(DAY_ALTITUDE)).toBe(1)
    expect(preExposureForSunAltitude(NIGHT_ALTITUDE)).toBeCloseTo(night)
    expect(preExposureForSunAltitude(-60)).toBeCloseTo(night)
  })

  it('rises steadily as the sun sets, halfway on a log scale halfway down', () => {
    const middle = (DAY_ALTITUDE + NIGHT_ALTITUDE) / 2
    expect(preExposureForSunAltitude(middle)).toBeCloseTo(Math.sqrt(night))
    let last = 0
    for (let degrees = 10; degrees >= -20; degrees--) {
      const value = preExposureForSunAltitude(degrees)
      expect(value).toBeGreaterThanOrEqual(last)
      last = value
    }
  })
})

describe('preExposure', () => {
  it('by day follows the sun alone, whatever the moon', () => {
    expect(preExposure(40, 60)).toBe(preExposureForSunAltitude(40))
    expect(preExposure(40, -30)).toBe(preExposureForSunAltitude(40))
  })

  it('at night is lower under a high moon and higher without one, closing the gap part of the way', () => {
    const night = preExposureForSunAltitude(-40)
    const fullMoon = preExposure(-40, 60)
    const noMoon = preExposure(-40, -20)
    expect(fullMoon).toBeLessThan(night)
    expect(noMoon).toBeGreaterThan(night)
    // The ground is about twelve times brighter under the moon; the exposure makes up part of it.
    const ground = nightIlluminance(60) / nightIlluminance(-20)
    expect(noMoon / fullMoon).toBeGreaterThan(3)
    expect(noMoon / fullMoon).toBeLessThan(ground)
  })

  it('leaves the twilight to the sun alone', () => {
    expect(preExposure(-8, -30)).toBe(preExposureForSunAltitude(-8))
    expect(preExposure(-8, 60)).toBe(preExposureForSunAltitude(-8))
  })
})
