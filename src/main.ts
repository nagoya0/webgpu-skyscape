import { PerspectiveCamera, Scene, Timer, WebGPURenderer } from 'three/webgpu'

import { createAtmosphere } from './atmosphere/atmosphere'
import { createCockpitCamera } from './camera/cockpitCamera'
import { createAircraftState, pathDuration, samplePath } from './flight/path'
import { createPlaceholderPath, DEFAULT_RACETRACK } from './flight/placeholderPath'
import { createLocalFrame } from './geo/localFrame'
import { requestDevice } from './gpu/support'
import { readParams } from './params'
import { createPipeline } from './render/pipeline'
import { createPlaceholderGround } from './scene/placeholderGround'
import { showGuidance } from './ui/guidance'

// Placeholder origin until the area is chosen (ADR 0006): Tokyo Bay.
const ORIGIN = { longitude: 139.8, latitude: 35.6, height: 0 }

const params = readParams(location.search)

const debug: Record<string, unknown> = {}
;(window as unknown as { __debug: unknown }).__debug = debug

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

  const frame = createLocalFrame(ORIGIN.longitude, ORIGIN.latitude, ORIGIN.height)
  const camera = new PerspectiveCamera(
    params.fov,
    container.clientWidth / container.clientHeight,
    0.1,
    1e7
  )

  const scene = new Scene()
  const atmosphere = createAtmosphere(renderer, camera)
  atmosphere.setFrame(frame)
  atmosphere.setDate(params.date)
  scene.add(atmosphere.light, createPlaceholderGround())

  const pipeline = createPipeline(renderer, scene, camera)
  pipeline.exposure.value = params.exposure

  const { path, seamGap } = createPlaceholderPath(frame, {
    ...DEFAULT_RACETRACK,
    speed: params.speed,
    height: params.altitude,
    bankDegrees: params.bank,
    rollRateDegrees: params.rollRate
  })
  debug.date = params.date.toISOString()
  debug.pathSeconds = Number(pathDuration(path).toFixed(1))
  debug.seamGapMetres = Number(seamGap.toFixed(3))
  const cockpit = createCockpitCamera(camera, frame, {
    lagSeconds: params.lag,
    shakeDegrees: params.shake,
    shakePerG: params.shakePerG,
    shakeInCloud: params.shakeInCloud,
    sinkPerG: params.sink
  })
  const state = createAircraftState()

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  })

  const timer = new Timer()
  let flightTime = params.flightStart
  let first = true
  renderer.setAnimationLoop(time => {
    timer.update(time)
    // Clamp long frames, such as after a hidden tab, so the head lag does not jump.
    const dt = Math.min(timer.getDelta(), 0.1)
    if (!params.paused) flightTime += dt
    samplePath(path, flightTime, state)
    cockpit.update(state, first ? 0 : dt, timer.getElapsed())
    first = false
    debug.flightTime = Number(flightTime.toFixed(2))
    debug.loadFactor = Number(state.loadFactor.toFixed(2))
    pipeline.render()
  })
}

start().catch((error: unknown) => {
  console.error(error)
  showGuidance('The demo failed to start.', [String(error)])
})
