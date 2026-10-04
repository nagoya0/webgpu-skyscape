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
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { context } from 'three/tsl'
import { Vector3, type Camera, type WebGPURenderer } from 'three/webgpu'

export interface Atmosphere {
  context: AtmosphereContext
  light: AtmosphereLight
  /** Places the world origin at a point on the earth. World axes: x north, y up, z east. */
  setOrigin(longitude: number, latitude: number, height: number): void
  /** Moves the sun, moon and stars to their positions at the given time. */
  setDate(date: Date): void
  dispose(): void
}

export function createAtmosphere(renderer: WebGPURenderer, camera: Camera): Atmosphere {
  renderer.library.addLight(
    // TYPE-BRIDGE: takram's types are built against @types/three 0.184.
    AtmosphereLightNode as unknown as Parameters<typeof renderer.library.addLight>[0],
    AtmosphereLight
  )

  const atmosphereContext = new AtmosphereContext()
  atmosphereContext.camera = camera
  renderer.contextNode = context({
    // TYPE-BRIDGE: @types/three 0.186 types the context value as unknown.
    ...(renderer.contextNode.value as object),
    getAtmosphere: () => atmosphereContext
  })

  const light = new AtmosphereLight()
  const originECEF = new Vector3()

  return {
    context: atmosphereContext,
    light,

    setOrigin(longitude, latitude, height) {
      new Geodetic(radians(longitude), radians(latitude), height).toECEF(originECEF)
      // Rebasing the world on a local frame keeps coordinates small, which 32-bit floats need
      // near the camera.
      Ellipsoid.WGS84.getNorthUpEastFrame(originECEF, atmosphereContext.matrixWorldToECEF.value)
    },

    setDate(date) {
      const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = atmosphereContext
      getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
      getSunDirectionECI(date, sunDirectionECEF.value, originECEF).applyMatrix4(matrixECIToECEF.value)
      getMoonDirectionECI(date, moonDirectionECEF.value, originECEF).applyMatrix4(matrixECIToECEF.value)
    },

    dispose() {
      atmosphereContext.dispose()
    }
  }
}
