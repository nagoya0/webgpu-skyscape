// Flight path data and playback (ADR 0008). Positions are ECEF and attitudes are body-to-NED,
// as a flight simulator produces them; conversion to world coordinates happens later
// (ADR 0017).
import { Quaternion, Vector3 } from 'three/webgpu'

export interface FlightPath {
  /** Seconds between samples. */
  interval: number
  /** Number of samples. */
  count: number
  /** ECEF positions in metres, x y z per sample. 64-bit: ECEF values need it. */
  ecef: Float64Array
  /** Attitude as a body-to-NED quaternion, x y z w per sample. Body axes: forward, right, down. */
  attitude: Float32Array
  /** Load factor in G. */
  loadFactor: Float32Array
  /** True if the last sample leads back into the first, so playback can loop. */
  loop: boolean
}

export interface AircraftState {
  ecef: Vector3
  bodyToNED: Quaternion
  loadFactor: number
  /** How far into cloud the aircraft is, 0 to 1: computed at playback from the clouds (cloud
   * step C5), not part of the path. */
  cloudDensity: number
}

export function createAircraftState(): AircraftState {
  return { ecef: new Vector3(), bodyToNED: new Quaternion(), loadFactor: 1, cloudDensity: 0 }
}

export function pathDuration(path: FlightPath): number {
  return path.loop ? path.count * path.interval : (path.count - 1) * path.interval
}

const qa = new Quaternion()
const qb = new Quaternion()

/** Interpolates the path at time t: Catmull-Rom for position, slerp for attitude. */
export function samplePath(path: FlightPath, time: number, result: AircraftState): AircraftState {
  const duration = pathDuration(path)
  const t = path.loop
    ? ((time % duration) + duration) % duration
    : Math.min(Math.max(time, 0), duration)
  const f = t / path.interval
  const i1 = Math.min(Math.floor(f), path.count - 1)
  const u = f - i1
  const index = (i: number): number =>
    path.loop ? ((i % path.count) + path.count) % path.count : Math.min(Math.max(i, 0), path.count - 1)
  const i0 = index(i1 - 1)
  const i2 = index(i1 + 1)
  const i3 = index(i1 + 2)

  // Uniform Catmull-Rom.
  const u2 = u * u
  const u3 = u2 * u
  const w0 = -0.5 * u3 + u2 - 0.5 * u
  const w1 = 1.5 * u3 - 2.5 * u2 + 1
  const w2 = -1.5 * u3 + 2 * u2 + 0.5 * u
  const w3 = 0.5 * u3 - 0.5 * u2
  const p = path.ecef
  result.ecef.set(
    w0 * p[i0 * 3] + w1 * p[i1 * 3] + w2 * p[i2 * 3] + w3 * p[i3 * 3],
    w0 * p[i0 * 3 + 1] + w1 * p[i1 * 3 + 1] + w2 * p[i2 * 3 + 1] + w3 * p[i3 * 3 + 1],
    w0 * p[i0 * 3 + 2] + w1 * p[i1 * 3 + 2] + w2 * p[i2 * 3 + 2] + w3 * p[i3 * 3 + 2]
  )

  qa.fromArray(path.attitude, i1 * 4)
  qb.fromArray(path.attitude, i2 * 4)
  result.bodyToNED.slerpQuaternions(qa, qb, u)

  result.loadFactor = path.loadFactor[i1] + (path.loadFactor[i2] - path.loadFactor[i1]) * u
  return result
}
