// Volumetric clouds (ADR 0013, ADR 0022): the ray marching and the temporal resolve are WGSL
// ported from @takram/three-clouds; TSL gathers the inputs, and CloudsNode runs the passes.
// Composited right after the aerial perspective.
import {
  getIndirectLuminanceToPoint,
  getSplitScalarIlluminance,
  type AtmosphereContext
} from '@takram/three-atmosphere/webgpu'
import { decode as decodePng } from 'fast-png'
import {
  float,
  frameId,
  int,
  ivec2,
  min,
  perspectiveDepthToViewZ,
  positionWorld,
  sampler,
  screenCoordinate,
  screenUV,
  select,
  texture,
  texture3D,
  uniform,
  vec2,
  vec3,
  vec4,
  wgslFn
} from 'three/tsl'
import {
  Data3DTexture,
  DataTexture,
  FloatType,
  RGBAFormat,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  type Node,
  type PerspectiveCamera,
  type Texture,
  type WebGPURenderer
} from 'three/webgpu'

import { ecefToWorld, type LocalFrame } from '../geo/localFrame'
import { asNode, type CompositeStage } from '../render/pipeline'
import { preprocess } from '../shaders/preprocess'
import { cloudDensityAt, type DensityInputs, type DensityOffsets, type WeatherMap } from './cloudDensity'
import { CloudShadows, SHADOW_CASCADES } from './cloudShadows'
import { CloudsNode, type CloudPassInputs } from './cloudsNode'
import clipAABBCode from './wgsl/clipAABB.wgsl?raw'
import cloudHazeCode from './wgsl/cloudHaze.wgsl?raw'
import cloudMediaCode from './wgsl/cloudMedia.wgsl?raw'
import cloudMultipleScatteringCode from './wgsl/cloudMultipleScattering.wgsl?raw'
import cloudsCode from './wgsl/clouds.wgsl?raw'
import cloudsResolveCode from './wgsl/cloudsResolve.wgsl?raw'
import cloudShadowMarchCode from './wgsl/cloudShadowMarch.wgsl?raw'
import cloudShadowOpticalDepthCode from './wgsl/cloudShadowOpticalDepth.wgsl?raw'
import cloudShadowResolveCode from './wgsl/cloudShadowResolve.wgsl?raw'
import cloudWeatherCode from './wgsl/cloudWeather.wgsl?raw'
import isFinite4Code from './wgsl/isFinite4.wgsl?raw'
import structuredPlanesCode from './wgsl/structuredPlanes.wgsl?raw'
import structureNormalCode from './wgsl/structureNormal.wgsl?raw'
import raySphereCode from './wgsl/raySphere.wgsl?raw'
import remapClamped4Code from './wgsl/remapClamped4.wgsl?raw'
import varianceClippingCode from './wgsl/varianceClipping.wgsl?raw'

// TYPE-BRIDGE: @types/three 0.186 does not accept a wgslFn result as an include, although
// Three.js itself does (the result proxies the FunctionNode).
type Include = Parameters<typeof wgslFn>[1] extends (infer T)[] | undefined ? T : never
const include = (fn: unknown): Include => fn as Include

/**
 * takram's feature switches that the port supports (docs/clouds-parity.md), and the ones on by
 * default, as in takram's defaults.
 */
export const CLOUD_FEATURES = [
  'SHAPE_DETAIL',
  'POWDER',
  'TEMPORAL_UPSCALE',
  'HAZE',
  'TEMPORAL_PASS',
  'TEMPORAL_JITTER',
  'SHADOW_LENGTH'
] as const
export type CloudFeature = (typeof CLOUD_FEATURES)[number]
export const DEFAULT_CLOUD_FEATURES: ReadonlySet<CloudFeature> = new Set(CLOUD_FEATURES)

