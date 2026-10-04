// The local tangent-plane frame the scene is drawn in (ADR 0017). World axes: x north, y up,
// z east, origin on the ground. Positions and attitudes come in as ECEF and NED and leave as
// world coordinates; everything here runs in 64-bit JavaScript numbers.
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'

export interface LocalFrame {
  originECEF: Vector3
  worldToECEF: Matrix4
  ecefToWorld: Matrix4
}

export function createLocalFrame(longitude: number, latitude: number, height: number): LocalFrame {
  const originECEF = new Geodetic(radians(longitude), radians(latitude), height).toECEF()
  const worldToECEF = Ellipsoid.WGS84.getNorthUpEastFrame(originECEF)
  return { originECEF, worldToECEF, ecefToWorld: worldToECEF.clone().invert() }
}

export function ecefToWorld(frame: LocalFrame, ecef: Vector3, result = new Vector3()): Vector3 {
  return result.copy(ecef).applyMatrix4(frame.ecefToWorld)
}

export function worldToECEF(frame: LocalFrame, world: Vector3, result = new Vector3()): Vector3 {
  return result.copy(world).applyMatrix4(frame.worldToECEF)
}

const north = new Vector3()
const east = new Vector3()
const up = new Vector3()
const down = new Vector3()
const nedToECEF = new Matrix4()
const nedToWorld = new Matrix4()

/**
 * The rotation from the NED frame at a point (north, east, down, with "down" along the
 * ellipsoid normal) to world axes. NED differs from point to point, so an attitude given
 * relative to the local horizon, as flight simulators give it, needs the NED frame of the
 * aircraft's own position, not the origin's.
 */
export function nedToWorldRotation(
  frame: LocalFrame,
  ecef: Vector3,
  result = new Quaternion()
): Quaternion {
  Ellipsoid.WGS84.getEastNorthUpVectors(ecef, east, north, up)
  down.copy(up).negate()
  nedToECEF.makeBasis(north, east, down)
  nedToWorld.extractRotation(frame.ecefToWorld).multiply(nedToECEF)
  return result.setFromRotationMatrix(nedToWorld)
}
