// Water on the terrain: where a tile's water mask is set (sea, from the elevation model's
// missing data), the surface is drawn as water instead of the photograph. The sky reflection is
// the atmosphere's sky luminance in the reflected direction, weighted by Fresnel, added as
// emission; the sun's glint comes from the sun light's specular on a smooth surface. The waves
// are WGSL (wgsl/waterNormal.wgsl).
import { getIndirectLuminance, type AtmosphereContext } from '@takram/three-atmosphere/webgpu'
import {
  cameraPosition,
  cameraViewMatrix,
  float,
  mix,
  normalWorldGeometry,
  positionWorld,
  pow,
  texture,
  transformDirection,
  uniform,
  vec2,
  vec3,
  vec4,
  wgslFn
} from 'three/tsl'
import type { Node, Texture } from 'three/webgpu'

import waterNormalCode from './wgsl/waterNormal.wgsl?raw'

const waterNormalFn = wgslFn(waterNormalCode)

/** Seconds; drives the waves. Set from the time on the flight path. */
export const waterTime = uniform(0)

/**
 * Specular intensity of land, 0 to 1 (?landspecular=, ADR 0032). Fields and forests scatter
 * light diffusely; a rough standard material still shows a sheen at grazing angles.
 */
export const landSpecular = uniform(0)

/** Albedo of the water body under the surface: a dark blue green. */
const WATER_COLOR = vec3(0.012, 0.03, 0.035)

export interface TerrainShading {
  colorNode: Node<'vec3'>
  roughnessNode: Node<'float'>
  normalNode: Node<'vec3'>
  emissiveNode: Node<'vec3'>
  /** For a physical material; ignored by a standard one. */
  specularIntensityNode: Node<'float'>
}

/**
 * Nodes for a terrain tile's material: the land colour as given, water where the mask is set.
 * @param mask water mask texture over the tile (1 = water)
 */
export function terrainShading(
  atmosphereContext: AtmosphereContext,
  land: Node<'vec3'>,
  mask: Texture
): TerrainShading {
  // TYPE-BRIDGE: takram's uniforms are typed against @types/three 0.184.
  const ctx = atmosphereContext as unknown as {
    matrixWorldToECEF: Node<'mat4'>
    sunDirectionECEF: Node<'vec3'>
    altitudeCorrectionECEF: Node<'vec3'>
    correctAltitude: boolean
    parametersNode: { worldToUnit: Node<'float'> }
  }
  const water = texture(mask).r.smoothstep(0.3, 0.7)

  // Waves flatten with distance; the roughness rises instead, spreading the sun's glint.
  const distance = positionWorld.distance(cameraPosition)
  const detail = float(1).sub(distance.div(4000)).clamp(0, 1)
  // Around the geometry's own normal: normalWorld would include this material's normal.
  const normal = waterNormalFn({
    position: positionWorld,
    up: normalWorldGeometry,
    time: waterTime,
    detail
  }) as Node<'vec3'>
  const roughness = mix(0.06, 0.3, distance.div(30_000).clamp(0, 1))

  // Sky reflection: Schlick's Fresnel for water (F0 0.02) times the sky in the reflected
  // direction, kept above the horizon.
  const view = positionWorld.sub(cameraPosition).normalize()
  const bounced = view.reflect(normal)
  const reflected = vec3(bounced.x, bounced.y.max(0.01), bounced.z)
  const cosTheta = normal.dot(view.negate()).clamp(0, 1)
  const fresnel = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosTheta), 5)))
  let pointECEF = ctx.matrixWorldToECEF.mul(vec4(positionWorld, 1)).xyz
  if (ctx.correctAltitude) pointECEF = pointECEF.add(ctx.altitudeCorrectionECEF)
  const pointUnit = pointECEF.mul(ctx.parametersNode.worldToUnit)
  const directionECEF = ctx.matrixWorldToECEF.mul(vec4(reflected.normalize(), 0)).xyz
  const sky = (
    getIndirectLuminance(pointUnit, directionECEF, vec2(0), ctx.sunDirectionECEF) as unknown as {
      get(name: 'luminance'): Node<'vec3'>
    }
  ).get('luminance')

  return {
    colorNode: mix(land, WATER_COLOR, water),
    roughnessNode: mix(float(1), roughness, water),
    // The material's normal is in view space.
    normalNode: transformDirection(mix(normalWorldGeometry, normal, water).normalize(), cameraViewMatrix),
    emissiveNode: sky.mul(fresnel).mul(water),
    specularIntensityNode: mix(landSpecular, float(1), water)
  }
}
