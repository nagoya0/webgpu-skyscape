// The first-person camera (ADR 0009). It reads the aircraft's state and adds what a pilot's
// head does: it lags behind the aircraft's rotation, shakes slightly, and sinks under load
// (ADR 0008). The behaviour is still to be specified; the numbers below are first guesses to
// be tuned by eye.
import { Euler, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three/webgpu'

import { ecefToWorld, nedToWorldRotation, type LocalFrame } from '../geo/localFrame'
import type { AircraftState } from '../flight/path'

export interface CockpitCameraOptions {
  /** Seconds for the head to catch up about 63 % of a change in the aircraft's attitude. */
  lagSeconds: number
  /** Shake in degrees in steady, level flight. */
  shakeDegrees: number
  /** Extra shake in degrees per G above 1, for turns. */
  shakePerG: number
  /** Extra shake in degrees at full cloud density. */
  shakeInCloud: number
  /** Metres the eye sinks per G above 1. */
  sinkPerG: number
}

// The maintainer prefers no shake in steady flight, some in turns and more in clouds, even if
// real aircraft shake a little all the time.
export const DEFAULT_COCKPIT_CAMERA: CockpitCameraOptions = {
  lagSeconds: 0.12,
  shakeDegrees: 0,
  shakePerG: 0.04,
  shakeInCloud: 0.3,
  sinkPerG: 0.015
}

// Camera axes (right, up, back) in body axes (forward, right, down).
const cameraToBody = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, -1), new Vector3(-1, 0, 0))
)

export interface CockpitCamera {
  options: CockpitCameraOptions
  /** Moves the camera to the aircraft. Pass dt = 0 to jump without lag. */
  update(state: AircraftState, dt: number, time: number): void
}

export function createCockpitCamera(
  camera: PerspectiveCamera,
  frame: LocalFrame,
  options: CockpitCameraOptions = { ...DEFAULT_COCKPIT_CAMERA }
): CockpitCamera {
  const nedToWorld = new Quaternion()
  const target = new Quaternion()
  const head = new Quaternion()
  const shake = new Quaternion()
  const shakeEuler = new Euler()
  const up = new Vector3()
  let initialised = false

  return {
    options,
    update(state, dt, time) {
      ecefToWorld(frame, state.ecef, camera.position)
      nedToWorldRotation(frame, state.ecef, nedToWorld)
      target.copy(nedToWorld).multiply(state.bodyToNED).multiply(cameraToBody)

      if (!initialised || dt <= 0) {
        head.copy(target)
        initialised = true
      } else {
        head.slerp(target, 1 - Math.exp(-dt / options.lagSeconds))
      }

      // Shake: sums of sines at unrelated frequencies, so the motion does not repeat visibly.
      // Its size follows the load factor and the cloud density, both interpolated smoothly
      // from the path data.
      const shakeDegrees =
        options.shakeDegrees +
        options.shakePerG * Math.max(state.loadFactor - 1, 0) +
        options.shakeInCloud * state.cloudDensity
      const amplitude = (shakeDegrees * Math.PI) / 180
      shakeEuler.set(
        amplitude * (Math.sin(time * 11.3) * 0.6 + Math.sin(time * 17.9 + 1.3) * 0.4),
        amplitude * (Math.sin(time * 7.1 + 0.7) * 0.6 + Math.sin(time * 13.7 + 2.1) * 0.4),
        amplitude * 0.5 * Math.sin(time * 9.4 + 0.4)
      )
      shake.setFromEuler(shakeEuler)
      camera.quaternion.copy(head).multiply(shake)

      // Sink along the aircraft's up axis under load.
      up.set(0, 1, 0).applyQuaternion(target)
      camera.position.addScaledVector(up, -options.sinkPerG * Math.max(state.loadFactor - 1, 0))
      camera.updateMatrixWorld()
    }
  }
}
