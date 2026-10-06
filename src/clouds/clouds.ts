// Volumetric clouds (ADR 0013, ADR 0022): the ray marching is WGSL ported from
// @takram/three-clouds; TSL gathers the inputs. Step C1 of the cloud stage (ideas.md): drawn at
// full resolution, composited right after the aerial perspective.
import { getSplitScalarIlluminance, type AtmosphereContext } from '@takram/three-atmosphere/webgpu'
import {
  float,
  frameId,
  perspectiveDepthToViewZ,
  sampler,
  screenUV,
  select,
  texture,
  texture3D,
  uniform,
  vec3,
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
  Vector3,
  Vector4,
  type Node,
  type PerspectiveCamera,
  type Texture
} from 'three/webgpu'

import { ecefToWorld, type LocalFrame } from '../geo/localFrame'
import { asNode, type CompositeStage } from '../render/pipeline'
import cloudMediaCode from './wgsl/cloudMedia.wgsl?raw'
import cloudMultipleScatteringCode from './wgsl/cloudMultipleScattering.wgsl?raw'
import cloudsCode from './wgsl/clouds.wgsl?raw'
import cloudWeatherCode from './wgsl/cloudWeather.wgsl?raw'
import raySphereCode from './wgsl/raySphere.wgsl?raw'
import remapClamped4Code from './wgsl/remapClamped4.wgsl?raw'

// TYPE-BRIDGE: @types/three 0.186 does not accept a wgslFn result as an include, although
// Three.js itself does (the result proxies the FunctionNode).
type Include = Parameters<typeof wgslFn>[1] extends (infer T)[] | undefined ? T : never
const include = (fn: unknown): Include => fn as Include

const remapClamped4 = wgslFn(remapClamped4Code)
const raySphere = wgslFn(raySphereCode)
const cloudWeather = wgslFn(cloudWeatherCode, [include(remapClamped4)])
const cloudMedia = wgslFn(cloudMediaCode, [include(remapClamped4)])
const cloudMultipleScattering = wgslFn(cloudMultipleScatteringCode)
const cloudsFn = wgslFn(cloudsCode, [
  include(raySphere),
  include(cloudWeather),
  include(cloudMedia),
  include(cloudMultipleScattering)
])

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
}

export const DEFAULT_CLOUDS: CloudOptions = {
  layers: DEFAULT_LAYERS,
  coverage: 0.3,
  weatherTileMetres: 100_000
}

export interface Clouds {
  stage: CompositeStage
  coverage: { value: number }
}

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
  const shape = vec4(0.0003, 0.006, 1 / options.weatherTileMetres, coverage)
  // (scattering coefficient, powder scale, powder exponent, sky light scale)
  const light = uniform(new Vector4(1, 0.8, 150, 1))
  // takram's default anisotropy: 0.7 and -0.2, mixed half and half.
  const phase = uniform(new Vector4(0.7, -0.2, 0.5, 0))
  // (min step, max step, perspective step scale, max distance): takram's high preset steps.
  const march = uniform(new Vector4(50, 1000, 1.01, 80_000))
  const offsets = uniform(new Vector4())

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
      parametersNode: { worldToUnit: Node }
    }
    const sunDirectionECEF = asNode<'vec3'>(ctx.sunDirectionECEF)
    const sunDirection = asNode<'mat4'>(ctx.matrixECEFToWorld).mul(vec4(sunDirectionECEF, 0)).xyz.normalize()
    // Sun and sky light in the middle of the main cumulus layer above the camera.
    const layerMiddle = (layers[1] ?? layers[0]).altitude + (layers[1] ?? layers[0]).height / 2
    const point = vec3(cameraPosition.x, float(layerMiddle), cameraPosition.z)
    let pointECEF = asNode<'mat4'>(ctx.matrixWorldToECEF).mul(vec4(point, 1)).xyz
    if (ctx.correctAltitude) pointECEF = pointECEF.add(asNode<'vec3'>(ctx.altitudeCorrectionECEF))
    const pointUnit = pointECEF.mul(asNode<'float'>(ctx.parametersNode.worldToUnit))
    const illuminance = asNode(getSplitScalarIlluminance(pointUnit, sunDirectionECEF)) as unknown as {
      get(name: string): Node<'vec3'>
    }

    // Reversed Z (ADR 0015): the sky has depth 0.
    const sceneDepth = depth.sample(screenUV).r
    const viewZ = select(sceneDepth.lessThanEqual(0), float(-1e9), perspectiveDepthToViewZ(sceneDepth, near, far))

    const weatherNode = texture(weather)
    const shapeNode = texture3D(shapeVolume)
    const detailNode = texture3D(detailVolume)
    return asNode<'vec4'>(
      cloudsFn({
        color: input,
        viewZ,
        uv: screenUV,
        projectionInverse,
        cameraWorld,
        sunDirection,
        sunE: illuminance.get('direct'),
        skyE: illuminance.get('indirect'),
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
        offsets,
        weatherTexture: weatherNode,
        weatherSampler: sampler(weatherNode),
        shapeTexture: shapeNode,
        shapeSampler: sampler(shapeNode),
        detailTexture: detailNode,
        detailSampler: sampler(detailNode),
        frame: float(frameId)
      })
    )
  }

  return { stage, coverage }
}
