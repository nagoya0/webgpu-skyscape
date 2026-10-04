import { Geodetic } from '@takram/three-geospatial'
import { Euler, Quaternion, Vector3 } from 'three/webgpu'
import { describe, expect, it } from 'vitest'

import { createLocalFrame, ecefToWorld } from '../geo/localFrame'
import { createAircraftState, pathDuration, samplePath } from './path'
import { createPlaceholderPath, DEFAULT_RACETRACK } from './placeholderPath'

const frame = createLocalFrame(139.8, 35.6, 0)
const { path, seamGap } = createPlaceholderPath(frame)

const headingAt = (time: number): number => {
  const state = samplePath(path, time, createAircraftState())
  const euler = new Euler().setFromQuaternion(state.bodyToNED, 'ZYX')
  return (((euler.z * 180) / Math.PI) % 360 + 360) % 360
}

describe('placeholder racetrack', () => {
  it('lasts about two minutes and closes on itself', () => {
    const duration = pathDuration(path)
    expect(duration).toBeGreaterThan(100)
    expect(duration).toBeLessThan(140)
    expect(seamGap).toBeLessThan(1)
  })

  it('holds its height above the ellipsoid', () => {
    const geodetic = new Geodetic()
    const position = new Vector3()
    for (let i = 0; i < path.count; i += 50) {
      geodetic.setFromECEF(position.fromArray(path.ecef, i * 3))
      expect(geodetic.height).toBeCloseTo(DEFAULT_RACETRACK.height, 0)
    }
  })

  it('stays within 25 km of the origin', () => {
    const world = new Vector3()
    for (let i = 0; i < path.count; i++) {
      ecefToWorld(frame, world.fromArray(path.ecef, i * 3), world)
      expect(Math.hypot(world.x, world.z)).toBeLessThan(25_000)
    }
  })

  it('flies north, turns 180°, flies south', () => {
    expect(headingAt(5)).toBeCloseTo(0, 0)
    const southLeg = DEFAULT_RACETRACK.straightSeconds + 35
    expect(Math.abs(headingAt(southLeg) - 180)).toBeLessThan(1)
  })

  it('banks to the set angle with the matching load factor in the turn', () => {
    const state = samplePath(path, DEFAULT_RACETRACK.straightSeconds + 10, createAircraftState())
    const roll = new Euler().setFromQuaternion(state.bodyToNED, 'ZYX').x
    expect((roll * 180) / Math.PI).toBeCloseTo(DEFAULT_RACETRACK.bankDegrees, 1)
    expect(state.loadFactor).toBeCloseTo(1 / Math.cos((DEFAULT_RACETRACK.bankDegrees * Math.PI) / 180), 2)
  })

  it('moves at the set speed', () => {
    const a = samplePath(path, 10, createAircraftState()).ecef.clone()
    const b = samplePath(path, 11, createAircraftState()).ecef.clone()
    expect(a.distanceTo(b)).toBeCloseTo(DEFAULT_RACETRACK.speed, -1)
  })

  it('keeps attitude quaternions normalised', () => {
    const q = new Quaternion()
    for (let i = 0; i < path.count; i += 37) {
      expect(q.fromArray(path.attitude, i * 4).length()).toBeCloseTo(1, 5)
    }
  })
})
