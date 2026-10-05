// Cloud trial page. Same scene, flight and parameters as the main page (src/params.ts), plus:
//   clouds=0          leave the clouds out, for comparison
//   cloudbase=metres  bottom of the layer (default 1200)
//   cloudtop=metres   top of the layer (default 2200)
//   measure           render 120 frames as fast as possible and report ms per frame
import { PerspectiveCamera, Scene, Timer, WebGPURenderer } from 'three/webgpu'

import { createAtmosphere } from '../../src/atmosphere/atmosphere'
import { createCockpitCamera } from '../../src/camera/cockpitCamera'
import { createAircraftState, samplePath } from '../../src/flight/path'
import { createPlaceholderPath, DEFAULT_RACETRACK } from '../../src/flight/placeholderPath'
import { createLocalFrame } from '../../src/geo/localFrame'
import { requestDevice } from '../../src/gpu/support'
import { readParams } from '../../src/params'
import { createPipeline } from '../../src/render/pipeline'
import { createPlaceholderGround } from '../../src/scene/placeholderGround'
import { createCloudStage } from './cloudStage'

const params = readParams(location.search)
const query = new URLSearchParams(location.search)
const withClouds = query.get('clouds') !== '0'
const measure = query.has('measure')
const cloudBase = Number(query.get('cloudbase') ?? 1200)
const cloudTop = Number(query.get('cloudtop') ?? 2200)

const debug: Record<string, unknown> = { withClouds }
;(window as unknown as { __debug: unknown }).__debug = debug

async function start(): Promise<void> {
  const support = await requestDevice()
  if (!support.ok) {
    debug.error = support.reason
    return
  }
  const renderer = new WebGPURenderer({
    device: support.device,
    antialias: false,
    reversedDepthBuffer: true
  })
  await renderer.init()
  const container = document.getElementById('app')!
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)
  debug.size = `${renderer.domElement.width}x${renderer.domElement.height}`

  const frame = createLocalFrame(139.8, 35.6, 0)
  const camera = new PerspectiveCamera(params.fov, container.clientWidth / container.clientHeight, 0.1, 1e7)
  const scene = new Scene()
  const atmosphere = createAtmosphere(renderer, camera)
  atmosphere.setFrame(frame)
  atmosphere.setDate(params.date)
  scene.add(atmosphere.light, createPlaceholderGround())

  const stages = withClouds
    ? [createCloudStage(atmosphere.context, camera, { base: cloudBase, top: cloudTop }).stage]
    : []
  const pipeline = createPipeline(renderer, scene, camera, stages)
  pipeline.exposure.value = params.exposure

  const { path } = createPlaceholderPath(frame, {
    ...DEFAULT_RACETRACK,
    speed: params.speed,
    height: params.altitude,
    bankDegrees: params.bank,
    rollRateDegrees: params.rollRate
  })
  const cockpit = createCockpitCamera(camera, frame, {
    lagSeconds: params.lag,
    shakeDegrees: params.shake,
    shakePerG: params.shakePerG,
    shakeInCloud: params.shakeInCloud,
    sinkPerG: params.sink,
    sinkSeconds: params.sinkTime
  })
  const state = createAircraftState()

  if (measure) {
    samplePath(path, params.flightStart, state)
    cockpit.update(state, 0, 0)
    for (let i = 0; i < 20; i++) {
      pipeline.render()
      await support.device.queue.onSubmittedWorkDone()
    }
    const frames = 120
    const begin = performance.now()
    for (let i = 0; i < frames; i++) {
      pipeline.render()
      await support.device.queue.onSubmittedWorkDone()
    }
    debug.msPerFrame = Number(((performance.now() - begin) / frames).toFixed(2))
    debug.done = true
    return
  }

  const timer = new Timer()
  let flightTime = params.flightStart
  let first = true
  renderer.setAnimationLoop(t => {
    timer.update(t)
    const dt = Math.min(timer.getDelta(), 0.1)
    if (!params.paused) flightTime += dt
    samplePath(path, flightTime, state)
    cockpit.update(state, first ? 0 : dt, timer.getElapsed())
    first = false
    debug.flightTime = Number(flightTime.toFixed(2))
    pipeline.render()
  })
  debug.done = true
}

start().catch((error: unknown) => {
  debug.error = String(error)
  console.error(error)
})
