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
import { Ellipsoid } from '@takram/three-geospatial'
import { context } from 'three/tsl'
import { Vector3, type Camera, type Node, type WebGPURenderer } from 'three/webgpu'

import type { LocalFrame } from '../geo/localFrame'

export interface Atmosphere {
  context: AtmosphereContext
  /** The sun's light. */
  light: AtmosphereLight
  /**
   * The moon's light, at takram's fixed full-moon brightness (2.5e-6 of the sun's), whatever the
   * moon's phase (the maintainer, 2026-10-08: the phase does not matter).
   */
  moonLight: AtmosphereLight
  /** The sun's altitude above the horizon at the frame's origin, in degrees, after setDate. */
  readonly sunAltitude: number
  /**
   * Multiplies all of the atmosphere's luminance (sky, sun, moon, stars, their light and the
   * aerial perspective) by a factor, through takram's luminance scale (patched into a uniform).
   */
  setPreExposure(factor: number): void
  /**
   * takram's luminance scale with the pre-exposure: multiplies a luminance in cd/m² (or an
   * illuminance in lux) into the units the scene is drawn in, for light added outside takram.
   */
  luminanceScale: Node<'float'> & { value: number }
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
  const moonLight = new AtmosphereLight(1, 'moon')
  const observerECEF = new Vector3()
  const up = new Vector3()
  const sunECEF = new Vector3()
  let sunAltitude = 90
  // TYPE-BRIDGE: luminanceScaleNode is added by this project's patch of @takram/three-atmosphere.
  const luminanceScale = (atmosphereContext as unknown as { luminanceScaleNode: Node<'float'> & { value: number } })
    .luminanceScaleNode
  const baseLuminanceScale = luminanceScale.value

  return {
    context: atmosphereContext,
    light,
    moonLight,
    luminanceScale,
    get sunAltitude() {
      return sunAltitude
    },

    setPreExposure(factor) {
      luminanceScale.value = baseLuminanceScale * factor
    },

    setFrame(frame) {
      atmosphereContext.matrixWorldToECEF.value.copy(frame.worldToECEF)
      // The sun and moon directions are computed for an observer at the origin; across the
      // demo area the difference is far below what can be seen.
      observerECEF.copy(frame.originECEF)
      Ellipsoid.WGS84.getSurfaceNormal(observerECEF, up)
    },

    setDate(date) {
      const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = atmosphereContext
      getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
      getSunDirectionECI(date, sunDirectionECEF.value, observerECEF).applyMatrix4(matrixECIToECEF.value)
      getMoonDirectionECI(date, moonDirectionECEF.value, observerECEF).applyMatrix4(matrixECIToECEF.value)
      sunECEF.copy(sunDirectionECEF.value).normalize()
      sunAltitude = (Math.asin(Math.min(Math.max(sunECEF.dot(up), -1), 1)) * 180) / Math.PI
    },

    dispose() {
      atmosphereContext.dispose()
    }
  }
}
