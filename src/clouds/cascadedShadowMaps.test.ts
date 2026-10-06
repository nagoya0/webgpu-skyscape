import { PerspectiveCamera, Vector3, Vector4 } from 'three/webgpu'
import { describe, expect, it } from 'vitest'

import { CascadedShadowMaps, practicalSplits } from './cascadedShadowMaps'

function camera(): PerspectiveCamera {
  const c = new PerspectiveCamera(70, 16 / 9, 0.1, 1e7)
  c.position.set(1000, 500, -2000)
  c.lookAt(5000, 300, 3000)
  c.updateMatrixWorld()
  return c
}

describe('practicalSplits', () => {
  it('increases to 1 and lies between the uniform and logarithmic splits', () => {
    const splits = practicalSplits(3, 0.1, 80_000, 0.6)
    expect(splits).toHaveLength(3)
    expect(splits[0]).toBeGreaterThan(0)
    expect(splits[0]).toBeLessThan(splits[1])
    expect(splits[2]).toBeCloseTo(1, 9)
    expect(splits[0]).toBeLessThan(1 / 3)
  })
})

describe('CascadedShadowMaps', () => {
  it('covers points of the view frustum in their cascade', () => {
    const c = camera()
    const maps = new CascadedShadowMaps(3, 512, 80_000)
    const sun = new Vector3(0.3, 0.6, -0.5).normalize()
    maps.update(c, sun, 1e4)
    expect(maps.far).toBe(80_000)

    for (let i = 0; i < 3; i++) {
      const { interval, matrix } = maps.cascades[i]
      // Points along the view direction and towards the frustum corners, inside the interval.
      const depth = ((interval.x + interval.y) / 2) * maps.far
      for (const [x, y] of [
        [0, 0],
        [0.9, 0.9],
        [-0.9, 0.5]
      ]) {
        const tan = Math.tan((c.fov * Math.PI) / 360)
        const view = new Vector3(x * tan * c.aspect * depth, y * tan * depth, -depth)
        const world = view.applyMatrix4(c.matrixWorld)
        const clip = new Vector4(world.x, world.y, world.z, 1).applyMatrix4(matrix)
        expect(Math.abs(clip.x / clip.w)).toBeLessThanOrEqual(1)
        expect(Math.abs(clip.y / clip.w)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('round-trips through the inverse matrix', () => {
    const maps = new CascadedShadowMaps(3, 512, 80_000)
    maps.update(camera(), new Vector3(0, 1, 0.2).normalize(), 1e4)
    const { matrix, inverseMatrix } = maps.cascades[1]
    const point = new Vector4(0.3, -0.4, -1, 1).applyMatrix4(inverseMatrix)
    const back = point.clone().applyMatrix4(matrix)
    expect(back.x / back.w).toBeCloseTo(0.3, 6)
    expect(back.y / back.w).toBeCloseTo(-0.4, 6)
    void matrix
  })
})