/** The WGSL functions, preprocessed for a set of features. */
function buildFunctions(features: ReadonlySet<string>) {
  const fn = (code: string, includes: Include[] = []) => wgslFn(preprocess(code, features), includes)
  const remapClamped4 = fn(remapClamped4Code)
  const raySphere = fn(raySphereCode)
  const cloudWeather = fn(cloudWeatherCode, [include(remapClamped4)])
  const cloudMedia = fn(cloudMediaCode, [include(remapClamped4)])
  const cloudMultipleScattering = fn(cloudMultipleScatteringCode)
  const clipAABB = fn(clipAABBCode)
  const varianceClipping = fn(varianceClippingCode, [include(clipAABB)])
  const cloudShadowOpticalDepth = fn(cloudShadowOpticalDepthCode, [include(raySphere)])
  return {
    clouds: fn(cloudsCode, [
      include(raySphere),
      include(cloudWeather),
      include(cloudMedia),
      include(cloudMultipleScattering),
      include(cloudShadowOpticalDepth)
    ]),
    cloudsResolve: fn(cloudsResolveCode, [include(varianceClipping), include(fn(isFinite4Code))]),
    cloudHaze: fn(cloudHazeCode),
    cloudShadowMarch: fn(cloudShadowMarchCode, [
      include(raySphere),
      include(fn(structureNormalCode)),
      include(fn(structuredPlanesCode)),
      include(cloudWeather),
      include(cloudMedia)
    ]),
    cloudShadowOpticalDepth,
    cloudShadowResolve: fn(cloudShadowResolveCode, [include(clipAABB), include(fn(isFinite4Code))])
  }
}

const ASSETS = `${import.meta.env.BASE_URL}clouds/`

async function loadVolume(url: string, size: number): Promise<Data3DTexture> {
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer())
  const volume = new Data3DTexture(data, size, size, size)
  volume.format = RedFormat
  volume.type = UnsignedByteType
  volume.minFilter = LinearFilter
  volume.magFilter = LinearFilter
  volume.wrapS = volume.wrapT = volume.wrapR = RepeatWrapping
  volume.colorSpace = NoColorSpace
  volume.needsUpdate = true
  return volume
}

/** The blue noise's size: pixels and frames (tools/bluenoise/make_blue_noise.py). */
const BLUE_NOISE_SIZE = 128
const BLUE_NOISE_FRAMES = 64

/**
 * The blue noise that jitters the ray marching, made by this project (tools/bluenoise/), loaded once
 * and shared. takram's stbn node loads a new copy each time a material is set up and never
 * releases it; the cloud shadow on the terrain is set up in every tile's material, so that leaked
 * about 1 MB per tile as tiles were replaced.
 */
async function loadBlueNoise(): Promise<Data3DTexture> {
  const data = new Uint8Array(await (await fetch(`noise/blue-noise.bin`)).arrayBuffer())
  const noise = new Data3DTexture(data, BLUE_NOISE_SIZE, BLUE_NOISE_SIZE, BLUE_NOISE_FRAMES)
  noise.format = RedFormat
  noise.type = UnsignedByteType
  noise.minFilter = NearestFilter
  noise.magFilter = NearestFilter
  noise.wrapS = noise.wrapT = noise.wrapR = RepeatWrapping
  noise.colorSpace = NoColorSpace
  noise.needsUpdate = true
  return noise
}

/**
 * The weather map, decoded on the CPU so that the GPU and the CPU density (cloudDensity.ts) read
 * the same values: a browser decode would premultiply the alpha channel, which holds the fourth
 * layer, and lose precision in the others. Rows are flipped so that v = 0 is the image's bottom
 * row, as three's TextureLoader uploaded it.
 */
async function loadWeather(url: string): Promise<{ texture: Texture; map: WeatherMap }> {
  const png = decodePng(new Uint8Array(await (await fetch(url)).arrayBuffer()))
  if (png.channels !== 4 || png.depth !== 8 || png.width !== png.height) {
    throw new Error(`Unexpected weather map: ${png.width}×${png.height}, ${png.channels} channels`)
  }
  const size = png.width
  const source = png.data as Uint8Array
  const data = new Uint8Array(size * size * 4)
  const row = size * 4
  for (let y = 0; y < size; y++) data.set(source.subarray((size - 1 - y) * row, (size - y) * row), y * row)
  const weather = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  weather.colorSpace = NoColorSpace
  weather.wrapS = weather.wrapT = RepeatWrapping
  weather.minFilter = LinearMipmapLinearFilter
  weather.magFilter = LinearFilter
  weather.generateMipmaps = true
  weather.needsUpdate = true
  return { texture: weather, map: { data, size } }
}

