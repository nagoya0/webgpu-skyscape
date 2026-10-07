import { Euler, PerspectiveCamera, Quaternion, Scene, Timer, Vector3, WebGPURenderer, type Mesh } from 'three/webgpu'

import { Geodetic } from '@takram/three-geospatial'

import { AREA } from './areas'
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
import { drawAttitudeBars } from './hud/attitudeBars'
import { drawBoresightCross, drawFlightPathMarker } from './hud/flightPathMarker'
import { drawHeadingScale } from './hud/headingScale'
import { drawRollIndicator } from './hud/rollIndicator'
import { drawScreenLines, FLIGHT_MODEL_LINE, sceneTimeText } from './hud/sceneTime'
import { loadPlaces } from './hud/flyingOver'
import { drawVelocityScale, KNOTS_PER_METRE_PER_SECOND } from './hud/velocityScale'
import { createAircraftState, pathDuration, samplePath } from './flight/path'
import { loadPath } from './flight/loadPath'
import { createLocalFrame, ecefToWorld, nedToWorldRotation } from './geo/localFrame'
import { requestDevice } from './gpu/support'
import { readParams } from './params'
import { createPipeline } from './render/pipeline'
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

  const area = AREA
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
  // Beyond the terrain, a sea-level sphere drawn as water (ADR 0030).
  scene.add(createSeaSphere(atmosphere.context, ecefToWorld(frame, new Vector3(0, 0, 0))))

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
  const places = await loadPlaces()
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

  // The area's JSBSim path (ADR 0035), or another with ?path=NAME.
  const path = await loadPath(params.path ?? area.path)
  debug.date = params.date.toISOString()
  debug.pathSeconds = Number(pathDuration(path).toFixed(1))
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
      const ground = terrain?.stats()
      const settled = !ground || (ground.ready > 0 && ground.loading === 0)
      settledSince = settled ? (settledSince ?? elapsed) : null
      if ((settledSince !== null && elapsed - settledSince > SETTLE_TIME) || elapsed > LOADING_TIMEOUT) {
        loaded = true
        loading.hide()
      } else {
        if (ground && ground.loading > 0) loading.setText(`Loading… terrain ${ground.loading} tiles to go`)
      }
    }
    debug.loaded = loaded
    // ?debug: where the path goes through clouds, once loaded, for designing the course. Each
    // stretch in cloud, sampled every 0.1 s, as [from, to, most density per metre].
    if (loaded && clouds && params.debugText && debug.pathClouds === undefined) {
      const sample = createAircraftState()
      const world = new Vector3()
      const found: [number, number, number][] = []
      let open: [number, number, number] | null = null
      for (let i = 0; i * 0.1 < pathDuration(path); i++) {
        const t = Number((i * 0.1).toFixed(1))
        samplePath(path, t, sample)
        const density = clouds.densityAt(ecefToWorld(frame, sample.ecef, world))
        if (density > 0) {
          if (!open) found.push((open = [t, t, 0]))
          open[1] = t
          open[2] = Math.max(open[2], Number(density.toFixed(4)))
        } else open = null
      }
      debug.pathClouds = found
    }
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

  let cloudDensity = 0
  let densityMicroseconds = 0
  const inCloud = createInCloud()
  const aircraftWorld = new Vector3()
  // CPU time of the drops' update (simulation and encoding their draw), averaged.
  let dropsMilliseconds = 0

  // The HUD: both layers redrawn each frame, as their values change all the time.
  const aircraftGeodetic = new Geodetic()
  let screenDrawn = false
  let placeLine: string | null = null
  let lastPlaceLookup = -Infinity
  const nose = new Vector3()
  const ahead = createAircraftState()
  const aheadWorld = new Vector3()
  const hereWorld = new Vector3()
  const velocity = new Vector3()
  const bodyVelocity = new Vector3()
  // Seconds ahead on the path for the velocity, for the ground speed and the flight path marker.
  const VELOCITY_STEP = 0.05
  const bodyToWorld = new Quaternion()
  const attitude = new Euler()
  function drawHud(): void {
    const resized = hud.update(renderer, cockpit.offsetQuaternion, camera.fov)
    const pixelsPerDegree = (hud.aircraft.canvas.height / 2 / Math.tan((camera.fov * Math.PI) / 360)) * (Math.PI / 180)
    // The screen layer: the scene's time and the place below, looked up twice a second and drawn
    // again only when the line changes or the canvas is new.
    const now = performance.now()
    if (now - lastPlaceLookup > 500) {
      lastPlaceLookup = now
      aircraftGeodetic.setFromECEF(state.ecef)
      const line = places.lineAt((aircraftGeodetic.longitude * 180) / Math.PI, (aircraftGeodetic.latitude * 180) / Math.PI)
      if (line !== placeLine) {
        placeLine = line
        screenDrawn = false
      }
    }
    if ((resized || !screenDrawn) && !params.hudDebug) {
      const { canvas: screen, context: screenContext } = hud.screen
      screenContext.clearRect(0, 0, screen.width, screen.height)
      const lines = [sceneTimeText(params.date), FLIGHT_MODEL_LINE]
      if (placeLine) lines.push(placeLine)
      drawScreenLines(screenContext, screen.height, pixelsPerDegree, lines)
      hud.screen.changed()
      screenDrawn = true
    }
    // ?hud=0: the aircraft's HUD left out. Its canvas stays clear, so nothing more is uploaded.
    if (!params.hud && !params.hudDebug) return
    const { canvas, context } = hud.aircraft
    if (params.hudDebug) {
      drawHudDebug(hud.screen, hud.aircraft, cockpit.aircraftQuaternion, camera.fov)
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
    // Ground speed: the horizontal part of the velocity, as the paths have no wind.
    const groundSpeed = Math.hypot(velocity.x, velocity.z)
    drawVelocityScale(context, canvas.width, canvas.height, pixelsPerDegree, groundSpeed * KNOTS_PER_METRE_PER_SECOND)
    // Height above mean sea level: GSI heights are above the geoid (ADR 0026).
    const metres = aircraftGeodetic.setFromECEF(state.ecef).height - GEOID_HEIGHT
    drawAltitudeScale(context, canvas.width, canvas.height, pixelsPerDegree, metres * FEET_PER_METRE)
    // Magnetic heading: the nose's true heading from its body axis in north-east-down, less the
    // area's declination (east positive).
    nose.set(1, 0, 0).applyQuaternion(state.bodyToNED)
    const trueHeading = (Math.atan2(nose.y, nose.x) * 180) / Math.PI
    drawHeadingScale(context, canvas.width, canvas.height, pixelsPerDegree, trueHeading - area.magneticDeclination)
    // Bank: the roll of the body axes from north-east-down, taken as yaw, pitch, then roll.
    attitude.setFromQuaternion(state.bodyToNED, 'ZYX')
    drawRollIndicator(context, canvas.width, canvas.height, pixelsPerDegree, (attitude.x * 180) / Math.PI)
    drawAttitudeBars(context, canvas.width, canvas.height, pixelsPerDegree, state.bodyToNED, Math.atan2(nose.y, nose.x))
    drawBoresightCross(context, canvas.width, canvas.height, pixelsPerDegree)
    // The velocity in body axes.
    nedToWorldRotation(frame, state.ecef, bodyToWorld).multiply(state.bodyToNED).invert()
    drawFlightPathMarker(context, canvas.width, canvas.height, pixelsPerDegree, bodyVelocity.copy(velocity).applyQuaternion(bodyToWorld))
    hud.aircraft.changed()
  }

  // One frame: move the aircraft, update the tiles, draw.
  function step(flightDelta: number, elapsed: number): void {
    flightTime += flightDelta
    samplePath(path, flightTime, state)
    // The velocity in world axes (north, up, east), from where the path is a moment ahead; also
    // while paused.
    samplePath(path, flightTime + VELOCITY_STEP, ahead)
    velocity
      .subVectors(ecefToWorld(frame, ahead.ecef, aheadWorld), ecefToWorld(frame, state.ecef, hereWorld))
      .divideScalar(VELOCITY_STEP)
    clouds?.setTime(flightTime)
    waterTime.value = flightTime
    // Cloud step C5: the clouds' density at the aircraft, for the effects in clouds. The path has
    // no cloud channel (ADR 0008). Timed, as it runs on the CPU every frame.
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
      drops.update(renderer, first ? 0 : flightDelta, state.cloudDensity, velocity.length(), camera.quaternion)
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
