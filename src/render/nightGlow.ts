// The faint light of a night without the moon (ADR 0041): the night sky's own glow (airglow, and
// light pollution, brighter towards the horizon) and the light it casts on the ground. takram's
// sky is lit by the sun and the moon only, so with neither above the horizon the night was black.
// Given in physical units and multiplied by takram's luminance scale with the pre-exposure, so it
// counts only at night and stays in proportion with the moonlight.
import { float, mix, pow, screenUV, select, uniform, vec2, vec3, vec4 } from 'three/tsl'
import { AmbientLight, Color, type Node, type PerspectiveCamera } from 'three/webgpu'

import type { CompositeStage } from './pipeline'

/**
 * The night sky's luminance overhead and at the horizon, in cd/m²: about a suburban sky. Twice
 * as much read better without the moon but lit the horizon too much under a full moon (the
 * maintainer, 2026-10-08).
 */
export const NIGHT_SKY_ZENITH = 0.003
export const NIGHT_SKY_HORIZON = 0.015
/** A little warm, from the light of towns. */
const NIGHT_SKY_COLOR = new Color(1.0, 0.9, 0.78)
/** The illuminance the night sky gives the ground, in lux. */
export const NIGHT_GROUND_ILLUMINANCE = 0.02

export interface NightGlow {
  /** Adds the night sky's glow where the sky shows; composite it before the clouds. */
  stage: CompositeStage
  /** The night sky's light on the scene; add it to the scene. */
  light: AmbientLight
  /** Follows the luminance scale (pre-exposure); call when it changes. */
  update(): void
}

export function createNightGlow(camera: PerspectiveCamera, luminanceScale: Node<'float'> & { value: number }): NightGlow {
  const projectionInverse = uniform(camera.projectionMatrixInverse)
  const cameraWorld = uniform(camera.matrixWorld)
  const color = vec3(NIGHT_SKY_COLOR.r, NIGHT_SKY_COLOR.g, NIGHT_SKY_COLOR.b)

  const stage: CompositeStage = (input, depth) => {
    // The view direction of the pixel, in world space (x north, y up, z east).
    const ndc = vec2(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)))
    const view = projectionInverse.mul(vec4(ndc, 1, 1))
    const direction = cameraWorld.mul(vec4(view.xyz.div(view.w), 0)).xyz.normalize()
    // Brighter towards the horizon, where the light of towns is seen through more air.
    const towardsHorizon = pow(float(1).sub(direction.y.max(0)), 4)
    const luminance = mix(float(NIGHT_SKY_ZENITH), float(NIGHT_SKY_HORIZON), towardsHorizon)
    // Reversed Z (ADR 0015): the sky has depth 0.
    const sky = select(depth.sample(screenUV).r.lessThanEqual(0), float(1), float(0))
    return input.add(vec4(color.mul(luminance).mul(luminanceScale).mul(sky), 0))
  }

  const light = new AmbientLight(NIGHT_SKY_COLOR, 0)
  return {
    stage,
    light,
    update() {
      light.intensity = NIGHT_GROUND_ILLUMINANCE * luminanceScale.value
    }
  }
}
