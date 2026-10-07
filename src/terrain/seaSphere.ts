// A sea-level surface beyond the terrain: a cap of a sphere around the earth's centre, drawn as
// water, so that anything past the terrain's edge reads as sea rather than a gap. It lies a
// little below sea level, so the terrain wins wherever it exists. A flat disc, used before, rose
// above the curving sea beyond about 25 km (ADR 0030).
import { vec3 } from 'three/tsl'
import {
  DataTexture,
  LinearFilter,
  Mesh,
  MeshStandardNodeMaterial,
  RedFormat,
  SphereGeometry,
  UnsignedByteType,
  type Vector3
} from 'three/webgpu'
import type { AtmosphereContext } from '@takram/three-atmosphere/webgpu'

import { GEOID_HEIGHT } from './tileGeometry'
import { terrainShading } from './water'

/** Metres below sea level, more than the ellipsoid and the sphere differ over the cap. */
const DEPTH = 60
/** Angular radius of the cap, degrees: past the horizon from 10 km up. */
const CAP_DEGREES = 6

export function createSeaSphere(atmosphereContext: AtmosphereContext, earthCenter: Vector3): Mesh {
  const radius = earthCenter.length() + GEOID_HEIGHT - DEPTH
  const geometry = new SphereGeometry(radius, 256, 64, 0, Math.PI * 2, 0, (CAP_DEGREES * Math.PI) / 180)
  const allWater = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat, UnsignedByteType)
  allWater.minFilter = LinearFilter
  allWater.magFilter = LinearFilter
  allWater.needsUpdate = true
  const material = new MeshStandardNodeMaterial({ metalness: 0 })
  Object.assign(material, terrainShading(atmosphereContext, vec3(0), allWater))
  const mesh = new Mesh(geometry, material)
  mesh.name = 'sea sphere'
  // The cap's pole is +y, which is up at the origin of the local frame (ADR 0017).
  mesh.position.copy(earthCenter)
  mesh.receiveShadow = true // cloud shadows
  return mesh
}
