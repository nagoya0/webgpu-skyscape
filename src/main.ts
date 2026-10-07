import { PerspectiveCamera, Scene, Timer, Vector3, WebGPURenderer, type Mesh } from 'three/webgpu'

import { Geodetic } from '@takram/three-geospatial'

import { AREAS } from './areas'
import { createAtmosphere } from './atmosphere/atmosphere'
import {
  CLOUD_FEATURES,
  createClouds,
  DEFAULT_CLOUD_FEATURES,
  cloudLayers,
  DEFAULT_CLOUDS,
  type CloudFeature
} from './clouds/clouds'
import { createCockpitCamera } from './camera/cockpitCamera'
import { createDrops } from './effects/drops'
import { createInCloud } from './effects/inCloud'
import { createHud, loadHudFont } from './hud/hud'
import { drawHudDebug } from './hud/hudDebug'
import { drawAltitudeScale, FEET_PER_METRE } from './hud/altitudeScale'
import { drawVelocityScale, KNOTS_PER_METRE_PER_SECOND } from './hud/velocityScale'
import { createAircraftState, pathDuration, samplePath } from './flight/path'
import { createPlaceholderPath } from './flight/placeholderPath'
import { createLocalFrame, ecefToWorld } from './geo/localFrame'
import { requestDevice } from './gpu/support'
import { readParams } from './params'
import { createPipeline } from './render/pipeline'
import { createFacadeMaterial } from './scene/facadeMaterial'
import { createBuildings, plateauBuildingUrls } from './scene/plateauBuildings'
import { createPlaceholderGround } from './scene/placeholderGround'
import { createSeaSphere } from './terrain/seaSphere'
import { photoGrade } from './terrain/photoGrade'
import { createTerrain } from './terrain/terrain'
import { GEOID_HEIGHT } from './terrain/tileGeometry'
import { landSpecular, waterTime } from './terrain/water'
import { showAttribution } from './ui/attribution'
import { showDebugText } from './ui/debugText'
import { showGuidance } from './ui/guidance'
import { showLoading } from './ui/loading'


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

  const area = AREAS[params.area]
  const { origin } = area
  const frame = createLocalFrame(origin.longitude, origin.latitude, origin.height)
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
  scene.add(atmosphere.light)
  scene.add(
    area.beyondTerrain === 'sea'
      ? createSeaSphere(atmosphere.context, ecefToWorld(frame, new Vector3(0, 0, 0)))
      : createPlaceholderGround()
  )

  const buildings = params.buildings && area.buildings
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

  photoGrade.value.set(params.photoDehaze, params.photoContrast, params.photoSaturation, 0)
  landSpecular.value = params.landSpecular
  const terrain = params.terrain
    ? createTerrain(
        frame,
        { ...area.terrain, texelPixels: params.terrainTexelPixels, debug: params.terrainDebug },
        atmosphere.context
      )
    : null
  if (terrain) scene.add(terrain.group)
  showAttribution()
  const debugText = params.debugText ? showDebugText() : null
  let frameMs = 0

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
        layers: cloudLayers(params.cloudAmount),
        coverage: params.coverage,
        features: cloudFeatures,
        wind: params.wind
      })
    : null
  if (clouds && params.groundShadow) {
    // Cloud shadows dim the sunlight through the light's custom shadow node; no shadow map of
    // the scene is rendered. Objects opt in with receiveShadow.
    renderer.shadowMap.enabled = true
    atmosphere.light.castShadow = true
    // `shadowNode` is missing from the type declarations of LightShadow in 0.186.
    ;(atmosphere.light.shadow as unknown as { shadowNode: unknown }).shadowNode = clouds.sceneShadow
  }
  // Water drops on the screen in clouds (ADR 0011); they need the clouds' density.
  const drops = clouds && params.drops ? createDrops() : null
  await loadHudFont()
  debug.hudFont = [...document.fonts].some(face => face.family.includes('Share Tech Mono') && face.status === 'loaded')
  const hud = createHud()
  const pipeline = createPipeline(renderer, scene, camera, clouds ? [clouds.stage] : [], {
    lensFlare: params.flare,
    shadowLength: clouds?.shadowLength,
    drops: drops ?? undefined,
    hud,
    dropsDebug: params.dropsDebug
  })
  pipeline.exposure.value = params.exposure

  const { path, seamGap } = createPlaceholderPath(frame, {
    ...area.course,
    speed: params.speed,
    height: params.altitude ?? area.course.height,
    bankDegrees: params.bank ?? area.course.bankDegrees,
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
    if (debugText) {
      frameMs += (timer.getDelta() * 1000 - frameMs) * 0.1
      debugText.update([
        `t      ${flightTime.toFixed(1)} s${loaded ? '' : ' (loading)'}`,
        // Height above the origin's tangent plane; close to the altitude over the demo area.
        `y      ${camera.position.y.toFixed(0)} m`,
        `load   ${state.loadFactor.toFixed(2)} G`,
        `cloud  ${cloudDensity.toFixed(4)} /m, in cloud ${state.cloudDensity.toFixed(2)} (${densityMicroseconds.toFixed(0)} us)`,
        `frame  ${frameMs.toFixed(1)} ms`
      ])
    }
  })

  let lastBoundsTime = -Infinity
  let cloudDensity = 0
  let densityMicroseconds = 0
  const inCloud = createInCloud()
  const aircraftWorld = new Vector3()
  // CPU time of the drops' update (simulation and encoding their draw), averaged.
  let dropsMilliseconds = 0

  // The HUD: both layers redrawn each frame, as their values change all the time.
  const aircraftGeodetic = new Geodetic()
  function drawHud(): void {
    hud.update(renderer, cockpit.offsetQuaternion, camera.fov)
    const { canvas, context } = hud.aircraft
    if (params.hudDebug) {
      drawHudDebug(hud.screen, hud.aircraft, cockpit.aircraftQuaternion, camera.fov)
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
    const pixelsPerDegree = (canvas.height / 2 / Math.tan((camera.fov * Math.PI) / 360)) * (Math.PI / 180)
    // Ground speed: the path's speed, as it has no wind.
    drawVelocityScale(context, canvas.width, canvas.height, pixelsPerDegree, params.speed * KNOTS_PER_METRE_PER_SECOND)
    // Height above mean sea level: GSI heights are above the geoid (ADR 0026).
    const metres = aircraftGeodetic.setFromECEF(state.ecef).height - GEOID_HEIGHT
    drawAltitudeScale(context, canvas.width, canvas.height, pixelsPerDegree, metres * FEET_PER_METRE)
    hud.aircraft.changed()
  }

  // One frame: move the aircraft, update the tiles, draw.
  function step(flightDelta: number, elapsed: number): void {
    flightTime += flightDelta
    samplePath(path, flightTime, state)
    clouds?.setTime(flightTime)
    waterTime.value = flightTime
    // Cloud step C5: the clouds' density at the aircraft, for the effects in clouds. It replaces
    // the path's cloud channel, which the placeholder path leaves at 0. Timed, as it runs on the
    // CPU every frame.
    if (clouds) {
      const start = performance.now()
      cloudDensity = clouds.densityAt(ecefToWorld(frame, state.ecef, aircraftWorld))
      densityMicroseconds += ((performance.now() - start) * 1000 - densityMicroseconds) * 0.05
      state.cloudDensity = inCloud.update(cloudDensity, first ? 0 : flightDelta)
      debug.cloudDensity = Number(cloudDensity.toFixed(5))
      debug.inCloud = Number(state.cloudDensity.toFixed(3))
      debug.cloudDensityMicroseconds = Number(densityMicroseconds.toFixed(1))
    }
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
    if (clouds) {
      camera.updateMatrixWorld()
      clouds.updateShadows(renderer)
    }
    if (drops) {
      const start = performance.now()
      drops.update(renderer, first ? 0 : flightDelta, state.cloudDensity, params.speed, camera.quaternion)
      dropsMilliseconds += (performance.now() - start - dropsMilliseconds) * 0.05
      debug.drops = drops.count
      debug.dropsMs = Number(dropsMilliseconds.toFixed(3))
    }
    drawHud()
    hud.upload()
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
