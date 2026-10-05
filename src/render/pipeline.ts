// Post-processing (ADR 0010): aerial perspective, then whatever composites over it (clouds,
// rain), lens flare, tone mapping and temporal anti-aliasing.
import { aerialPerspective } from '@takram/three-atmosphere/webgpu'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'
import { mrt, output, pass, toneMapping, uniform } from 'three/tsl'
import {
  AgXToneMapping,
  RenderPipeline,
  type Camera,
  type Node,
  type Scene,
  type TextureNode,
  type WebGPURenderer
} from 'three/webgpu'

// TYPE-BRIDGE: takram's node classes are typed against @types/three 0.184, whose Node differs
// from 0.186. At run time they are ordinary Three.js nodes.
export const asNode = <T extends string = string>(node: unknown): Node<T> => node as Node<T>

/** Composites something over the scene after the aerial perspective, in HDR luminance. */
export type CompositeStage = (input: Node<'vec4'>, depth: TextureNode) => Node<'vec4'>

export interface Pipeline {
  /** Exposure before tone mapping. */
  exposure: { value: number }
  render(): void
  dispose(): void
}

export function createPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  stages: readonly CompositeStage[] = []
): Pipeline {
  const passNode = pass(scene, camera, { samples: 0 }).setMRT(
    mrt({ output, velocity: asNode(highpVelocity) })
  )
  const color = passNode.getTextureNode('output')
  const depth = passNode.getTextureNode('depth')
  const velocity = passNode.getTextureNode('velocity')

  const aerial = aerialPerspective(color, depth)
  const composited = stages.reduce<Node<'vec4'>>((input, stage) => stage(input, depth), asNode(aerial))
  const flare = lensFlare(composited)
  const exposure = uniform(3)
  const toneMapped = toneMapping(AgXToneMapping, exposure, asNode(flare))
  const taa = temporalAntialias(toneMapped, depth, velocity, camera)

  // Dithering is a vec3; adding it to the vec4 output leaves alpha as it is, as upstream does.
  const renderPipeline = new RenderPipeline(renderer, asNode<'vec4'>(taa).add(asNode<'vec4'>(dithering)))

  return {
    exposure,
    render() {
      renderPipeline.render()
    },
    dispose() {
      renderPipeline.dispose()
      taa.dispose()
      flare.dispose()
      aerial.dispose()
      passNode.dispose()
    }
  }
}