/** Settings of one cloud layer, from takram's default layers. */
export interface CloudLayer {
  /** Metres above the ellipsoid. */
  altitude: number
  height: number
  densityScale: number
  shapeAmount: number
  detailAmount: number
  weatherExponent: number
  shapeAlteringBias: number
  coverageFilterWidth: number
  /** Whether the layer is in the shadow maps. */
  shadow: boolean
}

// takram's defaults: two cumulus layers (weather channels r and g) that cast shadows, and a
// thin high layer (b) that does not.
export const TAKRAM_LAYERS: CloudLayer[] = [
  { altitude: 750, height: 650, densityScale: 0.2, shapeAmount: 1, detailAmount: 1, weatherExponent: 1, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6, shadow: true },
  { altitude: 1000, height: 1200, densityScale: 0.2, shapeAmount: 1, detailAmount: 1, weatherExponent: 1, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6, shadow: true },
  { altitude: 7500, height: 500, densityScale: 0.003, shapeAmount: 0.4, detailAmount: 0, weatherExponent: 1, shapeAlteringBias: 0.35, coverageFilterWidth: 0.5, shadow: false }
]

/** How much cloud there is (?cloudamount=): fewer, the demo's default, or as many as takram's. */
export type CloudAmount = 'few' | 'normal' | 'many'

/** The weather map is raised to this power in the low and middle layers; higher thins them out. */
const AMOUNT_EXPONENTS: Record<CloudAmount, number> = { few: 3, normal: 2, many: 1 }

/**
 * The demo's layers (ADR 0033), changed from takram's for clouds to fly among at 3,000 m: the
 * second low layer reaches 4,000 m, so cloud tops vary and some rise above the course; a middle
 * layer at 3,500 to 5,000 m uses the weather map's fourth channel; the amount thins out the low
 * and middle clouds. The thin high layer stays as takram's.
 */
export function cloudLayers(amount: CloudAmount = 'normal'): CloudLayer[] {
  const weatherExponent = AMOUNT_EXPONENTS[amount]
  return [
    { ...TAKRAM_LAYERS[0], weatherExponent },
    { ...TAKRAM_LAYERS[1], height: 3000, weatherExponent },
    TAKRAM_LAYERS[2],
    { altitude: 3500, height: 1500, densityScale: 0.1, shapeAmount: 1, detailAmount: 1, weatherExponent, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6, shadow: true }
  ]
}

export const DEFAULT_LAYERS: CloudLayer[] = cloudLayers()

/**
 * Top of the haze: the top of takram's default low layers (agreed 2026-10-06), kept when the
 * demo's layers reach higher (ADR 0033).
 */
const HAZE_TOP_HEIGHT = 2200

/** Shadow maps: takram's default size; they reach as far as the clouds are marched. */
const SHADOW_MAP_SIZE = 512
const SHADOW_MAX_FAR = 80_000

export interface CloudOptions {
  layers: CloudLayer[]
  /** 0 to 1. takram's default is 0.3. */
  coverage: number
  /** One weather map tile spans this many metres. */
  weatherTileMetres: number
  /** takram feature switches; fixed when the clouds are created. */
  features: ReadonlySet<CloudFeature>
  /**
   * Wind in metres per second towards the east and the north. It moves the weather map and the
   * shape and detail noise together. takram's default velocities are 0.
   */
  wind: { east: number; north: number }
}

export const DEFAULT_CLOUDS: CloudOptions = {
  layers: DEFAULT_LAYERS,
  coverage: 0.3,
  weatherTileMetres: 100_000,
  features: DEFAULT_CLOUD_FEATURES,
  wind: { east: 0, north: 0 }
}

