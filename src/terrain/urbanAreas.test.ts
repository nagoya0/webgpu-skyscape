import { describe, expect, it } from 'vitest'

import { urbanAreasFrom } from './urbanAreas'

// A square district from (0, 0) to (10, 10) with a hole from (4, 4) to (6, 6), and a smaller one.
const square = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]
const areas = urbanAreasFrom([
  { name: 'A', density: 5000, rings: [square(0, 0, 10, 10), square(4, 4, 6, 6)] },
  { name: 'B', density: 9000, rings: [square(20, 0, 22, 2)] }
])

describe('urban areas', () => {
  it('gives the density inside a district and 0 outside or in a hole', () => {
    expect(areas.densityAt(1, 1)).toBe(5000)
    expect(areas.densityAt(5, 5)).toBe(0)
    expect(areas.densityAt(15, 5)).toBe(0)
    expect(areas.densityAt(21, 1)).toBe(9000)
  })

  it('narrows the districts to a box', () => {
    const near = areas.within(19, -1, 23, 3)
    expect(near.densityAt(21, 1)).toBe(9000)
    expect(near.densityAt(1, 1)).toBe(0)
  })
})
