import { PerspectiveCamera, Scene, Timer, WebGPURenderer, type Mesh } from 'three/webgpu'

import { createAtmosphere } from './atmosphere/atmosphere'
import {
  CLOUD_FEATURES,
  createClouds,
  DEFAULT_CLOUD_FEATURES,
  DEFAULT_CLOUDS,
  type CloudFeature
} from './clouds/clouds'
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
  const renderer = new WebGPURenderer({
    device,
    antialias: false,
    reversedDepthBuffer: true,
    // GPU timestamps for ?measure only; they need the 'timestamp-query' feature.
    trackTimestamp: params.measure && device.features.has('timestamp-query')
  })
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
  const atmosphere = createAtmosphere(renderer, camera, params.raymarch)
  atmosphere.setFrame(frame)
  atmosphere.setDate(params.date)
  scene.add(atmosphere.light, createPlaceholderGround())

  const buildings = params.buildings
    ? createBuildings(
        frame,
        camera,
        plateauBuildingUrls(params.textures),
        params.textures ? null : createFacadeMaterial(),
        params.tileError,
        undefined,
        params.drawMode
      )
    : null
  if (buildings) scene.add(buildings.group)

  const terrain = params.terrain ? createTerrain(frame) : null
  if (terrain) scene.add(terrain.group)
  showAttribution()

  const cloudFeatures = new Set<CloudFeature>(DEFAULT_CLOUD_FEATURES)
  for (const [name, on] of Object.entries(params.cloudFeatures)) {
    if (!(CLOUD_FEATURES as readonly string[]).includes(name)) {
      console.warn(`Unknown cloud feature "${name}"; known: ${CLOUD_FEATURES.join(', ')}`)
      continue
    }
    if (on) cloudFeatures.add(name as CloudFeature)
    else cloudFeatures.delete(name as CloudFeature)
  }
  debug.cloudFeatures = [...cloudFeatures]
  const clouds = params.clouds
    ? await createClouds(atmosphere.context, camera, frame, {
        ...DEFAULT_CLOUDS,
        coverage: params.coverage,
        features: cloudFeatures
      })
    : null
  const pipeline = createPipeline(renderer, scene, camera, clouds ? [clouds.stage] : [], {
    lensFlare: params.flare
  })
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
    if (loaded && params.measure && !measuring) {
      measuring = true
      renderer.setAnimationLoop(null)
      void measure(timer.getElapsed())
      return
    }
    step(loaded && !params.paused ? dt : 0, timer.getElapsed())
  })

  let lastBoundsTime = -Infinity

  // One frame: move the aircraft, update the tiles, draw.
  function step(flightDelta: number, elapsed: number): void {
    flightTime += flightDelta
    samplePath(path, flightTime, state)
    cockpit.update(state, first ? 0 : flightDelta, elapsed)
    first = false
    if (buildings) {
      buildings.update(container.clientWidth, container.clientHeight)
      debug.tiles = buildings.stats()
      // For checks while paused. bounds() visits every vertex, so once a second at most, and
      // never while measuring.
      if (params.paused && !params.measure && elapsed - lastBoundsTime > 1) {
        lastBoundsTime = elapsed
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
  }

  // ?measure: after loading, 180 frames of flight at 60 frames per second of flight time,
  // each waiting for the GPU to finish. Reported per frame:
  // - total: CPU and GPU one after the other, the worst case;
  // - cpu: until the commands are submitted (tile updates, scene traversal, encoding);
  // - gpu: GPU time from timestamp queries, where the device supports them.
  // A browser overlaps the CPU work of one frame with the GPU work of the previous one, so the
  // achievable frame time is closer to the larger of cpu and gpu than to total.
  let measuring = false
  async function measure(elapsed: number): Promise<void> {
    // `trackTimestamp` is missing from the type declarations of the backend in 0.186.
    const timestamps = (renderer.backend as unknown as { trackTimestamp: boolean }).trackTimestamp
    for (let i = 0; i < 20; i++) {
      step(params.paused ? 0 : 1 / 60, elapsed)
      await device.queue.onSubmittedWorkDone()
      if (timestamps) await renderer.resolveTimestampsAsync('render')
    }
    const times: number[] = []
    const cpuTimes: number[] = []
    const gpuTimes: number[] = []
    for (let i = 0; i < 180; i++) {
      const begin = performance.now()
      step(params.paused ? 0 : 1 / 60, elapsed + i / 60)
      cpuTimes.push(performance.now() - begin)
      await device.queue.onSubmittedWorkDone()
      times.push(performance.now() - begin)
      if (timestamps) gpuTimes.push((await renderer.resolveTimestampsAsync('render')) ?? 0)
    }
    times.sort((p, q) => p - q)
    cpuTimes.sort((p, q) => p - q)
    gpuTimes.sort((p, q) => p - q)
    const round = (value: number): number => Number(value.toFixed(2))
    let meshes = 0
    scene.traverseVisible(object => {
      if ((object as Mesh).isMesh) meshes++
    })
    debug.measure = {
      size: `${renderer.domElement.width}x${renderer.domElement.height}`,
      medianMs: round(times[90]),
      p95Ms: round(times[171]),
      maxMs: round(times[179]),
      cpuMedianMs: round(cpuTimes[90]),
      gpuMedianMs: gpuTimes.length ? round(gpuTimes[90]) : null,
      gpuP95Ms: gpuTimes.length ? round(gpuTimes[171]) : null,
      visibleMeshes: meshes
    }
    renderer.setAnimationLoop(t => {
      timer.update(t)
      step(params.paused ? 0 : Math.min(timer.getDelta(), 0.1), timer.getElapsed())
    })
  }
}

start().catch((error: unknown) => {
  console.error(error)
  showGuidance('The demo failed to start.', [String(error)])
})
