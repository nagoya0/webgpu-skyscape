// Water on the terrain: where a tile's water mask is set (sea, from the elevation model's
// missing data), the surface is drawn as water instead of the photograph. The sky reflection is
// the atmosphere's sky luminance in the reflected direction, weighted by Fresnel, added as
// emission; the sun's glint comes from the sun light's specular on a smooth surface. The waves
// are baked FFT ocean slopes (tools/water/bake_ocean.py), sampled in WGSL (wgsl/waterNormal.wgsl).
import { getIndirectLuminance, type AtmosphereContext } from '@takram/three-atmosphere/webgpu'
import {
  cameraPosition,
  cameraViewMatrix,
  float,
  mix,
  normalWorldGeometry,
  positionWorld,
  pow,
  sampler,
  texture,
  texture3D,
  transformDirection,
  uniform,
  vec2,
  vec3,
  vec4,
  wgslFn
} from 'three/tsl'
import {
  Data3DTexture,
  LinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGFormat,
  UnsignedByteType,
  type Node,
  type Texture
} from 'three/webgpu'

import waterLayerCode from './wgsl/waterLayer.wgsl?raw'
import waterNormalCode from './wgsl/waterNormal.wgsl?raw'

// TYPE-BRIDGE: @types/three 0.186 does not accept a wgslFn result as an include, although
// three's WGSLNodeFunction does.
type Include = Parameters<typeof wgslFn>[1] extends (infer T)[] | undefined ? T : never
const waterNormalFn = wgslFn(waterNormalCode, [wgslFn(waterLayerCode) as unknown as Include])

/**
 * The baked wave slopes: 128 x 128 texels over a patch, 64 frames of a loop, two bytes each
 * (tools/water/bake_ocean.py). Flat until the file has loaded.
 */
const SLOPES_SIZE = 128
const SLOPES_FRAMES = 64
const oceanSlopes = new Data3DTexture(
  new Uint8Array(SLOPES_SIZE * SLOPES_SIZE * SLOPES_FRAMES * 2).fill(128),
  SLOPES_SIZE,
  SLOPES_SIZE,
  SLOPES_FRAMES
)
oceanSlopes.format = RGFormat
oceanSlopes.type = UnsignedByteType
oceanSlopes.minFilter = LinearFilter
oceanSlopes.magFilter = LinearFilter
oceanSlopes.wrapS = oceanSlopes.wrapT = oceanSlopes.wrapR = RepeatWrapping
oceanSlopes.colorSpace = NoColorSpace
oceanSlopes.needsUpdate = true
void fetch(`${import.meta.env.BASE_URL}water/ocean.bin`)
  .then(async response => new Uint8Array(await response.arrayBuffer()))
  .then(data => {
    oceanSlopes.image.data = data
    oceanSlopes.needsUpdate = true
  })
const oceanSlopesNode = texture3D(oceanSlopes)

/** Seconds; drives the waves. Set from the time on the flight path. */
export const waterTime = uniform(0)

/**
 * Specular intensity of land, 0 to 1: 0, diffuse only (ADR 0032). Fields and forests scatter
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

  // Waves smaller than a few pixels fade out with distance; the roughness rises instead,
  // spreading the sun's glint. A pixel covers about the distance times 1.1e-3 (70° over 1,080
  // pixels), stretched along the view where the surface is seen at a grazing angle.
  const distance = positionWorld.distance(cameraPosition)
  const grazing = positionWorld.sub(cameraPosition).normalize().dot(normalWorldGeometry).abs().max(0.05)
  const pixelMetres = distance.mul(1.1e-3).div(grazing)
  // Around the geometry's own normal: normalWorld would include this material's normal.
  const normal = waterNormalFn({
    position: positionWorld,
    up: normalWorldGeometry,
    time: waterTime,
    pixelMetres,
    slopes: oceanSlopesNode,
    slopesSampler: sampler(oceanSlopesNode)
  }) as Node<'vec3'>
  // Rougher where the waves have faded out (pixels over about a metre) and further still far away.
  const roughness = mix(0.06, 0.25, pixelMetres.smoothstep(0.5, 4)).max(mix(0.06, 0.3, distance.div(30_000).clamp(0, 1)))

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
