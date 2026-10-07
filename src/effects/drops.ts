// Water drops on the screen in the first-person view (ADR 0011, ADR 0020): a game-style shortcut
// for drops on the canopy. In a cloud, drops land at a rate that follows how deep in cloud the
// aircraft is; the relative wind pushes them outwards from the direction of travel, faster the
// faster the aircraft flies, with a little gravity; drops that touch merge. Out of the cloud no
// more land, and the ones left shrink and disappear, as if they evaporate.
//
// The drops are simulated on the CPU (a few hundred at most) and drawn as instanced quads into a
// half-resolution height map, the higher drop winning where they overlap. The last pass of the
// post-processing (dropsComposite) refracts the image through that height map.
import { float, Fn, length, max, mix, screenUV, smoothstep, sqrt, texture, uniform, uv, vec2, vec3, vec4 } from 'three/tsl'
import {
  Color,
  CustomBlending,
  DoubleSide,
  HalfFloatType,
  InstancedMesh,
  MaxEquation,
  MeshBasicNodeMaterial,
  Object3D,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  Vector2,
  Vector3,
  type Node,
  type Quaternion,
  type TextureNode,
  type WebGPURenderer
} from 'three/webgpu'

const MAX_DROPS = 400
/** Drops landing per second deep in a cloud. */
const LANDING_RATE = 70
/** Radii of new drops, in screen heights (the screen spans 2 vertically). */
const MIN_RADIUS = 0.012
const MAX_RADIUS = 0.04
/** Drops this small or smaller cling; larger ones start to flow. */
const CLING_RADIUS = 0.024
/** Flow speed in screen heights per second at 250 m/s, for a large drop at the screen's edge. */
const FLOW_SPEED = 1.2
const GRAVITY = 0.08
/** Radius lost per second out of the cloud. */
const EVAPORATION = 0.003
const REFERENCE_SPEED = 250

interface Drop {
  x: number
  y: number
  radius: number
}

export interface Drops {
  /** The drops' height map, for dropsComposite. */
  heightTexture: TextureNode
  /** Size of one height map texel in screen heights (x, y). */
  texel: Node<'vec2'>
  /** Size of one height map texel in texture coordinates. */
  texelUv: Node<'vec2'>
  /**
   * Moves the drops and draws their height map; call each frame before the post-processing.
   * @param inCloud how deep in cloud the aircraft is, 0 to 1
   * @param speed the aircraft's speed in m/s
   * @param cameraQuaternion for the direction of gravity on the screen
   */
  update(renderer: WebGPURenderer, dt: number, inCloud: number, speed: number, cameraQuaternion: Quaternion): void
  /** Number of drops on the screen, for debugging. */
  readonly count: number
}