export interface Clouds {
  stage: CompositeStage
  coverage: { value: number }
  /**
   * Places the clouds for a time in seconds on the flight path. The clouds depend on this time
   * only, so the same time always shows the same clouds.
   */
  setTime(seconds: number): void
  /** Changes the cloud amount of the layers made by cloudLayers() (ADR 0033). */
  setAmount(amount: CloudAmount): void
  /** Marches the cloud shadow maps; call each frame before the scene is drawn. */
  updateShadows(renderer: WebGPURenderer): void
  /**
   * Transmittance of the clouds towards the sun at the shaded point, for a light's
   * `shadow.shadowNode`: it dims the sunlight only.
   */
  sceneShadow: Node<'float'>
  /**
   * (shadow length, shadow start) along the view ray in the atmosphere's units, for the aerial
   * perspective's light shafts.
   */
  shadowLength: Node<'vec2'>
  /**
   * Extinction per metre of the clouds at a world position, computed on the CPU as the GPU march
   * does (cloud step C5); 0 outside the clouds. Uses the time last given to setTime.
   */
  densityAt(position: Vector3): number
}

const SHAPE_REPEAT = 0.0003
const DETAIL_REPEAT = 0.006

const pack = (layers: CloudLayer[], pick: (layer: CloudLayer) => number, empty: number): Vector4 => {
  const values = [0, 1, 2, 3].map(i => (layers[i] ? pick(layers[i]) : empty))
  return new Vector4(...values)
}

