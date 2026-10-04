import { PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu'

import { createAtmosphere } from './atmosphere/atmosphere'
import { attachDragLook } from './camera/dragLook'
import { requestDevice } from './gpu/support'
import { createPipeline } from './render/pipeline'
import { createPlaceholderGround } from './scene/placeholderGround'
import { showGuidance } from './ui/guidance'
import { createTimeSlider } from './ui/timeSlider'

// Placeholder viewpoint until the area is chosen (ADR 0006): above Tokyo Bay.
const ORIGIN = { longitude: 139.8, latitude: 35.6, height: 0 }
const CAMERA_ALTITUDE = 1000 // metres above the origin

// ?time=HH:MM (JST) and ?heading=degrees set the starting view, for checks and comparisons.
const params = new URLSearchParams(location.search)
const timeParam = /^(\d{1,2}):(\d{2})$/.exec(params.get('time') ?? '')
const initialMinutes = timeParam ? Number(timeParam[1]) * 60 + Number(timeParam[2]) : 16 * 60 + 30
const initialHeading = Number(params.get('heading') ?? 270)

async function start(): Promise<void> {
  const support = await requestDevice()
  if (!support.ok) {
    showGuidance(support.reason, support.details)
    return
  }
  const { device } = support

  // Reversed Z (ADR 0015).
  const renderer = new WebGPURenderer({ device, antialias: false, reversedDepthBuffer: true })
  await renderer.init()
  // Passing a device should rule out the WebGL 2 fallback; check anyway.
  if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
    renderer.dispose()
    showGuidance('The renderer could not start on WebGPU.')
    return
  }

  device.lost.then(info => {
    if (info.reason !== 'destroyed') {
      showGuidance('The GPU device was lost. Reload the page to try again.', [info.message])
    }
  })

  const container = document.getElementById('app')!
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)

  const camera = new PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1e7)
  camera.position.set(0, CAMERA_ALTITUDE, 0)
  attachDragLook(renderer.domElement, camera, initialHeading, 5)

  const scene = new Scene()
  const atmosphere = createAtmosphere(renderer, camera)
  atmosphere.setOrigin(ORIGIN.longitude, ORIGIN.latitude, ORIGIN.height)
  scene.add(atmosphere.light, createPlaceholderGround())

  const pipeline = createPipeline(renderer, scene, camera)

  createTimeSlider(document.body, new Date(), initialMinutes, date => {
    atmosphere.setDate(date)
  })

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  })

  renderer.setAnimationLoop(() => {
    pipeline.render()
  })
}

start().catch((error: unknown) => {
  console.error(error)
  showGuidance('The demo failed to start.', [String(error)])
})
