import { describe, expect, it } from 'vitest'

import { ancestorOf, childrenOf, lonLatToTile, tileXToLongitude, tileYToLatitude } from './webMercator'

describe('web mercator tiles', () => {
  it('round-trips a point through tile coordinates', () => {
    const { x, y } = lonLatToTile(139.757, 35.665, 15)
    expect(tileXToLongitude(x, 15)).toBeCloseTo(139.757, 9)
    expect(tileYToLatitude(y, 15)).toBeCloseTo(35.665, 9)
  })

  it('finds the GSI tile of a known place', () => {
    // Tokyo Station is in z15 tile 29105/12903 on GSI maps.
    const { x, y } = lonLatToTile(139.7671, 35.6812, 15)
    expect(Math.floor(x)).toBe(29105)
    expect(Math.floor(y)).toBe(12903)
  })

  it('splits a tile into four children and finds them again from below', () => {
    const children = childrenOf({ z: 10, x: 909, y: 403 })
    expect(children.map(c => `${c.z}/${c.x}/${c.y}`)).toEqual([
      '11/1818/806',
      '11/1819/806',
      '11/1818/807',
      '11/1819/807'
    ])
    const { tile, u0, v0, size } = ancestorOf({ z: 12, x: 3639, y: 1614 }, 10)
    expect(tile).toEqual({ z: 10, x: 909, y: 403 })
    expect(u0).toBe(0.75)
    expect(v0).toBe(0.5)
    expect(size).toBe(0.25)
  })
})
