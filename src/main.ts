import { PerspectiveCamera, Scene, Timer, WebGPURenderer } from 'three/webgpu'

import { createAtmosphere } from './atmosphere/atmosphere'
import { createCockpitCamera } from './camera/cockpitCamera'
import { createAircraftState, pathDuration, samplePath } from './flight/path'
import { createPlaceholderPath, DEFAULT_RACETRACK } from './flight/placeholderPath'
import { createLocalFrame } from './geo/localFrame'
import { requestDevice } from './gpu/support'
import { readParams } from './params'
import { createPipeline } from './render/pipeline'
import { createFacadeMaterial } from './scene/facadeMaterial'
import { createBuildings, plateauBuildingUrls } from './scene/plateauBuildings'
import { createPlaceholderGround } from './scene/placeholderGround'
import { createTerrain } from './terrain/terrain'
import { showAttribution } from './ui/attribution'
import { showGuidance } from './ui/guidance'
import { showLoading } from './ui/loading'

// The middle of the three wards tried first (ADR 0023), near Shimbashi. The course and with it
// the origin may still move.
const ORIGIN = { longitude: 139.757, latitude: 35.665, height: 0 }

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

  const buildings = params.buildings
    ? createBuildings(
        frame,
        camera,
        plateauBuildingUrls(params.textures),
        params.textures ? null : createFacadeMaterial()
      )
    : null
  if (buildings) scene.add(buildings.group)

  const terrain = params.terrain ? createTerrain(frame) : null
  if (terrain) scene.add(terrain.group)
  showAttribution()

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
    sinkPerG: params.sink,
    sinkSeconds: params.sinkTime
  })
  const state = createAircraftState()

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  })

  // The flight holds at its start while the first tiles load, so the demo begins in place.
  const loading = showLoading()
  let loaded = false
  const LOADING_TIMEOUT = 30 // seconds; start anyway after this
  // Tile loading pauses briefly between levels of the tile tree, so the queue must stay empty
  // for a while before loading counts as done.
  const SETTLE_TIME = 1.5 // seconds
  let settledSince: number | null = null

  const timer = new Timer()
  let flightTime = params.flightStart
  let first = true
  renderer.setAnimationLoop(time => {
    timer.update(time)
    // Clamp long frames, such as after a hidden tab, so the head lag does not jump.
    const dt = Math.min(timer.getDelta(), 0.1)
    if (!loaded) {
      const elapsed = timer.getElapsed()
      const stats = buildings?.stats()
      const ground = terrain?.stats()
      const settled =
        (!stats || (stats.loaded > 0 && stats.loading === 0)) &&
        (!ground || (ground.ready > 0 && ground.loading === 0))
      settledSince = settled ? (settledSince ?? elapsed) : null
      if ((settledSince !== null && elapsed - settledSince > SETTLE_TIME) || elapsed > LOADING_TIMEOUT) {
        loaded = true
        loading.hide()
      } else {
        const parts = []
        if (stats && stats.loading > 0) parts.push(`buildings ${stats.loading}`)
        if (ground && ground.loading > 0) parts.push(`terrain ${ground.loading}`)
        if (parts.length > 0) loading.setText(`Loading… ${parts.join(', ')} tiles to go`)
      }
    }
    debug.loaded = loaded
    if (loaded && !params.paused) flightTime += dt
    samplePath(path, flightTime, state)
    cockpit.update(state, first ? 0 : dt, timer.getElapsed())
    first = false
    if (buildings) {
      buildings.update(container.clientWidth, container.clientHeight)
      debug.tiles = buildings.stats()
      if (params.paused) {
        debug.buildingBounds = buildings.bounds()
        debug.traversal = buildings.traversal()
      }
    }
    if (terrain) {
      terrain.update(camera, container.clientHeight)
      debug.terrain = terrain.stats()
    }
    debug.camera = camera.position.toArray().map(Math.round)
    debug.flightTime = Number(flightTime.toFixed(2))
    debug.loadFactor = Number(state.loadFactor.toFixed(2))
    pipeline.render()
  })
}

start().catch((error: unknown) => {
  console.error(error)
  showGuidance('The demo failed to start.', [String(error)])
})
