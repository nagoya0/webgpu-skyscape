// Flight paths computed offline with JSBSim (ADR 0008; tools/flightpath/fly.py), served from
// public/paths/. The file holds geodetic positions (degrees, metres above the ellipsoid); they
// are converted to ECEF here, as playback works in ECEF.
import { Geodetic, radians } from '@takram/three-geospatial'
import { Vector3 } from 'three/webgpu'

import type { FlightPath } from './path'

export interface PathFile {
  /** Seconds between samples. */
  interval: number
  loop: boolean
  /** Degrees. */
  latitude: number[]
  longitude: number[]
  /** Metres above the ellipsoid. */
  height: number[]
  /** Body-to-NED quaternions, x y z w per sample. */
  attitude: number[]
  loadFactor: number[]
}

export function pathFromFile(file: PathFile): FlightPath {
  const count = file.latitude.length
  const ecef = new Float64Array(count * 3)
  const geodetic = new Geodetic()
  const position = new Vector3()
  for (let i = 0; i < count; i++) {
    geodetic.set(radians(file.longitude[i]), radians(file.latitude[i]), file.height[i])
    geodetic.toECEF(position).toArray(ecef, i * 3)
  }
  return {
    interval: file.interval,
    count,
    ecef,
    attitude: Float32Array.from(file.attitude),
    loadFactor: Float32Array.from(file.loadFactor),
    loop: file.loop
  }
}

/** Loads public/paths/NAME.json. */
export async function loadPath(name: string): Promise<FlightPath> {
  const response = await fetch(`${import.meta.env.BASE_URL}paths/${name}.json`)
  if (!response.ok) throw new Error(`flight path ${name}: ${response.status}`)
  return pathFromFile((await response.json()) as PathFile)
}