export async function createClouds(
  atmosphereContext: AtmosphereContext,
  camera: PerspectiveCamera,
  frame: LocalFrame,
  options: CloudOptions = DEFAULT_CLOUDS
): Promise<Clouds> {
  const [shapeVolume, detailVolume, { texture: weather, map: weatherMap }, blueNoise] = await Promise.all([
    loadVolume(`${ASSETS}shape.bin`, 128),
    loadVolume(`${ASSETS}shape_detail.bin`, 32),
    loadWeather(`${ASSETS}local_weather.png`),
    loadBlueNoise()
  ])

  // A copy, as the cloud amount changes the layers' weather exponents while the demo runs.
  const layers = options.layers.map(layer => ({ ...layer }))
  const functions = buildFunctions(options.features)
  // Unused layers get an empty height range far above everything.
  const minHeights = uniform(pack(layers, l => l.altitude, 1e6))
  const maxHeights = uniform(pack(layers, l => l.altitude + l.height, 1e6))
  const densityScales = uniform(pack(layers, l => l.densityScale, 0))
  const shapeAmounts = uniform(pack(layers, l => l.shapeAmount, 0))
  const detailAmounts = uniform(pack(layers, l => l.detailAmount, 0))
  const weatherExponents = uniform(pack(layers, l => l.weatherExponent, 1))
  const shapeAlteringBiases = uniform(pack(layers, l => l.shapeAlteringBias, 1))
  const coverageFilterWidths = uniform(pack(layers, l => l.coverageFilterWidth, 0.5))
  // takram's default density profile: 0.75 × height fraction + 0.25.
  const profileLinear = uniform(new Vector4().setScalar(0.75))
  const profileConstant = uniform(new Vector4().setScalar(0.25))
  const coverage = uniform(options.coverage)
  // takram's repeats: shape 0.0003 per metre, detail 0.006 per metre.
  const shape = vec4(SHAPE_REPEAT, DETAIL_REPEAT, 1 / options.weatherTileMetres, coverage)
  // (scattering coefficient, powder scale, powder exponent, sky light scale)
  const light = uniform(new Vector4(1, 0.8, 150, 1))
  // takram's default anisotropy: 0.7 and -0.2, mixed half and half.
  const phase = uniform(new Vector4(0.7, -0.2, 0.5, 0))
  // (min step, max step, perspective step scale, max distance): takram's high preset steps.
  const march = uniform(new Vector4(50, 1000, 1.01, 80_000))
  // takram's haze defaults: (density scale, exponent per metre, scattering, absorption).
  const hazeParameters = uniform(new Vector4(3e-5, 1e-3, 0.9, 0.5))
  // Offsets as in takram, added to the texture coordinates. The pattern moves against the
  // offset, so the wind enters with a minus sign. World axes: x north, z east.
  const weatherOffset = uniform(new Vector2())
  const shapeOffset = uniform(new Vector3())
  const detailOffset = uniform(new Vector3())
  const setTime = (seconds: number): void => {
    const north = -options.wind.north * seconds
    const east = -options.wind.east * seconds
    weatherOffset.value.set(north, east).divideScalar(options.weatherTileMetres)
    shapeOffset.value.set(north, 0, east).multiplyScalar(SHAPE_REPEAT)
    detailOffset.value.set(north, 0, east).multiplyScalar(DETAIL_REPEAT)
  }

  // The earth's centre in world coordinates and the distance to it from the origin, which is on
  // the ellipsoid: a sphere that touches the ellipsoid at the origin, close enough over the
  // demo area.
  const earthCenterWorld = ecefToWorld(frame, new Vector3(0, 0, 0))
  const earthCenter = uniform(earthCenterWorld)
  const earthRadius = uniform(earthCenterWorld.length())

  // Post-processing draws a full-screen quad with its own camera; pass the scene camera's
  // values explicitly (ADR 0022).
  const cameraWorld = uniform(camera.matrixWorld)
  const projectionInverse = uniform(camera.projectionMatrixInverse)
  const near = uniform(camera.near).onRenderUpdate(() => camera.near)
  const far = uniform(camera.far).onRenderUpdate(() => camera.far)
  const cameraPosition = uniform(camera.position)

  // TYPE-BRIDGE: takram's uniforms are typed against @types/three 0.184.
  const ctx = atmosphereContext as unknown as {
    matrixWorldToECEF: Node
    matrixECEFToWorld: Node
    sunDirectionECEF: Node & { value: Vector3 }
    altitudeCorrectionECEF: Node
    correctAltitude: boolean
    parametersNode: { worldToUnit: Node; bottomRadius: Node }
  }
  const sunDirectionECEF = asNode<'vec3'>(ctx.sunDirectionECEF)
  const sunDirection = asNode<'mat4'>(ctx.matrixECEFToWorld).mul(vec4(sunDirectionECEF, 0)).xyz.normalize()
  const weatherNode = texture(weather)
  const shapeNode = texture3D(shapeVolume)
  const detailNode = texture3D(detailVolume)
  // Blue noise per pixel and frame, looked up as takram's stbn node does, from the shared texture.
  const stbn = texture3D(blueNoise)
    .sample(vec3(screenCoordinate.xy, frameId.mod(BLUE_NOISE_FRAMES)).div(vec3(BLUE_NOISE_SIZE, BLUE_NOISE_SIZE, BLUE_NOISE_FRAMES)))
    .r

  // Cloud shadow maps (beer shadow maps), from the layers that cast shadows.
  const shadowLayers = layers.filter(l => l.shadow)
  const shadowHeights = uniform(
    new Vector2(Math.min(...shadowLayers.map(l => l.altitude)), Math.max(...shadowLayers.map(l => l.altitude + l.height)))
  )
  // (max iterations, min step, max step, optical depth tail scale): takram's shadow defaults.
  const shadowMarch = uniform(new Vector4(50, 100, 1000, 2))
  const shadows = new CloudShadows(camera, SHADOW_MAP_SIZE, SHADOW_MAX_FAR, ({ uv, cascade, inverseMatrices, previousMatrices }) =>
    asNode<'mat2'>(
      functions.cloudShadowMarch({
        uv,
        cascade,
        inverse0: inverseMatrices[0],
        inverse1: inverseMatrices[1],
        inverse2: inverseMatrices[2],
        previous0: previousMatrices[0],
        previous1: previousMatrices[1],
        previous2: previousMatrices[2],
        sunDirection,
        earthCenter,
        earthRadius,
        heights: shadowHeights,
        minHeights,
        maxHeights,
        densityScales,
        shapeAmounts,
        detailAmounts,
        weatherExponents,
        shapeAlteringBiases,
        coverageFilterWidths,
        profileLinear,
        profileConstant,
        shape,
        scatteringCoefficient: light.x,
        march: shadowMarch,
        weatherOffset,
        shapeOffset,
        detailOffset,
        weatherTexture: weatherNode,
        weatherSampler: sampler(weatherNode),
        shapeTexture: shapeNode,
        shapeSampler: sampler(shapeNode),
        detailTexture: detailNode,
        detailSampler: sampler(detailNode),
        jitter: asNode<'float'>(stbn),
        mapSize: float(SHADOW_MAP_SIZE)
      })
    ),
    options.features.has('TEMPORAL_PASS')
      ? ({ coord, current, depthVelocity, history }) =>
          asNode<'vec4'>(
            functions.cloudShadowResolve({
              coord,
              currentTexture: current,
              depthVelocityTexture: depthVelocity,
              historyTexture: history,
              historySampler: sampler(history),
              mapSize: int(SHADOW_MAP_SIZE),
              cascadeCount: int(SHADOW_CASCADES),
              // takram's ShadowResolveMaterial defaults.
              varianceGamma: float(1),
              temporalAlpha: float(0.01)
            })
          )
      : null
  )
  const viewMatrix = uniform(camera.matrixWorldInverse)
  // Optical depth towards the sun from the shadow maps, at a world position.
  const shadowOpticalDepth = (
    position: Node<'vec3'>,
    distanceOffset: Node<'float'>,
    radius: Node<'float'>,
    tail: number,
    jitter: Node<'float'>
  ): Node<'float'> =>
    asNode<'float'>(
      functions.cloudShadowOpticalDepth({
        position,
        distanceOffset,
        radius,
        tail: float(tail),
        jitter,
        viewMatrix,
        matrix0: shadows.matrices[0],
        matrix1: shadows.matrices[1],
        matrix2: shadows.matrices[2],
        intervalsA: shadows.intervalsA,
        intervalsB: shadows.intervalsB,
        cascadeCount: int(SHADOW_CASCADES),
        near,
        far: shadows.far,
        shadowTexture: shadows.textureNode,
        shadowSampler: sampler(shadows.textureNode),
        mapSize: shadows.mapSizeNode,
        sunDirection,
        earthCenter,
        earthRadius,
        topHeight: shadowHeights.y,
        pixel: screenCoordinate.xy
      })
    )
  // The scene: no tail, as takram's aerial perspective; a fixed filter radius in texels, where
  // takram scales it by the shadow texel's size on screen.
  const sceneShadow = shadowOpticalDepth(positionWorld, float(0), float(2), 0, asNode<'float'>(stbn))
    .negate()
    .exp()
  // Light shafts: the resolved shadow length, set each frame by the cloud passes, for the
  // aerial perspective of the scene, in the atmosphere's units. Zero until the first frame.
  // (min step, max iterations, max distance): takram's defaults.
  const shadowLengthMarch = uniform(new Vector4(50, 500, 2e5, 0))
  const shadowLengthOutput = texture(new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType))
  const shadowLength = shadowLengthOutput
    .sample(screenUV)
    .xy.mul(asNode<'float'>(ctx.parametersNode.worldToUnit))

  const sunWorld = new Vector3()
  const updateShadows = (renderer: WebGPURenderer): void => {
    sunWorld.copy(ctx.sunDirectionECEF.value).transformDirection(frame.ecefToWorld)
    shadows.update(renderer, sunWorld, earthCenterWorld)
  }

  const stage: CompositeStage = (input, depth) => {
    const worldToUnit = asNode<'float'>(ctx.parametersNode.worldToUnit)
    // A world position in the atmosphere's units, with its altitude correction.
    const toUnit = (point: Node<'vec3'>): Node<'vec3'> => {
      let ecef = asNode<'mat4'>(ctx.matrixWorldToECEF).mul(vec4(point, 1)).xyz
      if (ctx.correctAltitude) ecef = ecef.add(asNode<'vec3'>(ctx.altitudeCorrectionECEF))
      return ecef.mul(worldToUnit)
    }
    type Split = { get(name: 'direct' | 'indirect'): Node<'vec3'> }
    const illuminanceAt = (pointUnit: Node<'vec3'>): Split =>
      asNode(getSplitScalarIlluminance(pointUnit, sunDirectionECEF)) as unknown as Split
    // As takram's clouds.vert: sun and sky light at the camera (for the haze), and at the bottom
    // and top of the cloud layers straight above the camera (interpolated by height).
    const cameraUnit = toUnit(cameraPosition)
    const up = cameraUnit.normalize()
    const radiusUnit = asNode<'float'>(ctx.parametersNode.bottomRadius)
    const bottom = Math.min(...layers.map(l => l.altitude))
    const top = Math.max(...layers.map(l => l.altitude + l.height))
    const groundLight = illuminanceAt(cameraUnit)
    const bottomLight = illuminanceAt(up.mul(radiusUnit.add(worldToUnit.mul(bottom))))
    const topLight = illuminanceAt(up.mul(radiusUnit.add(worldToUnit.mul(top))))

    const marchPixel: CloudPassInputs['march'] = (pixel, uv, previousViewProjection) => {
      // Reversed Z (ADR 0015): the sky has depth 0.
      const lastPixel = vec2(asNode<'uvec2'>(depth.size(int(0)))).sub(1)
      const sceneDepth = depth.load(ivec2(min(pixel, lastPixel))).r
      const viewZ = select(sceneDepth.lessThanEqual(0), float(-1e9), perspectiveDepthToViewZ(sceneDepth, near, far))
      // A matrix's element is its column; @types/three 0.186 does not type element() on VarNode.
      const result = asNode<'mat4'>(
        functions.clouds({
          viewZ,
          uv,
          projectionInverse,
          cameraWorld,
          previousViewProjection,
          sunDirection,
          sunE0: bottomLight.get('direct'),
          skyE0: bottomLight.get('indirect'),
          sunE1: topLight.get('direct'),
          skyE1: topLight.get('indirect'),
          earthCenter,
          earthRadius,
          minHeights,
          maxHeights,
          densityScales,
          shapeAmounts,
          detailAmounts,
          weatherExponents,
          shapeAlteringBiases,
          coverageFilterWidths,
          profileLinear,
          profileConstant,
          shape,
          light,
          phase,
          march,
          weatherOffset,
          shapeOffset,
          detailOffset,
          weatherTexture: weatherNode,
          weatherSampler: sampler(weatherNode),
          shapeTexture: shapeNode,
          shapeSampler: sampler(shapeNode),
          detailTexture: detailNode,
          detailSampler: sampler(detailNode),
          // Blue noise per pixel and frame, as takram's getSTBN().
          jitter: asNode<'float'>(stbn),
          viewMatrix,
          shadowMatrix0: shadows.matrices[0],
          shadowMatrix1: shadows.matrices[1],
          shadowMatrix2: shadows.matrices[2],
          shadowIntervalsA: shadows.intervalsA,
          shadowIntervalsB: shadows.intervalsB,
          shadowCascadeCount: int(SHADOW_CASCADES),
          cameraNear: near,
          shadowFar: shadows.far,
          shadowTexture: shadows.textureNode,
          shadowSampler: sampler(shadows.textureNode),
          shadowMapSize: shadows.mapSizeNode,
          shadowTopHeight: shadowHeights.y,
          pixel,
          shadowLengthMarch,
          // The haze lies below the top of takram's low layers, whatever the layers are.
          hazeTopHeight: float(HAZE_TOP_HEIGHT)
        })
      ).toVar() as unknown as { element(index: number): Node<'vec4'> }
      const cloud = result.element(0)
      const depthVelocity = result.element(1)
      const direction = result.element(2).xyz
      const hazeFar = result.element(2).w
      // (shadow length, shadow start) in metres, and in the atmosphere's units.
      const shadowLength = result.element(3)
      const hazeNear = shadowLength.z
      const shadowLengthUnit = shadowLength.xy.mul(worldToUnit)

      // Aerial perspective between the camera and the clouds' front (applyAerialPerspective).
      // Where there are no clouds the colour is 0 and the result does not matter; the distance is
      // capped there so the atmosphere functions get a finite point. Inside a cloud the front
      // can be at the camera, where the atmosphere function divides 0 by 0, so it is kept at
      // least 1 m away.
      const front = cameraPosition.add(direction.mul(depthVelocity.x.clamp(1, 1e6)))
      const toFront = asNode(
        getIndirectLuminanceToPoint(cameraUnit, toUnit(front), shadowLengthUnit, sunDirectionECEF)
      ) as unknown as { get(name: 'luminance' | 'transmittance'): Node<'vec3'> }
      const aerial = select(
        cloud.a.greaterThan(0),
        vec4(cloud.rgb.mul(toFront.get('transmittance')).add(toFront.get('luminance').mul(cloud.a)), cloud.a),
        cloud
      )

      const color = asNode<'vec4'>(
        functions.cloudHaze({
          color: aerial,
          direction,
          hazeDistance: hazeFar.sub(hazeNear).max(0),
          relativeCamera: cameraPosition.sub(earthCenter),
          earthRadius,
          near: hazeNear,
          sunDirection,
          groundSunE: groundLight.get('direct'),
          groundSkyE: groundLight.get('indirect'),
          coverage,
          phase,
          skyLightScale: light.w,
          haze: hazeParameters,
          shadowLength: shadowLength.x
        })
      )
      return { color, depthVelocity, shadowLength }
    }

    const resolve: CloudPassInputs['resolve'] = ({
      color,
      depthVelocity,
      shadowLength,
      history,
      shadowLengthHistory,
      ownedOffset
    }) => {
      const result = asNode<'mat2'>(
        functions.cloudsResolve({
          coord: ivec2(screenCoordinate.xy.floor()),
          uv: screenUV,
          colorTexture: color,
          colorSampler: sampler(color),
          depthVelocityTexture: depthVelocity,
          shadowLengthTexture: shadowLength,
          shadowLengthSampler: sampler(shadowLength),
          historyTexture: history,
          historySampler: sampler(history),
          shadowLengthHistoryTexture: shadowLengthHistory,
          ownedOffset: ivec2(ownedOffset),
          // takram's CloudsResolveMaterial defaults.
          varianceGamma: float(2),
          temporalAlpha: float(0.1)
        })
      ).toVar() as unknown as { element(index: number): Node<'vec4'> }
      return { color: result.element(0), shadowLength: result.element(1) }
    }

    return asNode<'vec4'>(
      new CloudsNode(input, camera, {
        march: marchPixel,
        resolve,
        temporalUpscale: options.features.has('TEMPORAL_UPSCALE'),
        shadowLengthOutput
      })
    )
  }

  // Cloud step C5: the density on the CPU, from the same textures and settings.
  const densityInputs: DensityInputs = {
    weather: weatherMap,
    shape: { data: shapeVolume.image.data as Uint8Array, size: 128 },
    detail: options.features.has('SHAPE_DETAIL')
      ? { data: detailVolume.image.data as Uint8Array, size: 32 }
      : null,
    layers,
    shapeRepeat: SHAPE_REPEAT,
    detailRepeat: DETAIL_REPEAT,
    weatherRepeat: 1 / options.weatherTileMetres,
    profileLinear: profileLinear.value.x,
    profileConstant: profileConstant.value.x,
    earthCenter: earthCenterWorld,
    earthRadius: earthCenterWorld.length()
  }
  const densityOffsets: DensityOffsets = {
    weather: weatherOffset.value,
    shape: shapeOffset.value,
    detail: detailOffset.value
  }
  const densityAt = (position: Vector3): number =>
    cloudDensityAt(densityInputs, position, densityOffsets, coverage.value)

  // The cloud amount (ADR 0033) only raises the weather map to a power per layer, a uniform here
  // and a layer setting for the CPU density, so it can change while the demo runs.
  const setAmount = (amount: CloudAmount): void => {
    const next = cloudLayers(amount)
    layers.forEach((layer, i) => {
      if (next[i]) layer.weatherExponent = next[i].weatherExponent
    })
    weatherExponents.value.copy(pack(layers, l => l.weatherExponent, 1))
  }

  return { stage, coverage, setTime, setAmount, updateShadows, sceneShadow, shadowLength, densityAt }
}
