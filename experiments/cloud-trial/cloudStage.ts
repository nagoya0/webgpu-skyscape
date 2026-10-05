// Trial (ideas.md, next stage 1): the heavy work in WGSL, connected with wgslFn; TSL only
// gathers the inputs.
import { getSplitScalarIlluminance, type AtmosphereContext } from '@takram/three-atmosphere/webgpu'
import {
  float,
  frameId,
  perspectiveDepthToViewZ,
  screenUV,
  select,
  time,
  uniform,
  vec3,
  vec4,
  wgslFn
} from 'three/tsl'
import type { Node, PerspectiveCamera } from 'three/webgpu'

import { asNode, type CompositeStage } from '../../src/render/pipeline'
import cloudDensityCode from './wgsl/cloudDensity.wgsl?raw'
import cloudsCode from './wgsl/clouds.wgsl?raw'
import fbm3Code from './wgsl/fbm3.wgsl?raw'
import hash3Code from './wgsl/hash3.wgsl?raw'
import noise3Code from './wgsl/noise3.wgsl?raw'
import phaseHGCode from './wgsl/phaseHG.wgsl?raw'
import portedSampleWeatherCode from './wgsl/portedSampleWeather.wgsl?raw'

// TYPE-BRIDGE: @types/three 0.186 does not accept a wgslFn result as an include, although
// Three.js itself does (the result proxies the FunctionNode).
type Include = Parameters<typeof wgslFn>[1] extends (infer T)[] | undefined ? T : never
const include = (fn: unknown): Include => fn as Include

const hash3 = wgslFn(hash3Code)
const noise3 = wgslFn(noise3Code, [include(hash3)])
const fbm3 = wgslFn(fbm3Code, [include(noise3)])
const cloudDensity = wgslFn(cloudDensityCode, [include(fbm3)])
const phaseHG = wgslFn(phaseHGCode)
// Port test only: compiled with the shader but not called (?ported=0 leaves it out).
const portedSampleWeather = wgslFn(portedSampleWeatherCode)
const withPortTest = new URLSearchParams(location.search).get('ported') !== '0'
const clouds = wgslFn(cloudsCode, [
  include(cloudDensity),
  include(phaseHG),
  ...(withPortTest ? [include(portedSampleWeather)] : [])
])

export interface CloudTrialOptions {
  base: number
  top: number
}

export function createCloudStage(
  atmosphereContext: AtmosphereContext,
  camera: PerspectiveCamera,
  options: CloudTrialOptions
): { stage: CompositeStage; base: { value: number }; top: { value: number } } {
  const base = uniform(options.base)
  const top = uniform(options.top)

  // Post-processing draws a full-screen quad with its own camera, so the camera accessors of
  // three/tsl (cameraWorldMatrix, cameraNear, ...) describe that quad camera there, not the
  // scene camera. The scene camera's values are passed in explicitly. The matrices are the
  // camera's own objects, updated in place every frame.
  const cameraWorld = uniform(camera.matrixWorld)
  const projectionInverse = uniform(camera.projectionMatrixInverse)
  const near = uniform(camera.near).onRenderUpdate(() => camera.near)
  const far = uniform(camera.far).onRenderUpdate(() => camera.far)
  // The camera has no parent, so its position is its world position.
  const cameraPosition = uniform(camera.position)

  const stage: CompositeStage = (input, depth) => {
    // Sun direction and illuminance from the atmosphere, evaluated in the middle of the layer
    // above the camera. TYPE-BRIDGE: takram's uniforms are typed against @types/three 0.184.
    const ctx = atmosphereContext as unknown as {
      matrixWorldToECEF: Node
      matrixECEFToWorld: Node
      sunDirectionECEF: Node
      altitudeCorrectionECEF: Node
      correctAltitude: boolean
      parametersNode: { worldToUnit: Node }
    }
    const sunDirectionECEF = asNode<'vec3'>(ctx.sunDirectionECEF)
    const sunDirection = asNode<'mat4'>(ctx.matrixECEFToWorld)
      .mul(vec4(sunDirectionECEF, 0))
      .xyz.normalize()
    const layerPoint = vec3(cameraPosition.x, base.add(top).mul(0.5), cameraPosition.z)
    let pointECEF = asNode<'mat4'>(ctx.matrixWorldToECEF).mul(vec4(layerPoint, 1)).xyz
    if (ctx.correctAltitude) {
      pointECEF = pointECEF.add(asNode<'vec3'>(ctx.altitudeCorrectionECEF))
    }
    const pointUnit = pointECEF.mul(asNode<'float'>(ctx.parametersNode.worldToUnit))
    const illuminance = asNode(getSplitScalarIlluminance(pointUnit, sunDirectionECEF)) as unknown as {
      get(name: string): Node<'vec3'>
    }

    // Reversed Z (ADR 0015): the sky has depth 0.
    const sceneDepth = depth.sample(screenUV).r
    const viewZ = select(
      sceneDepth.lessThanEqual(0),
      float(-1e9),
      perspectiveDepthToViewZ(sceneDepth, near, far)
    )

    return asNode<'vec4'>(
      clouds({
        color: input,
        viewZ,
        uv: screenUV,
        projectionInverse,
        cameraWorld,
        sunDirection,
        sunE: illuminance.get('direct'),
        skyE: illuminance.get('indirect'),
        base,
        top,
        time,
        frame: float(frameId)
      })
    )
  }

  return { stage, base, top }
}
