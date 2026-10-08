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
import { convertToTexture, mix, mrt, output, pass, toneMapping, uniform } from 'three/tsl'
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
  /**
   * Post effects, 1 on and 0 off, switched together from the settings window (ADR 0037): takram's
   * lens flare, the tone mapping (off, the exposed image is shown as it is, clipped), and the water
   * drops on the screen. Switched by uniforms, so nothing is rebuilt; the effects still run.
   */
  effects: { flare: { value: number }; toneMapping: { value: number }; drops: { value: number } }
  render(): void
  dispose(): void
}

export function createPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  stages: readonly CompositeStage[] = [],
  options: {
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
  // Moonlight scattered in the sky and in the aerial perspective, for the night (off by default
  // in takram). TYPE-BRIDGE: the sky node is typed as a plain node.
  aerial.moonScattering = true
  const skyNode = aerial.skyNode as unknown as {
    moonScattering: boolean
    starsNode: { intensity: { value: number } }
  }
  skyNode.moonScattering = true
  // Fewer stars than takram's default boost of 1,000 shows: about what a city dweller sees, down
  // to the third or fourth magnitude (the maintainer, 2026-10-08).
  skyNode.starsNode.intensity.value = 30
  const composited = stages.reduce<Node<'vec4'>>((input, stage) => stage(input, depth), asNode(aerial))
  const flare = lensFlare(composited)
  // takram's lens flare, tuned by the maintainer in the browser (2026-10-09, ADR 0042): bloom
  // stronger but spread less widely (at takram's 0.85 the glints' bloom whitened the whole sky),
  // more ghosts, the halo's arc smeared a little along its ring, shorter glare. The halo's arc
  // spread is this project's patch of @takram/three-geospatial.
  // TYPE-BRIDGE: the components are typed as plain nodes.
  const flareParts = flare as unknown as {
    bloomIntensity: { value: number }
    bloomNode: { blendAmount: { value: number } }
    ghostNode: { intensity: { value: number } }
    haloNode: { arcSpread: { value: number } }
    glareNode: { sizeScale: { value: { x: number } } }
  }
  flareParts.bloomIntensity.value = 0.355
  flareParts.bloomNode.blendAmount.value = 0.583
  flareParts.ghostNode.intensity.value = 8.91e-5
  flareParts.haloNode.arcSpread.value = 0.1
  flareParts.glareNode.sizeScale.value.x = 1
  const effects = { flare: uniform(1), toneMapping: uniform(1), drops: uniform(1) }
  const withFlare = mix(composited, asNode<'vec4'>(flare), effects.flare)
  const exposure = uniform(3)
  const toneMapped = mix(withFlare.mul(exposure), toneMapping(AgXToneMapping, exposure, withFlare), effects.toneMapping)
  const taa = temporalAntialias(toneMapped, depth, velocity, camera)
  const withDrops = options.drops
    ? mix(asNode<'vec4'>(taa), dropsComposite(convertToTexture(asNode<'vec4'>(taa)), options.drops, options.dropsDebug), effects.drops)
    : asNode<'vec4'>(taa)
  const final = options.hud ? hudComposite(withDrops, options.hud) : withDrops

  // Dithering is a vec3; adding it to the vec4 output leaves alpha as it is, as upstream does.
  const renderPipeline = new RenderPipeline(renderer, final.add(asNode<'vec4'>(dithering)))

  return {
    exposure,
    effects,
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
