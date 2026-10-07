import { Quaternion, Vector3 } from 'three/webgpu'
import { describe, expect, it } from 'vitest'

import { createAircraftState, pathDuration, samplePath, type FlightPath } from './path'

const Z = new Vector3(0, 0, 1)

/** Four samples a second apart along x at 100 m/s, turning about z by 90° a second. */
function line(loop: boolean): FlightPath {
  const count = 4
  const ecef = new Float64Array(count * 3)
  const attitude = new Float32Array(count * 4)
  const q = new Quaternion()
  for (let i = 0; i < count; i++) {
    ecef[i * 3] = i * 100
    q.setFromAxisAngle(Z, (i * Math.PI) / 2).toArray(attitude, i * 4)
  }
  return { interval: 1, count, ecef, attitude, loadFactor: Float32Array.from([1, 2, 3, 4]), loop }
}

describe('samplePath', () => {
  it('interpolates position, attitude and load between samples', () => {
    const state = samplePath(line(false), 1.5, createAircraftState())
    // Catmull-Rom through evenly spaced points on a line stays on it.
    expect(state.ecef.x).toBeCloseTo(150, 6)
    expect(state.loadFactor).toBeCloseTo(2.5, 6)
    // Halfway between 90° and 180° about z.
    const expected = new Quaternion().setFromAxisAngle(Z, (Math.PI * 3) / 4)
    expect(Math.abs(state.bodyToNED.dot(expected))).toBeCloseTo(1, 6)
  })

  it('holds the ends of a path that does not loop', () => {
    const path = line(false)
    expect(pathDuration(path)).toBe(3)
    expect(samplePath(path, -5, createAircraftState()).ecef.x).toBeCloseTo(0, 6)
    expect(samplePath(path, 99, createAircraftState()).ecef.x).toBeCloseTo(300, 6)
  })

  it('wraps a looping path, the last sample leading into the first', () => {
    const path = line(true)
    expect(pathDuration(path)).toBe(4)
    expect(samplePath(path, 4.5, createAircraftState()).loadFactor).toBeCloseTo(1.5, 6)
    expect(samplePath(path, 3.5, createAircraftState()).loadFactor).toBeCloseTo(2.5, 6)
  })
})
