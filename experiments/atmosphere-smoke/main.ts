// Checks that @takram/three-atmosphere/webgpu loads and renders on the installed Three.js
// (ADR 0014). Draws the sky from 500 m above the ground at a fixed time.
import {
  getECIToECEFRotationMatrix,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import { AtmosphereContext, skyBackground } from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { context } from 'three/tsl'
import { PerspectiveCamera, Scene, Vector3, WebGPURenderer, type Node } from 'three/webgpu'

import { requestDevice } from '../../src/gpu/support'

const debug: Record<string, unknown> = {}
;(window as unknown as { __debug: unknown }).__debug = debug

async function main(): Promise<void> {
  const support = await requestDevice()
  if (!support.ok) {
    debug.error = support.reason
    return
  }
  const renderer = new WebGPURenderer({ device: support.device, reversedDepthBuffer: true })
  renderer.highPrecision = true
  await renderer.init()
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)

  const position = new Geodetic(radians(139.7), radians(35.68), 500).toECEF()
  const east = new Vector3()
  const north = new Vector3()
  const up = new Vector3()
  Ellipsoid.WGS84.getEastNorthUpVectors(position, east, north, up)
  const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 1e6)
  camera.position.copy(position)
  camera.up.copy(up)
  // Look west and slightly up, towards the late-afternoon sun.
  camera.lookAt(position.clone().sub(east).add(up.clone().multiplyScalar(0.15)))

  const atmosphereContext = new AtmosphereContext()
  atmosphereContext.camera = camera
  renderer.contextNode = context({
    // TYPE-BRIDGE: @types/three 0.186 types the context value as unknown.
    ...(renderer.contextNode.value as object),
    getAtmosphere: () => atmosphereContext
  })
  const date = new Date('2026-10-04T07:30:00Z') // 16:30 in Tokyo
  const matrix = getECIToECEFRotationMatrix(date, atmosphereContext.matrixECIToECEF.value)
  getSunDirectionECI(date, atmosphereContext.sunDirectionECEF.value, position).applyMatrix4(matrix)

  const scene = new Scene()
  // TYPE-BRIDGE: takram's types are built against @types/three 0.184.
  scene.backgroundNode = skyBackground() as unknown as Node
  let frames = 0
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera)
    debug.frames = ++frames
  })
  debug.done = true
}

main().catch((error: unknown) => {
  debug.error = String(error)
  console.error(error)
})
