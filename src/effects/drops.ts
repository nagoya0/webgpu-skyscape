// Water drops on the screen in the first-person view (ADR 0011, ADR 0020): a game-style shortcut
// for drops on the canopy. Deep in a cloud (more than half way, see inCloud.ts), drops land at a
// rate that grows with the depth; the relative wind pushes them outwards from the direction of
// travel, faster the faster the aircraft flies, with a little gravity; drops that touch merge.
// Out of the cloud no more land, and the ones left shrink and disappear, as if they evaporate;
// in the cloud they evaporate at half the rate. Drops land small, now and then a large one; the
// smallest cling, and the others meander a little along the glass's grime.
//
// After two rain-on-glass effects: Heartfelt (Martijn Steinrucken, ShaderToy, 2017) and the
// Codrops rain experiments (Lucas Bebber, 2015). From them: sizes drawn from a cubic
// distribution, so small drops outnumber large ones (a few land large); moving drops are drawn
// out behind into one continuous streak, as long as they travel in a short time, and round up
// again when they stop; merging keeps the water's area. Added here: each drop's outline is bent
// a little by its own random harmonics, so no two look the same.
//
// The drops are simulated on the CPU (a few hundred) and drawn as instanced quads into a
// half-resolution height map, the higher drop winning where they overlap. The last pass of the
// post-processing (dropsComposite) refracts the image through that height map.
//
// In a cloud the glass also mists over: the whole image is softened and veiled, so the drops show
// less (the maintainer, 2026-10-08: in a cloud the drops stood out too clearly; out of it they
// look right). The mist follows how deep in cloud the aircraft is, and clears after it.
import {
  atan,
  float,
  Fn,
  instancedBufferAttribute,
  length,
  max,
  mix,
  screenUV,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  CustomBlending,
  DoubleSide,
  HalfFloatType,
  InstancedBufferAttribute,
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

const MAX_DROPS = 1500
/** Drops landing per second at the deepest in a cloud. */
const LANDING_RATE = 210
/** Drops land only deeper in cloud than this (0 to 1). */
const LANDING_THRESHOLD = 0.5
/**
 * Radii in screen heights (the screen spans 2 vertically): drops land small, between MIN_RADIUS
 * and LANDING_MAX_RADIUS, a few large (LARGE_*); merging grows them up to MAX_RADIUS.
 */
const MIN_RADIUS = 0.008
const LANDING_MAX_RADIUS = 0.02
const MAX_RADIUS = 0.09
/** Drops this small or smaller cling; larger ones flow, at full speed from FULL_FLOW_RADIUS. */
const CLING_RADIUS = 0.009
const FULL_FLOW_RADIUS = 0.03
/** Flow speed in screen heights per second at 250 m/s, for a large drop at the screen's edge. */
const FLOW_SPEED = 4
/** Gravity's pull on a flowing drop, in screen heights per second, down the screen as it is tilted. */
const GRAVITY = 0.6
/** Largest turn off the outward path from the glass's grime, in radians (about 7°). */
const GRIME_TURN = 0.13
/** How much the grime slows a drop at most (0 to 1). */
const GRIME_HOLD = 0.2
/** Each drop's own wander: random-walk strength in radians per √second, and its memory. */
const WANDER_RATE = 0.15
const WANDER_SECONDS = 1.5
/** Radius lost per second out of the cloud; half as much in it. */
const EVAPORATION = 0.006
const REFERENCE_SPEED = 250
/** A few drops land large, between LARGE_MIN_RADIUS and LARGE_MAX_RADIUS. */
const LARGE_SHARE = 0.015
const LARGE_MIN_RADIUS = 0.025
const LARGE_MAX_RADIUS = 0.045
/** A moving drop draws a streak behind it as long as it travels in this many seconds. */
const TAIL_SECONDS = 0.08
/** Mist on the glass: seconds to mist over in a cloud and to clear out of it, and its strength. */
const MIST_RISE_SECONDS = 1.5
// Clears before the drops evaporate, so the last drops are seen on clear glass (the maintainer).
const MIST_CLEAR_SECONDS = 0.7
const MIST_STRENGTH = 0.6
/** How far the mist spreads the image, in screen heights. */
const MIST_SPREAD = 0.012
/** Longest streak, in the drop's radii. */
const MAX_TAIL = 40

interface Drop {
  x: number
  y: number
  radius: number
  /** Random numbers for the outline. */
  seedA: number
  seedB: number
  /** Length of the streak behind the drop along `angle`, in its radii; 0 when still. */
  tail: number
  angle: number
  /** The drop's own turn off its path in radians, drifting slowly. */
  wander: number
}

export interface Drops {
  /** The drops' height map, for dropsComposite. */
  heightTexture: TextureNode
  /** Size of one height map texel in screen heights (x, y). */
  texel: Node<'vec2'>
  /** Size of one height map texel in texture coordinates. */
  texelUv: Node<'vec2'>
  /** Mist on the glass, 0 (clear) to 1 (fully misted over in a cloud). */
  mist: Node<'float'>
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

function newDrop(x: number, y: number, radius: number): Drop {
  return { x, y, radius, seedA: Math.random(), seedB: Math.random(), tail: 0, angle: 0, wander: 0 }
}

/**
 * The glass's grime: a smooth pattern fixed to the screen, about −1 to 1, made of a few sines at
 * unrelated frequencies. It turns the drops' paths and holds them back in places.
 */
function grime(x: number, y: number): number {
  return (
    0.6 * Math.sin(x * 3.7 + 1.1) * Math.sin(y * 3.1 + 0.4) +
    0.4 * Math.sin(x * 6.9 - y * 5.6 + 2.3)
  )
}

export function createDrops(): Drops {
  const drops: Drop[] = []
  const target = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })
  const scene = new Scene()
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  camera.position.z = 0.5

  // Per drop: (radius, seed A, seed B, tail). The quad's x axis runs along the drop's motion.
  const dropData = new InstancedBufferAttribute(new Float32Array(MAX_DROPS * 4), 4)
  const data = instancedBufferAttribute(dropData) as unknown as Node<'vec4'>

  // A dome per drop: height = radius × sqrt(1 − d²), in screen heights, so a drop's slope does not
  // depend on its size and larger drops stand higher and win where they overlap. d is the distance
  // from the centre in the drop's own radii: behind a moving drop the dome is drawn out into a
  // streak (tail radii long, narrower the longer it is); the outline is bent by two random
  // harmonics.
  const material = new MeshBasicNodeMaterial({ side: DoubleSide, transparent: true, depthTest: false, depthWrite: false })
  material.blending = CustomBlending
  material.blendEquation = MaxEquation
  material.blendSrc = OneFactor
  material.blendDst = OneFactor
  material.colorNode = Fn(() => {
    const radius = data.x
    const tail = data.w
    // The quad spans (1 + tail) radii on each side along x, 1 radius along y.
    const halfLength = float(1).add(tail)
    const p = uv().mul(2).sub(1).mul(vec2(halfLength, 1))
    const along = p.x.div(select(p.x.lessThan(0), halfLength, float(1).add(tail.min(1).mul(0.15))))
    // Thinner towards the end of the streak: its half width falls to a third.
    const behind = p.x.negate().div(halfLength).max(0)
    const across = p.y.div(float(1).sub(behind.mul(tail.min(1)).mul(0.65)))
    const theta = atan(p.y, p.x)
    const wobble = float(1)
      .add(sin(theta.mul(2).add(data.y.mul(6.283))).mul(0.09))
      .add(sin(theta.mul(3).add(data.z.mul(6.283))).mul(0.06))
    const d = length(vec2(along, across)).div(wobble)
    return vec3(radius.mul(sqrt(max(float(1).sub(d.mul(d)), 0))), 0, 0)
  })()
  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute('dropData', dropData)
  const mesh = new InstancedMesh(geometry, material, MAX_DROPS)
  mesh.frustumCulled = false
  mesh.count = 0
  scene.add(mesh)
  const dummy = new Object3D()

  const size = new Vector2()
  const texel = uniform(new Vector2(1, 1))
  const texelUv = uniform(new Vector2(1, 1))
  const mist = uniform(0)
  const down = new Vector3()
  const grid = new Map<number, Drop[]>()
  let landingDebt = 0

  return {
    heightTexture: texture(target.texture),
    texel,
    texelUv,
    mist,
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

      // The mist moves towards how deep in cloud the aircraft is: quickly in, slowly out.
      if (dt > 0) {
        const seconds = inCloud > mist.value ? MIST_RISE_SECONDS : MIST_CLEAR_SECONDS
        mist.value += (inCloud - mist.value) * (1 - Math.exp(-dt / seconds))
      }

      if (dt > 0) {
        // Land, only deep enough in the cloud; mostly small, from a cubic distribution, and a few
        // large.
        const depth = Math.min(Math.max((inCloud - LANDING_THRESHOLD) / (1 - LANDING_THRESHOLD), 0), 1)
        landingDebt += LANDING_RATE * depth * dt
        while (landingDebt >= 1) {
          landingDebt -= 1
          if (drops.length >= MAX_DROPS) continue
          const radius =
            Math.random() < LARGE_SHARE
              ? LARGE_MIN_RADIUS + (LARGE_MAX_RADIUS - LARGE_MIN_RADIUS) * Math.random()
              : MIN_RADIUS + (LANDING_MAX_RADIUS - MIN_RADIUS) * Math.random() ** 3
          drops.push(newDrop((Math.random() * 2 - 1) * aspect, Math.random() * 2 - 1, radius))
        }

        // Flow outwards from the centre, the direction of travel, plus a little gravity. Moving
        // drops draw a streak behind them, as long as they travel in TAIL_SECONDS.
        down.set(0, -1, 0).applyQuaternion(cameraQuaternion.clone().invert())
        const flow = FLOW_SPEED * (speed / REFERENCE_SPEED)
        // Drops evaporate at full rate where none land, out of the cloud or near its edge, and at
        // half the rate while they land.
        const evaporation = EVAPORATION * (depth <= 0 ? 1 : 0.5)
        for (const drop of drops) {
          const mobility = Math.min(Math.max((drop.radius - CLING_RADIUS) / (FULL_FLOW_RADIUS - CLING_RADIUS), 0), 1)
          let vx = 0
          let vy = 0
          if (mobility > 0) {
            const r = Math.hypot(drop.x, drop.y)
            // Outwards, turned by the glass's grime and the drop's own wander, so drops meander
            // and follow the same channels; slower where the grime holds them.
            drop.wander += (Math.random() - 0.5) * WANDER_RATE * Math.sqrt(dt)
            drop.wander *= Math.exp(-dt / WANDER_SECONDS)
            const turn = grime(drop.x, drop.y) * GRIME_TURN + drop.wander
            const outward = r > 1e-4 ? Math.atan2(drop.y, drop.x) : drop.angle
            const nx = Math.cos(outward + turn)
            const ny = Math.sin(outward + turn)
            const hold = 1 - GRIME_HOLD * (0.5 + 0.5 * grime(drop.y * 1.7 + 3.1, drop.x * 1.3 - 1.7))
            const v = flow * mobility * Math.min(r, 1) * hold
            vx = nx * v + down.x * GRAVITY * mobility
            vy = ny * v + down.y * GRAVITY * mobility
            drop.x += vx * dt
            drop.y += vy * dt
          }
          const moving = Math.hypot(vx, vy)
          if (moving > 1e-4) drop.angle = Math.atan2(vy, vx)
          const targetTail = Math.min((moving * TAIL_SECONDS) / Math.max(drop.radius, 1e-4), MAX_TAIL)
          // Grow quickly, shrink back more slowly when the drop stops.
          const rate = targetTail > drop.tail ? 12 : 3
          drop.tail += (targetTail - drop.tail) * (1 - Math.exp(-rate * dt))
          drop.radius -= evaporation * dt
        }

        // Merge drops that touch: the larger takes the other's water, keeping the area. Only
        // drops in the same or neighbouring grid cells are compared, so a cell is at least as wide
        // as the largest touching distance.
        const cell = MAX_RADIUS * 2 * 0.8 + 1e-3
        grid.clear()
        const key = (cx: number, cy: number): number => (cx + 1000) * 4000 + (cy + 1000)
        for (const drop of drops) {
          const k = key(Math.floor(drop.x / cell), Math.floor(drop.y / cell))
          const list = grid.get(k)
          if (list) list.push(drop)
          else grid.set(k, [drop])
        }
        for (const a of drops) {
          if (a.radius <= 0) continue
          const cx = Math.floor(a.x / cell)
          const cy = Math.floor(a.y / cell)
          for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
              for (const b of grid.get(key(cx + ox, cy + oy)) ?? []) {
                if (b === a || b.radius <= 0 || a.radius <= 0) continue
                if (Math.hypot(a.x - b.x, a.y - b.y) < (a.radius + b.radius) * 0.8) {
                  const [big, small] = a.radius >= b.radius ? [a, b] : [b, a]
                  big.radius = Math.min(Math.hypot(big.radius, small.radius), MAX_RADIUS)
                  small.radius = 0
                }
              }
            }
          }
        }

        // Drop the gone, the evaporated and the ones off the screen.
        for (let i = drops.length - 1; i >= 0; i--) {
          const drop = drops[i]
          if (drop.radius <= 0.0005 || Math.abs(drop.x) > aspect + 0.1 || Math.abs(drop.y) > 1.1) {
            drops.splice(i, 1)
          }
        }
      }

      mesh.count = drops.length
      drops.forEach((drop, i) => {
        const halfLength = 1 + drop.tail
        dummy.position.set(drop.x, drop.y, 0)
        dummy.rotation.set(0, 0, drop.angle)
        dummy.scale.set(drop.radius * 2 * halfLength, drop.radius * 2, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        dropData.setXYZW(i, drop.radius, drop.seedA, drop.seedB, drop.tail)
      })
      mesh.instanceMatrix.needsUpdate = true
      dropData.needsUpdate = true

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
 * little, darker towards a drop's rim, with a small glint; then, in a cloud, through the mist:
 * spread and lifted towards its own soft average, which keeps dark scenes dark.
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
    const seen = color.mul(float(1).sub(rim.mul(0.3))).add(glint)
    if (debug) return mix(image.sample(screenUV), vec4(1, 0, 0, 1), smoothstep(0, 0.0005, h))
    const throughDrops = mix(image.sample(screenUV), seen, inside)
    // The mist: a wide, soft average of the image around the pixel, a little lighter, laid over
    // the drops and everything else.
    const spread = vec2(drops.texelUv.x.div(drops.texelUv.y), 1).mul(MIST_SPREAD / 2)
    const around = image
      .sample(screenUV.add(vec2(spread.x, 0)))
      .add(image.sample(screenUV.sub(vec2(spread.x, 0))))
      .add(image.sample(screenUV.add(vec2(0, spread.y))))
      .add(image.sample(screenUV.sub(vec2(0, spread.y))))
      .add(image.sample(screenUV.add(spread.mul(0.7))))
      .add(image.sample(screenUV.sub(spread.mul(0.7))))
      .add(image.sample(screenUV.add(vec2(spread.x, spread.y.negate()).mul(0.7))))
      .add(image.sample(screenUV.sub(vec2(spread.x, spread.y.negate()).mul(0.7))))
      .div(8)
    const veil = around.mul(1.1).add(0.03)
    return mix(throughDrops, veil, drops.mist.mul(MIST_STRENGTH))
  })() as Node<'vec4'>
}