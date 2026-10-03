import {
  BoxGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  Scene,
  WebGPURenderer
} from 'three/webgpu'

import { requestDevice } from './gpu/support'
import { showGuidance } from './ui/guidance'

async function start(): Promise<void> {
  const support = await requestDevice()
  if (!support.ok) {
    showGuidance(support.reason, support.details)
    return
  }
  const { device } = support

  const renderer = new WebGPURenderer({ device, antialias: false })
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

  // Placeholder scene until the atmosphere is in.
  const scene = new Scene()
  const camera = new PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100)
  camera.position.set(0, 1.2, 4)
  camera.lookAt(0, 0, 0)
  scene.add(new HemisphereLight(0xbfd8ff, 0x404040, 1))
  const sun = new DirectionalLight(0xffffff, 2)
  sun.position.set(3, 5, 2)
  scene.add(sun)
  const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardNodeMaterial({ color: 0x88aacc }))
  scene.add(box)

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  })

  renderer.setAnimationLoop(time => {
    box.rotation.set(time * 0.0003, time * 0.0005, 0)
    renderer.render(scene, camera)
  })
}

start().catch((error: unknown) => {
  console.error(error)
  showGuidance('The demo failed to start.', [String(error)])
})
