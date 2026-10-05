import { Geodetic, radians } from '@takram/three-geospatial'
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three/webgpu'
import { describe, expect, it } from 'vitest'

import { createAircraftState } from '../flight/path'
import { createLocalFrame } from '../geo/localFrame'
import {
  createCockpitCamera,
  DEFAULT_COCKPIT_CAMERA,
  type CockpitCameraOptions
} from './cockpitCamera'

const frame = createLocalFrame(139.8, 35.6, 0)

function setup(overrides: Partial<CockpitCameraOptions> = {}) {
  const camera = new PerspectiveCamera()
  const cockpit = createCockpitCamera(camera, frame, {
    ...DEFAULT_COCKPIT_CAMERA,
    shakePerG: 0,
    ...overrides
  })
  const state = createAircraftState()
  new Geodetic(radians(139.8), radians(35.6), 1500).toECEF(state.ecef)
  return { camera, cockpit, state }
}

const attitude = (headingDeg: number, pitchDeg: number, rollDeg: number): Quaternion =>
  new Quaternion().setFromEuler(
    new Euler((rollDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180, (headingDeg * Math.PI) / 180, 'ZYX')
  )

const forward = (camera: PerspectiveCamera): Vector3 =>
  new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)

describe('cockpit camera', () => {
  it('looks along the aircraft in level flight', () => {
    const { camera, cockpit, state } = setup()
    state.bodyToNED.copy(attitude(0, 0, 0))
    cockpit.update(state, 0, 0)
    // Heading north: world x.
    expect(forward(camera).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-6)
  })

  it('follows a roll at once', () => {
    const { camera, cockpit, state } = setup()
    state.bodyToNED.copy(attitude(0, 0, 0))
    cockpit.update(state, 0, 0)
    state.bodyToNED.copy(attitude(0, 0, 30))
    cockpit.update(state, 1 / 60, 1 / 60)
    const expected = new Quaternion()
    const target = new PerspectiveCamera()
    const reference = createCockpitCamera(target, frame, { ...DEFAULT_COCKPIT_CAMERA, shakePerG: 0 })
    reference.update(state, 0, 0)
    expected.copy(target.quaternion)
    expect(camera.quaternion.angleTo(expected)).toBeLessThan(1e-6)
  })

  it('follows a pitch change at once by default', () => {
    const { camera, cockpit, state } = setup()
    state.bodyToNED.copy(attitude(0, 0, 0))
    cockpit.update(state, 0, 0)
    state.bodyToNED.copy(attitude(0, 5, 0))
    cockpit.update(state, 1 / 60, 1 / 60)
    expect(Math.asin(forward(camera).y) * (180 / Math.PI)).toBeCloseTo(5, 3)
  })

  it('with lag set, lags behind a pitch change and then catches up', () => {
    const { camera, cockpit, state } = setup({ lagSeconds: 0.12 })
    state.bodyToNED.copy(attitude(0, 0, 0))
    cockpit.update(state, 0, 0)
    state.bodyToNED.copy(attitude(0, 5, 0))
    cockpit.update(state, 1 / 60, 1 / 60)
    const pitchJustAfter = Math.asin(forward(camera).y) * (180 / Math.PI)
    expect(pitchJustAfter).toBeGreaterThan(0)
    expect(pitchJustAfter).toBeLessThan(1)
    for (let i = 0; i < 120; i++) cockpit.update(state, 1 / 60, (i + 2) / 60)
    const pitchLater = Math.asin(forward(camera).y) * (180 / Math.PI)
    expect(pitchLater).toBeCloseTo(5, 2)
  })

  it('has no body effects by default (ADR 0020)', () => {
    const { camera, cockpit, state } = setup()
    state.bodyToNED.copy(attitude(0, 0, 0))
    state.loadFactor = 1
    cockpit.update(state, 0, 0)
    const level = camera.position.y
    state.loadFactor = 3
    for (let i = 0; i < 120; i++) cockpit.update(state, 1 / 60, i / 60)
    expect(camera.position.y).toBeCloseTo(level, 9)
  })

  it('with sink set, moves the eye down above 1 G and up below it', () => {
    const sinkPerG = 0.015
    const { camera, cockpit, state } = setup({ sinkPerG })
    state.bodyToNED.copy(attitude(0, 0, 0))
    state.loadFactor = 1
    cockpit.update(state, 0, 0)
    const level = camera.position.y
    state.loadFactor = 3
    for (let i = 0; i < 120; i++) cockpit.update(state, 1 / 60, i / 60)
    expect(camera.position.y - level).toBeCloseTo(-2 * sinkPerG, 4)
    state.loadFactor = 0
    for (let i = 0; i < 120; i++) cockpit.update(state, 1 / 60, i / 60)
    expect(camera.position.y - level).toBeCloseTo(sinkPerG, 4)
  })
})
