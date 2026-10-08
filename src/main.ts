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
import { drawCurrentG } from './hud/currentG'
import { createAircraftState, pathDuration, samplePath } from './flight/path'
import { loadPath } from './flight/loadPath'
import { createLocalFrame, ecefToWorld, nedToWorldRotation } from './geo/localFrame'
import { requestDevice } from './gpu/support'
import { readParams } from './params'
import { preExposureForSunAltitude } from './render/exposure'
import { createPipeline } from './render/pipeline'
import { createSeaSphere } from './terrain/seaSphere'
import { createTerrain } from './terrain/terrain'
import { GEOID_HEIGHT } from './terrain/tileGeometry'
import { waterTime } from './terrain/water'
import { DebugWindow, debugStats } from './ui/DebugWindow'
import { GuidanceScreen, showGuidance } from './ui/GuidanceScreen'
import { hideLoading, LoadingScreen, loadingMessage, setLoadingProgress } from './ui/LoadingScreen'
import { Header } from './ui/Header'
import { SettingsWindow } from './ui/SettingsWindow'
import { fps, settingsOpen } from './ui/state'
import { flightDuration, flightTime as flightTimeSignal, initSettings, live, seekTo } from './ui/settings'
import { effect } from '@preact/signals'
import { h, render } from 'preact'


const params = readParams(location.search)
initSettings(params)

// The UI (ADR 0037): the header first, so it shows while the demo starts, and the settings window
// over the 3D view, which holds the data credits.
render(h(Header, null), document.getElementById('header')!)
const overlay = document.createElement('div')
document.getElementById('app')!.appendChild(overlay)
render(h('div', null, h(LoadingScreen, null), h(DebugWindow, null), h(SettingsWindow, null), h(GuidanceScreen, null)), overlay)

// The loading screen's progress at the end of each stage of the start (ADR 0037). Provisional
// shares, to be tuned so that the bar moves evenly.
const LOADING = {
  webgpu: 0.05,
  clouds: 0.15,
  hud: 0.2,
  path: 0.25,
  shaders: 0.4,
  terrain: 0.9
}

/** Vertical field of view. */
const FIELD_OF_VIEW_DEGREES = 70

const debug: Record<string, unknown> = {}
;(window as unknown as { __debug: unknown }).__debug = debug

