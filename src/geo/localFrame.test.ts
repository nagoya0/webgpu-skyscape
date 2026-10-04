import { Geodetic, radians } from '@takram/three-geospatial'
import { Quaternion, Vector3 } from 'three/webgpu'
import { describe, expect, it } from 'vitest'

import { createLocalFrame, ecefToWorld, nedToWorldRotation } from './localFrame'

const frame = createLocalFrame(139.8, 35.6, 0)

const ecefAt = (longitude: number, latitude: number, height: number): Vector3 =>
  new Geodetic(radians(longitude), radians(latitude), height).toECEF()

describe('local frame', () => {
  it('puts the origin at zero and height on y', () => {
    const world = ecefToWorld(frame, ecefAt(139.8, 35.6, 1500))
    expect(world.x).toBeCloseTo(0, 6)
    expect(world.y).toBeCloseTo(1500, 6)
    expect(world.z).toBeCloseTo(0, 6)
  })

  it('points x north and z east', () => {
    const north = ecefToWorld(frame, ecefAt(139.8, 35.61, 0))
    const east = ecefToWorld(frame, ecefAt(139.81, 35.6, 0))
    expect(north.x).toBeGreaterThan(1000)
    expect(Math.abs(north.z)).toBeLessThan(1)
    expect(east.z).toBeGreaterThan(800)
    expect(Math.abs(east.x)).toBeLessThan(1)
  })

  it('keeps the curvature: the ground 25 km away is about 49 m below y = 0', () => {
    // 25 km north is about 0.2252° of latitude here.
    const world = ecefToWorld(frame, ecefAt(139.8, 35.6 + 25_000 / 111_000, 0))
    expect(world.x).toBeGreaterThan(24_900)
    expect(world.y).toBeGreaterThan(-52)
    expect(world.y).toBeLessThan(-46)
  })

  it('maps NED at the origin to north, east and down in world axes', () => {
    const q = nedToWorldRotation(frame, ecefAt(139.8, 35.6, 0))
    const n = new Vector3(1, 0, 0).applyQuaternion(q)
    const e = new Vector3(0, 1, 0).applyQuaternion(q)
    const d = new Vector3(0, 0, 1).applyQuaternion(q)
    expect(n.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9)
    expect(e.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-9)
    expect(d.distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-9)
  })

  it('tilts NED away from the origin by the angle across the earth', () => {
    const position = ecefAt(139.8, 35.6 + 25_000 / 111_000, 1500)
    const q = nedToWorldRotation(frame, position, new Quaternion())
    const up = new Vector3(0, 0, -1).applyQuaternion(q)
    const tiltDegrees = (up.angleTo(new Vector3(0, 1, 0)) * 180) / Math.PI
    // About 0.22° at 25 km.
    expect(tiltDegrees).toBeGreaterThan(0.2)
    expect(tiltDegrees).toBeLessThan(0.25)
  })
})
