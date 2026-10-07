import { describe, expect, it } from 'vitest'

import { pathFromFile } from './loadPath'

describe('pathFromFile', () => {
  it('converts geodetic positions to ECEF and keeps the other channels', () => {
    const path = pathFromFile({
      interval: 0.5,
      loop: false,
      latitude: [0, 90],
      longitude: [0, 0],
      height: [0, 1000],
      attitude: [0, 0, 0, 1, 0, 0, 0.6, 0.8],
      loadFactor: [1, 2]
    })
    expect(path.count).toBe(2)
    expect(path.interval).toBe(0.5)
    expect(path.loop).toBe(false)
    // The equator at the prime meridian, on the WGS84 ellipsoid.
    expect(path.ecef[0]).toBeCloseTo(6378137, 3)
    expect(path.ecef[1]).toBeCloseTo(0, 3)
    expect(path.ecef[2]).toBeCloseTo(0, 3)
    // The North Pole, 1 km up: the polar radius plus the height.
    expect(path.ecef[3]).toBeCloseTo(0, 3)
    expect(path.ecef[5]).toBeCloseTo(6356752.314 + 1000, 2)
    expect(Array.from(path.attitude)).toEqual([0, 0, 0, 1, 0, 0, expect.closeTo(0.6), expect.closeTo(0.8)])
    expect(Array.from(path.loadFactor)).toEqual([1, 2])
  })
})
