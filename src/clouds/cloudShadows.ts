// The cloud shadow maps, as in takram's ShadowPass: each frame the clouds are marched from the
// sun's side into cascaded shadow maps (front distance, mean extinction, max optical depth and
// its tail), which the clouds use for long-range self-shadowing and the scene for cloud shadows.
// The cascades sit side by side in one texture. Rendered before the scene each frame, since the
// scene's materials read them.
import { ivec2, mrt, screenCoordinate, texture, uniform, vec2 } from 'three/tsl'
import {
  FloatType,
  LinearFilter,
  Matrix4,
  NodeMaterial,
  QuadMesh,
  RenderTarget,
  RendererUtils,
  Vector3,
  Vector4,
  type Node,
  type PerspectiveCamera,
  type TextureNode,
  type WebGPURenderer
} from 'three/webgpu'

import { CascadedShadowMaps } from './cascadedShadowMaps'

export const SHADOW_CASCADES = 3

export interface ShadowMarchInputs {
  uv: Node<'vec2'>
  cascade: Node<'int'>
  inverseMatrices: Node<'mat4'>[]
  previousMatrices: Node<'mat4'>[]
}

export interface ShadowResolveInputs {
  coord: Node<'ivec2'>
  current: TextureNode
  depthVelocity: TextureNode
  history: TextureNode
}

type RendererState = ReturnType<typeof RendererUtils.resetRendererState>

function createTarget(width: number, height: number, count: number): RenderTarget {
  const target = new RenderTarget(width, height, { depthBuffer: false, type: FloatType, count })
  for (const t of target.textures) {
    t.minFilter = LinearFilter
    t.magFilter = LinearFilter
    t.generateMipmaps = false
  }
  return target
}

export class CloudShadows {
  readonly maps: CascadedShadowMaps
  /** World to each cascade's clip space (WebGL convention). */
  readonly matrices = Array.from({ length: SHADOW_CASCADES }, () => uniform(new Matrix4()))
  readonly inverseMatrices = Array.from({ length: SHADOW_CASCADES }, () => uniform(new Matrix4()))
  readonly previousMatrices = Array.from({ length: SHADOW_CASCADES }, () => uniform(new Matrix4()))
  /** Each cascade's (start, end) as fractions of `far`: cascades 0 and 1, then 2 and 3. */
  readonly intervalsA = uniform(new Vector4())
  readonly intervalsB = uniform(new Vector4())
  readonly far = uniform(0)
  readonly mapSizeNode: Node<'float'>
  /** The shadow maps to read: (front distance, mean extinction, max optical depth, tail). */
  readonly textureNode: TextureNode

  private readonly current: RenderTarget
  private resolveTarget: RenderTarget | null = null
  private historyTarget: RenderTarget | null = null
  private readonly material = new NodeMaterial()
  private readonly resolveMaterial = new NodeMaterial()
  private readonly historyNode: TextureNode
  private readonly mesh = new QuadMesh(this.material)
  private readonly sunDirection = new Vector3()
  private readonly up = new Vector3()
  private hasPrevious = false
  private rendererState?: RendererState

