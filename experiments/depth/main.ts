// Compares depth formats for ADR 0015. Open with ?mode=standard|log|reversed and
// optionally &test=precision|overdraw.
//
// precision: pairs of overlapping planes, a green one in front of a red one, from 1 m to
//   100 km. Red showing through means the depth buffer cannot separate them.
//   Top row: 1 m apart. Bottom row: 0.1 % of the distance apart.
// overdraw: 200 full-screen planes with an expensive fragment shader, drawn front to back.
//   With early depth testing only the front plane is shaded.
//
// Results go to window.__debug for the headless runner.
import { Fn, float, Loop, positionLocal, sin, vec3 } from 'three/tsl'
import {
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGPURenderer
} from 'three/webgpu'

import { requestDevice } from '../../src/gpu/support'

const params = new URLSearchParams(location.search)
const mode = params.get('mode') ?? 'standard'
const test = params.get('test') ?? 'precision'
const debug: Record<string, unknown> = { mode, test }
;(window as unknown as { __debug: unknown }).__debug = debug

const NEAR = 0.1
const FAR = 1e6

async function main(): Promise<void> {
  const support = await requestDevice()
  if (!support.ok) {
    debug.error = support.reason
    return
  }
  debug.adapter = `${support.adapterInfo.vendor} ${support.adapterInfo.architecture} ${support.adapterInfo.description}`
  const renderer = new WebGPURenderer({
    device: support.device,
    logarithmicDepthBuffer: mode === 'log',
    reversedDepthBuffer: mode === 'reversed'
  })
  await renderer.init()
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)
  document.getElementById('label')!.textContent = `${mode} / ${test}`

  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, NEAR, FAR)
  const scene = new Scene()

  if (test === 'precision') {
    const distances = [1, 10, 100, 1_000, 10_000, 50_000, 100_000]
    const front = new MeshBasicNodeMaterial({ color: 0x22cc44, side: DoubleSide })
    const back = new MeshBasicNodeMaterial({ color: 0xee2222, side: DoubleSide })
    const geometry = new PlaneGeometry(1, 1)
    const columns = distances.length
    const halfWidth = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect
    distances.forEach((distance, i) => {
      for (const [row, gap] of [[0.25, 1], [-0.25, distance * 0.001]] as const) {
        const size = (distance * 2 * halfWidth) / columns * 0.8
        const x = ((i + 0.5) / columns * 2 - 1) * halfWidth * distance
        const y = row * distance * 2 * Math.tan((camera.fov * Math.PI) / 360)
        const a = new Mesh(geometry, front)
        a.scale.setScalar(size)
        a.position.set(x, y, -distance)
        const b = new Mesh(geometry, back)
        b.scale.setScalar(size)
        b.position.set(x, y, -distance - gap)
        scene.add(a, b)
      }
    })
    renderer.render(scene, camera)
    await support.device.queue.onSubmittedWorkDone()
    debug.done = true
    return
  }

  // overdraw
  const expensive = Fn(() => {
    const acc = vec3(0).toVar()
    Loop(64, ({ i }) => {
      const t = float(i).mul(0.37)
      acc.addAssign(sin(positionLocal.mul(t.add(1)).add(t)).mul(0.01))
    })
    return acc.abs()
  })
  const material = new MeshBasicNodeMaterial()
  material.colorNode = expensive()
  const geometry = new PlaneGeometry(1, 1)
  const layers = 200
  for (let i = 0; i < layers; i++) {
    const distance = 10 + i * 10
    const mesh = new Mesh(geometry, material)
    mesh.scale.setScalar(distance * 4)
    mesh.position.set(0, 0, -distance)
    scene.add(mesh)
  }
  // Warm up: compile pipelines.
  for (let i = 0; i < 10; i++) {
    renderer.render(scene, camera)
    await support.device.queue.onSubmittedWorkDone()
  }
  const frames = 60
  const start = performance.now()
  for (let i = 0; i < frames; i++) {
    renderer.render(scene, camera)
    await support.device.queue.onSubmittedWorkDone()
  }
  debug.msPerFrame = Number(((performance.now() - start) / frames).toFixed(2))
  debug.done = true
}

main().catch((error: unknown) => {
  debug.error = String(error)
  console.error(error)
})
