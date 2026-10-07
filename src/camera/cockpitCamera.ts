// The first-person camera (ADR 0009). It reads the aircraft's state and adds what a pilot's body
// does. The behaviour is still to be specified; the numbers below are first guesses to be tuned
// by eye.
//
// ADR 0020: the first-person view shows only what happens to the aircraft; the pilot's body
// belongs to the cockpit view. The body effects below are kept for that view and are off by
// default.
//
// - Shake (aircraft): none in steady flight, some in turns, more in clouds.
// - Pitch lag (body): when the aircraft pitches, the head lags a little behind. Roll and yaw are
//   not lagged; a pilot's head turns with the aircraft about those axes.
// - Load (body): the body is pressed into the seat above 1 G and lifts below it, so the eye
//   moves down or up along the aircraft's vertical axis.
import { Euler, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three/webgpu'

import { ecefToWorld, nedToWorldRotation, type LocalFrame } from '../geo/localFrame'
import type { AircraftState } from '../flight/path'

export interface CockpitCameraOptions {
  /** Seconds for the head to recover about 63 % of a pitch change of the aircraft; 0 for none. */
  lagSeconds: number
  /** Shake in degrees in steady, level flight. */
  shakeDegrees: number
  /** Extra shake in degrees per G above 1, for turns. */
  shakePerG: number
  /** Extra shake in degrees at full cloud density. */
  shakeInCloud: number
  /** Metres the eye moves down per G above 1, and up per G below 1. */
  sinkPerG: number
  /** Seconds for the body to settle about 63 % into a new load. */
  sinkSeconds: number
}

// The maintainer prefers no shake in steady flight, some in turns and more in clouds, even if
// real aircraft shake a little all the time.
export const DEFAULT_COCKPIT_CAMERA: CockpitCameraOptions = {
  lagSeconds: 0,
  shakeDegrees: 0,
  shakePerG: 0.04,
  shakeInCloud: 0.3,
  // Off in the first-person view: the pilot's body belongs to the cockpit view (ADR 0020).
  // 0.015 is the first guess for that view.
  sinkPerG: 0,
  sinkSeconds: 0.15
}

// Camera axes (right, up, back) in body axes (forward, right, down).
const cameraToBody = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, -1), new Vector3(-1, 0, 0))
)
const CAMERA_RIGHT = new Vector3(1, 0, 0)

export interface CockpitCamera {
  options: CockpitCameraOptions
  /** Moves the camera to the aircraft. Pass dt = 0 to jump without lag. */
  update(state: AircraftState, dt: number, time: number): void
  /**
   * The camera's attitude before the shake and the body effects: the airframe's, looking forward.
   * The aircraft's HUD is drawn in this frame.
   */
  readonly aircraftQuaternion: Quaternion
  /**
   * The camera's turn off the airframe's attitude (head lag, then shake; camera axes), so that
   * camera = aircraftQuaternion × offsetQuaternion.
   */
  readonly offsetQuaternion: Quaternion
}

export function createCockpitCamera(
  camera: PerspectiveCamera,
  frame: LocalFrame,
  options: CockpitCameraOptions = { ...DEFAULT_COCKPIT_CAMERA }
): CockpitCamera {
  const nedToWorld = new Quaternion()
  const target = new Quaternion()
  const previousTarget = new Quaternion()
  const delta = new Quaternion()
  const lag = new Quaternion()
  const shake = new Quaternion()
  const offset = new Quaternion()
  const shakeEuler = new Euler()
  const up = new Vector3()
  let pitchOffset = 0
  let settledLoad = 1
  let initialised = false

  return {
    options,
    aircraftQuaternion: target,
    offsetQuaternion: offset,
    update(state, dt, time) {
      ecefToWorld(frame, state.ecef, camera.position)
      nedToWorldRotation(frame, state.ecef, nedToWorld)
      target.copy(nedToWorld).multiply(state.bodyToNED).multiply(cameraToBody)

      if (!initialised || dt <= 0) {
        pitchOffset = 0
        settledLoad = state.loadFactor
        initialised = true
      } else {
        // The aircraft's rotation since the last frame, in camera axes. Its component about the
        // camera's right axis is the pitch change; the head starts that much behind and catches
        // up.
        delta.copy(previousTarget).invert().multiply(target)
        const angle = 2 * Math.acos(Math.min(Math.max(delta.w, -1), 1))
        const s = Math.sqrt(Math.max(1 - delta.w * delta.w, 0))
        const pitchChange = s > 1e-9 ? (angle * delta.x) / s : 0
        pitchOffset =
          options.lagSeconds > 0
            ? (pitchOffset - pitchChange) * Math.exp(-dt / options.lagSeconds)
            : 0
        settledLoad += (state.loadFactor - settledLoad) * (1 - Math.exp(-dt / options.sinkSeconds))
      }
      previousTarget.copy(target)

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
      lag.setFromAxisAngle(CAMERA_RIGHT, pitchOffset)
      offset.copy(lag).multiply(shake)
      camera.quaternion.copy(target).multiply(offset)

      // Pressed into the seat above 1 G, lifted below it.
      up.set(0, 1, 0).applyQuaternion(target)
      camera.position.addScaledVector(up, -options.sinkPerG * (settledLoad - 1))
      camera.updateMatrixWorld()
    }
  }
}
