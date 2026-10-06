// Temporary: a racetrack course flown with coordinated turns, standing in for the JSBSim path
// (ADR 0008). It is integrated on the ellipsoid in latitude, longitude and height, and written
// out as ECEF positions and body-to-NED attitudes, the same form the JSBSim path will have.
import { Ellipsoid, Geodetic } from '@takram/three-geospatial'
import { Euler, Quaternion, Vector3 } from 'three/webgpu'

import { ecefToWorld, worldToECEF, type LocalFrame } from '../geo/localFrame'
import type { FlightPath } from './path'

const G = 9.80665

export interface RacetrackOptions {
  /** Metres per second. ADR 0018: about 250. */
  speed: number
  /** Height above the ellipsoid, metres. */
  height: number
  /** Seconds of each straight leg. */
  straightSeconds: number
  /** Bank angle in the turns, degrees. */
  bankDegrees: number
  /** Roll rate when rolling into and out of a turn, degrees per second. */
  rollRateDegrees: number
  /** Seconds between output samples. */
  interval: number
  /** Heading of the first straight leg, degrees clockwise from north. */
  headingDegrees: number
}

export const DEFAULT_RACETRACK: RacetrackOptions = {
  speed: 250,
  height: 1500,
  straightSeconds: 30,
  bankDegrees: 70,
  rollRateDegrees: 90,
  interval: 0.1,
  headingDegrees: 0
}

interface Phase {
  /** Seconds. */
  duration: number
  /** Bank angle in radians as a function of time within the phase. */
  bank: (t: number) => number
}

function buildPhases(o: RacetrackOptions): Phase[] {
  const bank = (o.bankDegrees * Math.PI) / 180
  const rollRate = (o.rollRateDegrees * Math.PI) / 180
  const rollTime = bank / rollRate
  // Heading turned while rolling from 0 to the bank angle at a constant roll rate:
  // integral of g tan(rollRate t) / v dt = g / (v rollRate) * -ln(cos(bank)).
  const headingInRoll = (G / (o.speed * rollRate)) * -Math.log(Math.cos(bank))
  const turnRate = (G * Math.tan(bank)) / o.speed
  // Roll in, hold, roll out: 180° of heading in all.
  const holdTime = (Math.PI - 2 * headingInRoll) / turnRate
  // Stretch the straights slightly so the whole course is a whole number of samples; playback
  // loops after count × interval seconds, and any remainder would show as a jump.
  const turnTime = 2 * rollTime + holdTime
  const course = 2 * (o.straightSeconds + turnTime)
  const straightTime = (Math.ceil(course / o.interval) * o.interval - 2 * turnTime) / 2
  const straight: Phase = { duration: straightTime, bank: () => 0 }
  const turn: Phase[] = [
    { duration: rollTime, bank: t => rollRate * t },
    { duration: holdTime, bank: () => bank },
    { duration: rollTime, bank: t => bank - rollRate * t }
  ]
  return [straight, ...turn, straight, ...turn]
}

/**
 * Flies the course once from a start point and heading. Steps of 10 ms; output every
 * `interval` seconds.
 */
function fly(o: RacetrackOptions, start: Geodetic, startHeading: number): FlightPath {
  const phases = buildPhases(o)
  const total = phases.reduce((sum, phase) => sum + phase.duration, 0)
  const count = Math.round(total / o.interval)
  const path: FlightPath = {
    interval: o.interval,
    count,
    ecef: new Float64Array(count * 3),
    attitude: new Float32Array(count * 4),
    loadFactor: new Float32Array(count),
    cloudDensity: new Float32Array(count),
    loop: true
  }

  const a = Ellipsoid.WGS84.maximumRadius
  const e2 = Ellipsoid.WGS84.eccentricitySquared
  const geodetic = start.clone()
  let heading = startHeading
  const step = 0.01
  const position = new Vector3()
  const euler = new Euler()
  const attitude = new Quaternion()
  let time = 0
  let phaseIndex = 0
  let phaseStart = 0
  let next = 0

  const bankAt = (t: number): number => {
    while (phaseIndex < phases.length - 1 && t - phaseStart >= phases[phaseIndex].duration) {
      phaseStart += phases[phaseIndex].duration
      phaseIndex++
    }
    return phases[phaseIndex].bank(Math.min(t - phaseStart, phases[phaseIndex].duration))
  }

  while (next < count) {
    const bank = bankAt(time)
    if (time >= next * o.interval - 1e-9) {
      geodetic.toECEF(position)
      position.toArray(path.ecef, next * 3)
      // Body to NED: heading about down, then pitch, then roll (aerospace Z-Y-X order).
      // Level flight is assumed: pitch 0.
      euler.set(bank, 0, heading, 'ZYX')
      attitude.setFromEuler(euler).toArray(path.attitude, next * 4)
      path.loadFactor[next] = 1 / Math.cos(bank)
      next++
    }
    // Coordinated turn: turn rate g tan(bank) / v.
    heading += ((G * Math.tan(bank)) / o.speed) * step
    // Move over the ellipsoid using the meridian (M) and prime vertical (N) radii.
    const sinLat = Math.sin(geodetic.latitude)
    const w = Math.sqrt(1 - e2 * sinLat * sinLat)
    const m = (a * (1 - e2)) / (w * w * w)
    const n = a / w
    geodetic.latitude += (o.speed * Math.cos(heading) * step) / (m + geodetic.height)
    geodetic.longitude +=
      (o.speed * Math.sin(heading) * step) / ((n + geodetic.height) * Math.cos(geodetic.latitude))
    time += step
  }
  return path
}

export interface PlaceholderPathResult {
  path: FlightPath
  /** Metres between the last sample and the first; the jump when playback loops. */
  seamGap: number
}

/** A racetrack centred on the frame's origin, the first leg on `headingDegrees`. */
export function createPlaceholderPath(
  frame: LocalFrame,
  options: RacetrackOptions = DEFAULT_RACETRACK
): PlaceholderPathResult {
  const toStart = (north: number, east: number): Geodetic => {
    const ecef = worldToECEF(frame, new Vector3(north, 0, east))
    const geodetic = new Geodetic().setFromECEF(ecef)
    geodetic.height = options.height
    return geodetic
  }
  // Fly once from the origin, then shift the start so the course is centred on it.
  const heading = (options.headingDegrees * Math.PI) / 180
  const trial = fly(options, toStart(0, 0), heading)
  const centre = new Vector3()
  const world = new Vector3()
  for (let i = 0; i < trial.count; i++) {
    centre.add(ecefToWorld(frame, world.fromArray(trial.ecef, i * 3)))
  }
  centre.divideScalar(trial.count)
  const path = fly(options, toStart(-centre.x, -centre.z), heading)

  const first = new Vector3().fromArray(path.ecef, 0)
  const last = new Vector3().fromArray(path.ecef, (path.count - 1) * 3)
  const seamGap = Math.abs(first.distanceTo(last) - options.speed * options.interval)
  return { path, seamGap }
}
