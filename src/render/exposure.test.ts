import { describe, expect, it } from 'vitest'

import {
  DAY_ALTITUDE,
  NIGHT_ALTITUDE,
  NIGHT_DARKER_STOPS,
  NIGHT_PRE_EXPOSURE,
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
