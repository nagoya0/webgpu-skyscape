// Post-processing (ADR 0010): aerial perspective, then whatever composites over it (clouds),
// lens flare, tone mapping, temporal anti-aliasing, and the water drops on the screen last, as
// they sit on the screen and must not be smeared by the anti-aliasing's history, then the HUD.
import { aerialPerspective } from '@takram/three-atmosphere/webgpu'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'
import { convertToTexture, mrt, output, pass, toneMapping, uniform } from 'three/tsl'
import { dropsComposite, type Drops } from '../effects/drops'
import { hudComposite, type createHud } from '../hud/hud'
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
  stages: readonly CompositeStage[] = [],
  options: {
    lensFlare?: boolean
    /** (shadow length, shadow start) in the atmosphere's units, for light shafts. */
    shadowLength?: Node<'vec2'>
    /** Water drops on the screen (ADR 0011). */
    drops?: Drops
    /** Show the drops' height map in red (?dropsdebug). */
    dropsDebug?: boolean
    /** The HUD, laid over everything else. */
    hud?: ReturnType<typeof createHud>
  } = {}
): Pipeline {
  const passNode = pass(scene, camera, { samples: 0 }).setMRT(
    mrt({ output, velocity: asNode(highpVelocity) })
  )
  const color = passNode.getTextureNode('output')
  const depth = passNode.getTextureNode('depth')
  const velocity = passNode.getTextureNode('velocity')

  // TYPE-BRIDGE: takram's aerialPerspective is typed against @types/three 0.184.
  const aerial = aerialPerspective(color, depth, null, options.shadowLength as Parameters<typeof aerialPerspective>[3])
  const composited = stages.reduce<Node<'vec4'>>((input, stage) => stage(input, depth), asNode(aerial))
  const flare = options.lensFlare === false ? null : lensFlare(composited)
  const exposure = uniform(3)
  const toneMapped = toneMapping(AgXToneMapping, exposure, flare ? asNode(flare) : composited)
  const taa = temporalAntialias(toneMapped, depth, velocity, camera)
  const withDrops = options.drops
    ? dropsComposite(convertToTexture(asNode<'vec4'>(taa)), options.drops, options.dropsDebug)
    : asNode<'vec4'>(taa)
  const final = options.hud ? hudComposite(withDrops, options.hud) : withDrops

  // Dithering is a vec3; adding it to the vec4 output leaves alpha as it is, as upstream does.
  const renderPipeline = new RenderPipeline(renderer, final.add(asNode<'vec4'>(dithering)))

  return {
    exposure,
    render() {
      renderPipeline.render()
    },
    dispose() {
      renderPipeline.dispose()
      taa.dispose()
      flare?.dispose()
      aerial.dispose()
      passNode.dispose()
    }
  }
}