  constructor(
    private readonly camera: PerspectiveCamera,
    readonly mapSize: number,
    maxFar: number,
    march: (inputs: ShadowMarchInputs) => Node<'mat2'>,
    /** The temporal resolve (TEMPORAL_PASS); without it the shadow maps are used as marched. */
    resolve: ((inputs: ShadowResolveInputs) => Node<'vec4'>) | null
  ) {
    this.maps = new CascadedShadowMaps(SHADOW_CASCADES, mapSize, maxFar)
    this.mapSizeNode = uniform(mapSize)

    // takram renders the cascades into a half-float array texture; here they are side by side
    // in one texture, 32-bit since the front distance can exceed half-float range.
    const width = mapSize * SHADOW_CASCADES
    this.current = createTarget(width, mapSize, 2)
    this.current.textures[0].name = 'output'
    this.current.textures[1].name = 'depthVelocity'

    const texel = screenCoordinate.xy.floor()
    const cascadeFloat = texel.x.div(mapSize).floor()
    const uv = vec2(texel.x.sub(cascadeFloat.mul(mapSize)), texel.y).add(0.5).div(mapSize)
    // A matrix's element is its column; @types/three 0.186 does not type element() on VarNode.
    const result = march({
      uv,
      cascade: cascadeFloat.toInt(),
      inverseMatrices: this.inverseMatrices,
      previousMatrices: this.previousMatrices
    }).toVar() as unknown as { element(index: number): Node<'vec4'> }
    const color = result.element(0)
    this.material.name = 'cloud_shadow_march'
    this.material.outputNode = color
    this.material.mrtNode = mrt({ output: color, depthVelocity: result.element(1) })

    this.textureNode = texture(this.current.textures[0])
    this.historyNode = texture(this.current.textures[0])
    if (resolve) {
      this.resolveTarget = createTarget(width, mapSize, 1)
      this.historyTarget = createTarget(width, mapSize, 1)
      this.historyNode.value = this.historyTarget.texture
      this.resolveMaterial.name = 'cloud_shadow_resolve'
      this.resolveMaterial.outputNode = resolve({
        coord: ivec2(screenCoordinate.xy.floor()),
        current: texture(this.current.textures[0]),
        depthVelocity: texture(this.current.textures[1]),
        history: this.historyNode
      })
    }
  }

  /**
   * Marches the shadow maps for this frame.
   * @param sunDirectionWorld towards the sun, in world space
   * @param earthCenter the earth's centre in world space
   */
  update(renderer: WebGPURenderer, sunDirectionWorld: Vector3, earthCenter: Vector3): void {
    const sun = this.sunDirection.copy(sunDirectionWorld).normalize()
    // takram: the light is further from the cascades when the sun is low.
    const zenith = sun.dot(this.up.copy(this.camera.position).sub(earthCenter).normalize())
    const distance = 1e6 + (1e3 - 1e6) * zenith
    this.maps.update(this.camera, sun, distance)

    const { cascades } = this.maps
    for (let i = 0; i < SHADOW_CASCADES; i++) {
      this.matrices[i].value.copy(cascades[i].matrix)
      this.inverseMatrices[i].value.copy(cascades[i].inverseMatrix)
      if (!this.hasPrevious) this.previousMatrices[i].value.copy(cascades[i].matrix)
    }
    const interval = (i: number) => cascades[i]?.interval ?? { x: 1, y: 1 }
    this.intervalsA.value.set(interval(0).x, interval(0).y, interval(1).x, interval(1).y)
    this.intervalsB.value.set(interval(2).x, interval(2).y, interval(3).x, interval(3).y)
    this.far.value = this.maps.far

    this.rendererState = RendererUtils.resetRendererState(renderer, this.rendererState ?? ({} as RendererState))
    renderer.setRenderTarget(this.current)
    this.mesh.material = this.material
    this.mesh.render(renderer)
    if (this.resolveTarget && this.historyTarget) {
      renderer.setRenderTarget(this.resolveTarget)
      this.mesh.material = this.resolveMaterial
      this.mesh.render(renderer)
      // The resolved maps are this frame's output and next frame's history.
      const resolved = this.resolveTarget
      this.resolveTarget = this.historyTarget
      this.historyTarget = resolved
      this.textureNode.value = resolved.texture
      this.historyNode.value = resolved.texture
    }
    RendererUtils.restoreRendererState(renderer, this.rendererState)

    for (let i = 0; i < SHADOW_CASCADES; i++) this.previousMatrices[i].value.copy(cascades[i].matrix)
    this.hasPrevious = true
  }

  dispose(): void {
    this.current.dispose()
    this.resolveTarget?.dispose()
    this.historyTarget?.dispose()
    this.material.dispose()
    this.resolveMaterial.dispose()
  }
}
