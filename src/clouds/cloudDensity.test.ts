import { describe, expect, it } from 'vitest'

import { cloudDensityAt, type DensityInputs, type DensityOffsets } from './cloudDensity'

const R = 6_371_000

// A uniform weather map and noise, one layer from 1,000 to 2,000 m.
function inputs(weather: number, noise: number): DensityInputs {
  return {
    weather: { data: new Uint8Array(4 * 4 * 4).fill(weather), size: 4 },
    shape: { data: new Uint8Array(2 * 2 * 2).fill(noise), size: 2 },
    detail: null,
    layers: [
      {
        altitude: 1000,
        height: 1000,
        densityScale: 0.2,
        shapeAmount: 1,
        detailAmount: 1,
        weatherExponent: 1,
        shapeAlteringBias: 0.35,
        coverageFilterWidth: 0.6
      }
    ],
    shapeRepeat: 0.0003,
    detailRepeat: 0.006,
    weatherRepeat: 1e-5,
    profileLinear: 0.75,
    profileConstant: 0.25,
    earthCenter: { x: 0, y: -R, z: 0 },
    earthRadius: R
  }
}

const still: DensityOffsets = { weather: { x: 0, y: 0 }, shape: { x: 0, y: 0, z: 0 }, detail: { x: 0, y: 0, z: 0 } }

describe('cloudDensityAt', () => {
  it('is zero outside the layers', () => {
    expect(cloudDensityAt(inputs(255, 255), { x: 0, y: 500, z: 0 }, still, 1)).toBe(0)
    expect(cloudDensityAt(inputs(255, 255), { x: 0, y: 2500, z: 0 }, still, 1)).toBe(0)
  })

  it('is positive inside a full cloud and zero in clear weather', () => {
    expect(cloudDensityAt(inputs(255, 255), { x: 0, y: 1500, z: 0 }, still, 1)).toBeGreaterThan(0)
    expect(cloudDensityAt(inputs(0, 255), { x: 0, y: 1500, z: 0 }, still, 0.3)).toBe(0)
  })

  it('never exceeds the layer density scale', () => {
    const density = cloudDensityAt(inputs(255, 255), { x: 0, y: 1900, z: 0 }, still, 1)
    expect(density).toBeLessThanOrEqual(0.2)
  })
})
