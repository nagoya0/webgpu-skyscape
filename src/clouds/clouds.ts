// Volumetric clouds (ADR 0013, ADR 0022): the ray marching and the temporal resolve are WGSL
// ported from @takram/three-clouds; TSL gathers the inputs, and CloudsNode runs the passes.
// Composited right after the aerial perspective.
import {
  getIndirectLuminanceToPoint,
  getSplitScalarIlluminance,
  type AtmosphereContext
} from '@takram/three-atmosphere/webgpu'
import { stbn } from '@takram/three-geospatial/webgpu'
import {
  float,
  int,
  ivec2,
  min,
  perspectiveDepthToViewZ,
  sampler,
  screenCoordinate,
  screenUV,
  select,
  texture,
  texture3D,
  uniform,
  vec2,
  vec4,
  wgslFn
} from 'three/tsl'
import {
  Data3DTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  TextureLoader,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  type Node,
  type PerspectiveCamera,
  type Texture
} from 'three/webgpu'

import { ecefToWorld, type LocalFrame } from '../geo/localFrame'
import { asNode, type CompositeStage } from '../render/pipeline'
import { preprocess } from '../shaders/preprocess'
import { CloudsNode, type CloudPassInputs } from './cloudsNode'
import clipAABBCode from './wgsl/clipAABB.wgsl?raw'
import cloudHazeCode from './wgsl/cloudHaze.wgsl?raw'
import cloudMediaCode from './wgsl/cloudMedia.wgsl?raw'
import cloudMultipleScatteringCode from './wgsl/cloudMultipleScattering.wgsl?raw'
import cloudsCode from './wgsl/clouds.wgsl?raw'
import cloudsResolveCode from './wgsl/cloudsResolve.wgsl?raw'
import cloudWeatherCode from './wgsl/cloudWeather.wgsl?raw'
import isFinite4Code from './wgsl/isFinite4.wgsl?raw'
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
export const CLOUD_FEATURES = ['SHAPE_DETAIL', 'POWDER', 'TEMPORAL_UPSCALE', 'HAZE'] as const
export type CloudFeature = (typeof CLOUD_FEATURES)[number]
export const DEFAULT_CLOUD_FEATURES: ReadonlySet<CloudFeature> = new Set([
  'SHAPE_DETAIL',
  'POWDER',
  'TEMPORAL_UPSCALE',
  'HAZE'
])

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
  return {
    clouds: fn(cloudsCode, [
      include(raySphere),
      include(cloudWeather),
      include(cloudMedia),
      include(cloudMultipleScattering)
    ]),
    cloudsResolve: fn(cloudsResolveCode, [include(varianceClipping), include(fn(isFinite4Code))]),
    cloudHaze: fn(cloudHazeCode)
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

async function loadWeather(url: string): Promise<Texture> {
  const weather = await new TextureLoader().loadAsync(url)
  weather.colorSpace = NoColorSpace
  weather.wrapS = weather.wrapT = RepeatWrapping
  weather.minFilter = LinearMipmapLinearFilter
  weather.magFilter = LinearFilter
  weather.generateMipmaps = true
  return weather
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
}

// takram's defaults: two cumulus layers (weather channels r and g) and a thin high layer (b).
export const DEFAULT_LAYERS: CloudLayer[] = [
  { altitude: 750, height: 650, densityScale: 0.2, shapeAmount: 1, detailAmount: 1, weatherExponent: 1, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6 },
  { altitude: 1000, height: 1200, densityScale: 0.2, shapeAmount: 1, detailAmount: 1, weatherExponent: 1, shapeAlteringBias: 0.35, coverageFilterWidth: 0.6 },
  { altitude: 7500, height: 500, densityScale: 0.003, shapeAmount: 0.4, detailAmount: 0, weatherExponent: 1, shapeAlteringBias: 0.35, coverageFilterWidth: 0.5 }
]

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
  const [shapeVolume, detailVolume, weather] = await Promise.all([
    loadVolume(`${ASSETS}shape.bin`, 128),
    loadVolume(`${ASSETS}shape_detail.bin`, 32),
    loadWeather(`${ASSETS}local_weather.png`)
  ])

  const { layers } = options
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

  const stage: CompositeStage = (input, depth) => {
    // TYPE-BRIDGE: takram's uniforms are typed against @types/three 0.184.
    const ctx = atmosphereContext as unknown as {
      matrixWorldToECEF: Node
      matrixECEFToWorld: Node
      sunDirectionECEF: Node
      altitudeCorrectionECEF: Node
      correctAltitude: boolean
      parametersNode: { worldToUnit: Node; bottomRadius: Node }
    }
    const sunDirectionECEF = asNode<'vec3'>(ctx.sunDirectionECEF)
    const sunDirection = asNode<'mat4'>(ctx.matrixECEFToWorld).mul(vec4(sunDirectionECEF, 0)).xyz.normalize()
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

    const weatherNode = texture(weather)
    const shapeNode = texture3D(shapeVolume)
    const detailNode = texture3D(detailVolume)

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
          jitter: asNode<'float'>(stbn)
        })
      ).toVar() as unknown as { element(index: number): Node<'vec4'> }
      const cloud = result.element(0)
      const depthVelocity = result.element(1)
      const direction = result.element(2).xyz
      const hazeFar = result.element(2).w

      // Aerial perspective between the camera and the clouds' front (applyAerialPerspective).
      // Where there are no clouds the colour is 0 and the result does not matter; the distance is
      // capped there so the atmosphere functions get a finite point. Inside a cloud the front
      // can be at the camera, where the atmosphere function divides 0 by 0, so it is kept at
      // least 1 m away.
      const front = cameraPosition.add(direction.mul(depthVelocity.x.clamp(1, 1e6)))
      const toFront = asNode(
        getIndirectLuminanceToPoint(cameraUnit, toUnit(front), float(0), sunDirectionECEF)
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
          hazeDistance: hazeFar.sub(near).max(0),
          relativeCamera: cameraPosition.sub(earthCenter),
          earthRadius,
          near,
          sunDirection,
          groundSunE: groundLight.get('direct'),
          groundSkyE: groundLight.get('indirect'),
          coverage,
          phase,
          skyLightScale: light.w,
          haze: hazeParameters,
          shadowLength: float(0)
        })
      )
      return { color, depthVelocity }
    }

    const resolve: CloudPassInputs['resolve'] = ({
      color,
      depthVelocity,
      history,
      ownedOffset
    }) =>
      asNode<'vec4'>(
        functions.cloudsResolve({
          coord: ivec2(screenCoordinate.xy.floor()),
          uv: screenUV,
          colorTexture: color,
          colorSampler: sampler(color),
          depthVelocityTexture: depthVelocity,
          historyTexture: history,
          historySampler: sampler(history),
          ownedOffset: ivec2(ownedOffset),
          // takram's CloudsResolveMaterial defaults.
          varianceGamma: float(2),
          temporalAlpha: float(0.1)
        })
      )

    return asNode<'vec4'>(
      new CloudsNode(input, camera, {
        march: marchPixel,
        resolve,
        temporalUpscale: options.features.has('TEMPORAL_UPSCALE')
      })
    )
  }

  return { stage, coverage, setTime }
}