async function start(): Promise<void> {
  const support = await requestDevice()
  if (!support.ok) {
    showGuidance(support.kind, support.details)
    return
  }
  const { device } = support

  // Reversed Z (ADR 0015).
  const renderer = new WebGPURenderer({
    device,
    antialias: false,
    reversedDepthBuffer: true,
    // GPU timestamps for ?measure and while the debug window is shown (switched each frame below);
    // they need the 'timestamp-query' feature.
    trackTimestamp: params.measure && device.features.has('timestamp-query')
  })
  await renderer.init()
  setLoadingProgress(LOADING.webgpu)
  const timestampsSupported = device.features.has('timestamp-query')
  // `trackTimestamp` is missing from the type declarations of the backend in 0.186. The backend
  // reads it each time it starts a pass, so it can be switched while the demo runs.
  const backendTimestamps = renderer.backend as unknown as { trackTimestamp: boolean }
  // Passing a device should rule out the WebGL 2 fallback; check anyway.
  if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
    renderer.dispose()
    showGuidance('renderer-failed')
    return
  }

  device.lost.then(info => {
    if (info.reason !== 'destroyed') {
      renderer.setAnimationLoop(null)
      showGuidance('device-lost', [info.message])
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
    FIELD_OF_VIEW_DEGREES,
    container.clientWidth / container.clientHeight,
    0.1,
    1e7
  )

  const scene = new Scene()
  const atmosphere = createAtmosphere(renderer, camera, params.raymarch)
  atmosphere.setFrame(frame)
  scene.add(atmosphere.light)
  scene.add(atmosphere.moonLight)
  // Beyond the terrain, a sea-level sphere drawn as water (ADR 0030).
  scene.add(createSeaSphere(atmosphere.context, ecefToWorld(frame, new Vector3(0, 0, 0))))

  const terrain = params.terrain
    ? createTerrain(frame, { ...area.terrain, debug: params.terrainDebug }, atmosphere.context)
    : null
  if (terrain) scene.add(terrain.group)

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
  loadingMessage.value = 'Loading clouds...'
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
    // At night the shadow maps follow the moon (ADR 0041), so the moonlight gets the same shadow;
    // by day the moon's light is too faint for its wrong shadow to show.
    atmosphere.moonLight.castShadow = true
    ;(atmosphere.moonLight.shadow as unknown as { shadowNode: unknown }).shadowNode = clouds.sceneShadow
  }
  // Water drops on the screen in clouds (ADR 0011); they need the clouds' density.
  const drops = clouds ? createDrops() : null
  setLoadingProgress(LOADING.clouds)
  loadingMessage.value = 'Loading HUD...'
  await loadHudFont()
  const places = await loadPlaces()
  setLoadingProgress(LOADING.hud)
  debug.hudFont = [...document.fonts].some(face => face.family.includes('Share Tech Mono') && face.status === 'loaded')
  const hud = createHud()
  const pipeline = createPipeline(renderer, scene, camera, clouds ? [clouds.stage] : [], {
    shadowLength: clouds?.shadowLength,
    drops: drops ?? undefined,
    hud,
    dropsDebug: params.dropsDebug
  })
  // Settings from the settings window that apply while the demo runs (ADR 0037).
  effect(() => {
    atmosphere.setDate(live.date.value)
    // Brighter as the sun sets, for the night (src/render/exposure.ts).
    atmosphere.setPreExposure(preExposureForSunAltitude(atmosphere.sunAltitude))
    debug.date = live.date.value.toISOString()
    debug.sunAltitude = Number(atmosphere.sunAltitude.toFixed(2))
  })
  effect(() => {
    if (clouds) clouds.coverage.value = live.coverage.value
  })
  effect(() => {
    clouds?.setAmount(live.cloudAmount.value)
  })

  // The area's JSBSim path (ADR 0035), or another with ?path=NAME.
  loadingMessage.value = 'Loading flight path...'
  const path = await loadPath(params.path ?? area.path)
  setLoadingProgress(LOADING.path)
  loadingMessage.value = 'Compiling shaders...'
  debug.pathSeconds = Number(pathDuration(path).toFixed(1))
  flightDuration.value = pathDuration(path)
  const cockpit = createCockpitCamera(camera, frame)
  const state = createAircraftState()

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  })

  // The start's last stages run in the render loop, with the flight held at its start (ADR 0037):
  // the shaders, compiled by the first frame; the terrain seen from the start; a few frames for the
  // clouds' temporal upscaling and the anti-aliasing to settle. Then the demo is shown.
  let loaded = false
  let loadingStage: 'shaders' | 'compiling' | 'terrain' | 'warmup' = 'shaders'
  // Tile loading pauses briefly between levels of the tile tree, so the queue must stay empty
  // for a while before the terrain counts as loaded.
  const SETTLE_TIME = 1.5 // seconds
  // GSI's server may stop answering; with no new tile for this long, the terrain counts as loaded
  // and the coarser tiles already there stand in until the rest arrive.
  const TERRAIN_STALL_TIME = 15 // seconds
  const WARMUP_FRAMES = 30
  let settledSince: number | null = null
  let terrainProgressSince = 0
  let terrainReady = 0
  let warmupFrames = 0

  const timer = new Timer()
  let flightTime = params.flightStart
  let first = true
  let lastFlightTimeShown = -Infinity
  // The header's frame rate: frames counted over about half a second.
  let fpsFrames = 0
  let fpsSince = performance.now()
  renderer.setAnimationLoop(time => {
    timer.update(time)
    fpsFrames++
    const now = performance.now()
    if (now - fpsSince >= 500) {
      fps.value = (fpsFrames * 1000) / (now - fpsSince)
      fpsFrames = 0
      fpsSince = now
    }
    // Clamp long frames, such as after a hidden tab, so the head lag does not jump.
    const dt = Math.min(timer.getDelta(), 0.1)
    if (!loaded) {
      const elapsed = timer.getElapsed()
      if (loadingStage === 'shaders') {
        // This frame compiles them; the stage ends when the GPU has done the frame.
        loadingStage = 'compiling'
        void device.queue.onSubmittedWorkDone().then(() => {
          setLoadingProgress(LOADING.shaders)
          loadingMessage.value = 'Loading terrain...'
          loadingStage = 'terrain'
          terrainProgressSince = timer.getElapsed()
        })
      } else if (loadingStage === 'terrain') {
        const ground = terrain?.stats()
        const settled = !ground || (ground.ready > 0 && ground.loading === 0)
        settledSince = settled ? (settledSince ?? elapsed) : null
        if (ground) {
          if (ground.ready > terrainReady) {
            terrainReady = ground.ready
            terrainProgressSince = elapsed
          }
          // How many tiles the start needs is not known in advance (about 150 at 1920 × 1080), and
          // only a few load at a time, so the share approaches 1 as the ready tiles grow.
          const share = 1 - Math.exp(-ground.ready / 60)
          setLoadingProgress(LOADING.shaders + (LOADING.terrain - LOADING.shaders) * share)
        }
        const stalled = elapsed - terrainProgressSince > TERRAIN_STALL_TIME
        if ((settledSince !== null && elapsed - settledSince > SETTLE_TIME) || stalled) {
          debug.terrainStalled = stalled
          setLoadingProgress(LOADING.terrain)
          loadingMessage.value = 'Warming up...'
          loadingStage = 'warmup'
        }
      } else if (loadingStage === 'warmup') {
        warmupFrames++
        setLoadingProgress(LOADING.terrain + (1 - LOADING.terrain) * (warmupFrames / WARMUP_FRAMES))
        if (warmupFrames >= WARMUP_FRAMES) {
          loaded = true
          hideLoading()
        }
      }
    }
    debug.loaded = loaded
    // ?debug: where the path goes through clouds, once loaded, for designing the course. Each
    // stretch in cloud, sampled every 0.1 s, as [from, to, most density per metre].
    if (loaded && clouds && live.debug.value && debug.pathClouds === undefined) {
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
    // A move asked for in the settings window.
    if (seekTo.value !== null) {
      flightTime = seekTo.value
      seekTo.value = null
    }
    // The flight holds while paused and while the settings window is open; the scene is still
    // drawn, so changes made in the window show at once.
    // The debug window's figures are measured only while it is shown, the GPU timestamps included.
    const measuringDebug = live.debug.value
    backendTimestamps.trackTimestamp = (measuringDebug || params.measure) && timestampsSupported
    const stepStart = performance.now()
    step(loaded && !live.paused.value && !settingsOpen.value ? dt : 0, timer.getElapsed())
    if (now - lastFlightTimeShown > 250) {
      lastFlightTimeShown = now
      flightTimeSignal.value = flightTime
    }
    if (measuringDebug) {
      measureDebug(timer.getDelta() * 1000, performance.now() - stepStart, now)
    } else if (debugStats.value) {
      debugStats.value = null
      cpuMs = frameMs = 0
      gpuMs = null
    }
  })

  // The debug window: averages kept while it is shown, and a fresh snapshot four times a second.
  let frameMs = 0
  let cpuMs = 0
  let gpuMs: number | null = null
  let resolvingTimestamps = false
  let lastDebugShown = -Infinity
  function measureDebug(frame: number, cpu: number, now: number): void {
    frameMs = frameMs === 0 ? frame : frameMs + (frame - frameMs) * 0.1
    cpuMs = cpuMs === 0 ? cpu : cpuMs + (cpu - cpuMs) * 0.1
    // GPU time: the render and compute passes of a past frame, read back without waiting.
    if (backendTimestamps.trackTimestamp && !resolvingTimestamps) {
      resolvingTimestamps = true
      void Promise.all([renderer.resolveTimestampsAsync('render'), renderer.resolveTimestampsAsync('compute')])
        .then(([render, compute]) => {
          const ms = (render ?? 0) + (compute ?? 0)
          if (ms > 0) gpuMs = gpuMs === null ? ms : gpuMs + (ms - gpuMs) * 0.1
        })
        .finally(() => (resolvingTimestamps = false))
    }
    if (now - lastDebugShown < 250) return
    lastDebugShown = now
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    debugStats.value = {
      flightTime,
      loading: !loaded,
      frameMs,
      cpuMs,
      heapBytes: heap ? heap.usedJSHeapSize : null,
      gpuMs: timestampsSupported ? gpuMs : null,
      gpuBytes: renderer.info.memory.total,
      triangles: renderer.info.render.triangles,
      drawCalls: renderer.info.render.drawCalls,
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      pixelRatio: renderer.getPixelRatio()
    }
  }

  let cloudDensity = 0
  let densityMicroseconds = 0
  const inCloud = createInCloud()
  const aircraftWorld = new Vector3()
  // CPU time of the drops' update (simulation and encoding their draw), averaged.
  let dropsMilliseconds = 0

  // The HUD: both layers redrawn each frame, as their values change all the time.
  const aircraftGeodetic = new Geodetic()
  let screenDrawn = false
  let screenDate = live.date.value
  let aircraftDrawn = false
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
    // The HUD switched off (settings window, ?hud=0): both layers, the aircraft's and the one fixed
    // to the screen, are cleared once and then left alone, so nothing more is uploaded.
    if (!live.hud.value && !params.hudDebug) {
      if (aircraftDrawn) {
        hud.aircraft.context.clearRect(0, 0, hud.aircraft.canvas.width, hud.aircraft.canvas.height)
        hud.aircraft.changed()
        aircraftDrawn = false
      }
      if (screenDrawn) {
        hud.screen.context.clearRect(0, 0, hud.screen.canvas.width, hud.screen.canvas.height)
        hud.screen.changed()
        screenDrawn = false
      }
      return
    }
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
    if (live.date.value !== screenDate) {
      screenDate = live.date.value
      screenDrawn = false
    }
    if ((resized || !screenDrawn) && !params.hudDebug) {
      const { canvas: screen, context: screenContext } = hud.screen
      screenContext.clearRect(0, 0, screen.width, screen.height)
      const lines = [sceneTimeText(screenDate), FLIGHT_MODEL_LINE]
      if (placeLine) lines.push(placeLine)
      drawScreenLines(screenContext, screen.height, pixelsPerDegree, lines)
      hud.screen.changed()
      screenDrawn = true
    }
    const { canvas, context } = hud.aircraft
    aircraftDrawn = true
    if (params.hudDebug) {
      drawHudDebug(hud.screen, hud.aircraft, cockpit.aircraftQuaternion, camera.fov)
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
    // Ground speed: the horizontal part of the velocity, as the paths have no wind.
    const groundSpeed = Math.hypot(velocity.x, velocity.z)
    drawVelocityScale(context, canvas.width, canvas.height, pixelsPerDegree, groundSpeed * KNOTS_PER_METRE_PER_SECOND)
    drawCurrentG(context, canvas.width, canvas.height, pixelsPerDegree, state.loadFactor)
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
      step(live.paused.value ? 0 : Math.min(timer.getDelta(), 0.1), timer.getElapsed())
    })
  }
}

start().catch((error: unknown) => {
  console.error(error)
  showGuidance('start-failed', [String(error)])
})
