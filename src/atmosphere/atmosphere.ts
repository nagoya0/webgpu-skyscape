// The atmosphere from @takram/three-atmosphere (ADR 0005), and the one place where its types
// meet the installed @types/three.
import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import { context } from 'three/tsl'
import { Vector3, type Camera, type WebGPURenderer } from 'three/webgpu'

import type { LocalFrame } from '../geo/localFrame'

export interface Atmosphere {
  context: AtmosphereContext
  light: AtmosphereLight
  /** Uses the local frame for the world (ADR 0017). */
  setFrame(frame: LocalFrame): void
  /** Moves the sun, moon and stars to their positions at the given time. */
  setDate(date: Date): void
  dispose(): void
}

export function createAtmosphere(
  renderer: WebGPURenderer,
  camera: Camera,
  /**
   * Ray march the scattered light between the camera and the scene per pixel (takram's
   * default) instead of looking it up in the precomputed tables. Costs GPU time; the tables
   * can show precision artefacts.
   */
  raymarchScattering = true
): Atmosphere {
  renderer.library.addLight(
    // TYPE-BRIDGE: takram's types are built against @types/three 0.184.
    AtmosphereLightNode as unknown as Parameters<typeof renderer.library.addLight>[0],
    AtmosphereLight
  )

  const atmosphereContext = new AtmosphereContext()
  atmosphereContext.camera = camera
  atmosphereContext.raymarchScattering = raymarchScattering
  renderer.contextNode = context({
    // TYPE-BRIDGE: @types/three 0.186 types the context value as unknown.
    ...(renderer.contextNode.value as object),
    getAtmosphere: () => atmosphereContext
  })

  const light = new AtmosphereLight()
  const observerECEF = new Vector3()

  return {
    context: atmosphereContext,
    light,

    setFrame(frame) {
      atmosphereContext.matrixWorldToECEF.value.copy(frame.worldToECEF)
      // The sun and moon directions are computed for an observer at the origin; across the
      // demo area the difference is far below what can be seen.
      observerECEF.copy(frame.originECEF)
    },

    setDate(date) {
      const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = atmosphereContext
      getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
      getSunDirectionECI(date, sunDirectionECEF.value, observerECEF).applyMatrix4(matrixECIToECEF.value)
      getMoonDirectionECI(date, moonDirectionECEF.value, observerECEF).applyMatrix4(matrixECIToECEF.value)
    },

    dispose() {
      atmosphereContext.dispose()
    }
  }
}
