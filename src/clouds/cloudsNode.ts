// The cloud passes, as in takram's CloudsPass: each frame the clouds are ray marched into a
// cloud buffer (colour, and front distance with velocity), resolved against the history into a
// full-resolution buffer, and composited over the scene. With TEMPORAL_UPSCALE the cloud buffer
// has a quarter of the resolution in each direction and fills in over 16 frames
// (wgsl/cloudsResolve.wgsl).
import { mrt, screenCoordinate, screenUV, texture, uniform, vec4 } from 'three/tsl'
import {
  FloatType,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  NearestFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RenderTarget,
  RendererUtils,
  TempNode,
  Vector2,
  type Camera,
  type Node,
  type NodeBuilder,
  type NodeFrame,
  type Texture,
  type TextureNode
} from 'three/webgpu'

// takram's Bayer order (bayer.ts): the 4 × 4 block's pixels, row by row, numbered by the frame
// in which each is rendered.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Inputs of the cloud passes, as nodes. */
export interface CloudPassInputs {
  /** Builds the ray march for a full-resolution pixel and its UV; returns clouds.wgsl's columns. */
  march(pixel: Node<'vec2'>, uv: Node<'vec2'>, previousViewProjection: Node<'mat4'>): Node<'mat4'>
  /** Builds the resolve; takes the textures and returns the resolved colour. */
  resolve(inputs: {
    color: TextureNode
    depthVelocity: TextureNode
    history: TextureNode
    ownedOffset: Node<'vec2'>
  }): Node<'vec4'>
  temporalUpscale: boolean
}

type RendererState = ReturnType<typeof RendererUtils.resetRendererState>

function createTarget(name: string, type: typeof FloatType | typeof HalfFloatType, count = 1): RenderTarget {
  const target = new RenderTarget(1, 1, { depthBuffer: false, type, count })
  for (const t of target.textures) {
    t.minFilter = LinearFilter
    t.magFilter = LinearFilter
    t.generateMipmaps = false
  }
  target.textures[0].name = count > 1 ? 'output' : name
  return target
}

export class CloudsNode extends TempNode {
  static get type(): string {
    return 'CloudsNode'
  }

  private readonly current: RenderTarget
  private resolveTarget: RenderTarget
  private historyTarget: RenderTarget
  private readonly marchMaterial = new NodeMaterial()
  private readonly resolveMaterial = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.marchMaterial)
  private readonly historyNode: TextureNode
  private readonly outputNode: TextureNode
  private readonly fullSize = uniform(new Vector2())
  private readonly ownedOffset = uniform(new Vector2())
  private readonly previousViewProjection = uniform(new Matrix4())
  private readonly size = new Vector2()
  private frameCount = 0
  private needsClear = true
  private hasPrevious = false
  private rendererState?: RendererState

  constructor(
    private readonly input: Node<'vec4'>,
    private readonly camera: Camera,
    private readonly inputs: CloudPassInputs
  ) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME

    // Cloud buffer: colour, and front distance with velocity. Distances reach 1e8 m, beyond half
    // floats, so both are 32-bit.
    this.current = createTarget('clouds', FloatType, 2)
    this.current.textures[1].name = 'depthVelocity'
    this.current.textures[1].minFilter = NearestFilter
    this.current.textures[1].magFilter = NearestFilter
    this.resolveTarget = createTarget('cloudsResolve', HalfFloatType)
    this.historyTarget = createTarget('cloudsHistory', HalfFloatType)

    // March: one pixel per cloud buffer texel. With TEMPORAL_UPSCALE, the full-resolution pixel
    // of its 4 × 4 block rendered this frame.
    const texelCoord = screenCoordinate.xy.floor()
    const pixel = inputs.temporalUpscale ? texelCoord.mul(4).add(this.ownedOffset) : texelCoord
    const uv = pixel.add(0.5).div(this.fullSize)
    // A matrix's element is its column; @types/three 0.186 does not type element() on VarNode.
    const result = inputs.march(pixel, uv, this.previousViewProjection).toVar() as unknown as {
      element(index: number): Node<'vec4'>
    }
    const color = result.element(0)
    this.marchMaterial.name = 'clouds_march'
    this.marchMaterial.outputNode = color
    this.marchMaterial.mrtNode = mrt({ output: color, depthVelocity: result.element(1) })

    this.historyNode = texture(this.historyTarget.texture)
    this.resolveMaterial.name = 'clouds_resolve'
    this.resolveMaterial.outputNode = inputs.resolve({
      color: texture(this.current.textures[0]),
      depthVelocity: texture(this.current.textures[1]),
      history: this.historyNode,
      ownedOffset: this.ownedOffset
    })

    this.outputNode = texture(this.resolveTarget.texture)
    this.mesh.name = 'clouds'
  }

  private setSize(width: number, height: number): void {
    if (width === this.size.x && height === this.size.y) return
    this.size.set(width, height)
    this.fullSize.value.set(width, height)
    const scale = this.inputs.temporalUpscale ? 4 : 1
    this.current.setSize(Math.ceil(width / scale), Math.ceil(height / scale))
    this.resolveTarget.setSize(width, height)
    this.historyTarget.setSize(width, height)
    this.needsClear = true
  }

  override updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer
    if (!renderer) return
    const size = renderer.getDrawingBufferSize(new Vector2())
    this.setSize(size.x, size.y)

    const index = BAYER.indexOf(this.frameCount % 16)
    this.ownedOffset.value.set(index % 4, Math.floor(index / 4))
    if (!this.hasPrevious) this.storeViewProjection()

    this.rendererState = RendererUtils.resetRendererState(renderer, this.rendererState ?? ({} as RendererState))
    if (this.needsClear) {
      renderer.setClearColor(0x000000, 0)
      for (const target of [this.resolveTarget, this.historyTarget]) {
        renderer.setRenderTarget(target)
        renderer.clear()
      }
      this.needsClear = false
    }
    renderer.setRenderTarget(this.current)
    this.mesh.material = this.marchMaterial
    this.mesh.render(renderer)
    renderer.setRenderTarget(this.resolveTarget)
    this.mesh.material = this.resolveMaterial
    this.mesh.render(renderer)
    RendererUtils.restoreRendererState(renderer, this.rendererState)

    // The resolved buffer is this frame's output and next frame's history.
    const resolved = this.resolveTarget
    this.resolveTarget = this.historyTarget
    this.historyTarget = resolved
    this.outputNode.value = resolved.texture as Texture
    this.historyNode.value = resolved.texture as Texture

    this.storeViewProjection()
    this.frameCount++
  }

  private storeViewProjection(): void {
    this.previousViewProjection.value.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    this.hasPrevious = true
  }

  override setup(_builder: NodeBuilder): Node<'vec4'> {
    const clouds = this.outputNode.sample(screenUV)
    return vec4(this.input.rgb.mul(clouds.a.oneMinus()).add(clouds.rgb), this.input.a)
  }

  override dispose(): void {
    this.current.dispose()
    this.resolveTarget.dispose()
    this.historyTarget.dispose()
    this.marchMaterial.dispose()
    this.resolveMaterial.dispose()
    super.dispose()
  }
}