export function createDrops(): Drops {
  const drops: Drop[] = []
  const target = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })
  const scene = new Scene()
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  camera.position.z = 0.5

  // A dome per drop: height = radius × sqrt(1 − d²), in screen heights, so a drop's slope does
  // not depend on its size and larger drops stand higher and win where they overlap. The radius
  // comes in through the instance colour, which three multiplies into the colour.
  const material = new MeshBasicNodeMaterial({ side: DoubleSide, transparent: true, depthTest: false, depthWrite: false })
  material.blending = CustomBlending
  material.blendEquation = MaxEquation
  material.blendSrc = OneFactor
  material.blendDst = OneFactor
  material.colorNode = Fn(() => {
    const d = length(uv().mul(2).sub(1))
    return vec3(sqrt(max(float(1).sub(d.mul(d)), 0)), 0, 0)
  })()
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, MAX_DROPS)
  mesh.frustumCulled = false
  mesh.count = 0
  scene.add(mesh)
  const dummy = new Object3D()
  const radiusColor = new Color()

  const size = new Vector2()
  const texel = uniform(new Vector2(1, 1))
  const texelUv = uniform(new Vector2(1, 1))
  const down = new Vector3()
  let landingDebt = 0

  return {
    heightTexture: texture(target.texture),
    texel,
    texelUv,
    get count() {
      return drops.length
    },
    update(renderer, dt, inCloud, speed, cameraQuaternion) {
      renderer.getDrawingBufferSize(size)
      const width = Math.max(1, Math.floor(size.x / 2))
      const height = Math.max(1, Math.floor(size.y / 2))
      if (target.width !== width || target.height !== height) target.setSize(width, height)
      const aspect = width / height
      camera.left = -aspect
      camera.right = aspect
      camera.updateProjectionMatrix()
      texel.value.set((2 * aspect) / width, 2 / height)
      texelUv.value.set(1 / width, 1 / height)

      if (dt > 0) {
        // Land.
        landingDebt += LANDING_RATE * inCloud * dt
        while (landingDebt >= 1) {
          landingDebt -= 1
          if (drops.length >= MAX_DROPS) continue
          drops.push({
            x: (Math.random() * 2 - 1) * aspect,
            y: Math.random() * 2 - 1,
            radius: MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.random() ** 2
          })
        }

        // Flow outwards from the centre, the direction of travel, plus a little gravity.
        down.set(0, -1, 0).applyQuaternion(cameraQuaternion.clone().invert())
        const flow = FLOW_SPEED * (speed / REFERENCE_SPEED)
        for (const drop of drops) {
          const mobility = Math.min(Math.max((drop.radius - CLING_RADIUS) / (MAX_RADIUS - CLING_RADIUS), 0), 1)
          if (mobility > 0) {
            const r = Math.hypot(drop.x, drop.y)
            const nx = r > 1e-4 ? drop.x / r : 0
            const ny = r > 1e-4 ? drop.y / r : 0
            const v = flow * mobility * Math.min(r, 1)
            drop.x += (nx * v + down.x * GRAVITY * mobility) * dt
            drop.y += (ny * v + down.y * GRAVITY * mobility) * dt
          }
          if (inCloud < 0.05) drop.radius -= EVAPORATION * dt
        }

        // Merge drops that touch: the larger takes the other's water (area).
        for (let i = 0; i < drops.length; i++) {
          const a = drops[i]
          if (a.radius <= 0) continue
          for (let j = i + 1; j < drops.length; j++) {
            const b = drops[j]
            if (b.radius <= 0) continue
            if (Math.hypot(a.x - b.x, a.y - b.y) < (a.radius + b.radius) * 0.8) {
              const [big, small] = a.radius >= b.radius ? [a, b] : [b, a]
              big.radius = Math.min(Math.hypot(big.radius, small.radius), MAX_RADIUS * 2)
              small.radius = 0
            }
          }
        }

        // Drop the gone, the evaporated and the ones off the screen.
        for (let i = drops.length - 1; i >= 0; i--) {
          const drop = drops[i]
          if (drop.radius <= 0.0005 || Math.abs(drop.x) > aspect + drop.radius || Math.abs(drop.y) > 1 + drop.radius) {
            drops.splice(i, 1)
          }
        }
      }

      mesh.count = drops.length
      drops.forEach((drop, i) => {
        dummy.position.set(drop.x, drop.y, 0)
        dummy.scale.set(drop.radius * 2, drop.radius * 2, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, radiusColor.setRGB(drop.radius, 0, 0))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

      renderer.setRenderTarget(target)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      if (drops.length > 0) renderer.render(scene, camera)
      renderer.setRenderTarget(null)
    }
  }
}

/**
 * The image seen through the drops: offset along the slope of the height map, softened a
 * little, and darker towards a drop's rim.
 * @param image the finished image as a texture
 * @param debug show the height map in red over the image instead (?dropsdebug)
 */
export function dropsComposite(image: TextureNode, drops: Drops, debug = false): Node<'vec4'> {
  return Fn(() => {
    const at = (offset: Node<'vec2'>): Node<'float'> => drops.heightTexture.sample(screenUV.add(offset)).r
    const texel = drops.texel
    const step = drops.texelUv
    const h = at(vec2(0, 0))
    const slope = vec2(
      at(vec2(step.x, 0)).sub(at(vec2(step.x.negate(), 0))).div(texel.x.mul(2)),
      at(vec2(0, step.y)).sub(at(vec2(0, step.y.negate()))).div(texel.y.mul(2))
    )
    const s = slope.mul(float(3).div(max(length(slope), 3)))
    const inside = smoothstep(0.0003, 0.0015, h)
    const refracted = screenUV.sub(s.mul(0.15).mul(inside))
    const blur = step.mul(1.5)
    const color = image
      .sample(refracted)
      .add(image.sample(refracted.add(vec2(blur.x, 0))))
      .add(image.sample(refracted.sub(vec2(blur.x, 0))))
      .add(image.sample(refracted.add(vec2(0, blur.y))))
      .add(image.sample(refracted.sub(vec2(0, blur.y))))
      .div(5)
    // Darker towards the rim; a small glint on the side facing up and to the left, where the
    // sky's light catches the drop.
    const rim = smoothstep(1, 3, length(slope))
    const facing = s.normalize().dot(vec2(-0.5, 0.85).normalize())
    const glint = smoothstep(0.6, 0.95, facing).mul(smoothstep(0.8, 2.5, length(slope))).mul(0.35)
    const seen = color.mul(float(1).sub(rim.mul(0.5))).add(glint)
    if (debug) return mix(image.sample(screenUV), vec4(1, 0, 0, 1), smoothstep(0, 0.0005, h))
    return mix(image.sample(screenUV), seen, inside)
  })() as Node<'vec4'>
}
