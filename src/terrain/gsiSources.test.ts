import { describe, expect, it } from 'vitest'

import { fillFromParent } from './gsiSources'

describe('fillFromParent', () => {
  it('fills missing fine heights from the parent quarter and keeps the rest', () => {
    // A 4 x 4 parent rising 10 m per pixel eastwards; its north-east quarter is pixels 2 and 3.
    const parent = { size: 4, heights: Float32Array.from({ length: 16 }, (_, i) => 700 + (i % 4) * 10) }
    // A 4 x 4 fine grid, all missing except one value.
    const fine = { size: 4, heights: new Float32Array(16).fill(Number.NaN) }
    fine.heights[0] = 123
    const filled = fillFromParent(fine, parent, 1, 0)
    expect(filled.heights[0]).toBe(123)
    // Fine pixel 1 of the east half lies at parent x = (1 + 1.5 / 4) / 2 * 4 - 0.5 = 2.25.
    expect(filled.heights[1]).toBeCloseTo(722.5, 3)
    // The last column clamps to the parent's edge.
    expect(filled.heights[3]).toBeCloseTo(730, 3)
    expect(fine.heights[1]).toBeNaN()
  })

  it('leaves heights missing where the parent is missing too', () => {
    const parent = { size: 2, heights: new Float32Array(4).fill(Number.NaN) }
    const fine = { size: 2, heights: new Float32Array(4).fill(Number.NaN) }
    expect(Array.from(fillFromParent(fine, parent, 0, 0).heights).every(Number.isNaN)).toBe(true)
  })
})
