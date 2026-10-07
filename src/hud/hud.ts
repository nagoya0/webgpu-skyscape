// The HUD (docs/ideas.md), in two layers drawn with Canvas 2D and laid over the finished image as
// the last step of the post-processing, so a recording of the canvas shows it:
// - the screen layer, fixed to the screen (the time of day, for example);
// - the aircraft layer, the aircraft's own head-up display. It is drawn in the airframe's frame,
//   looking forward, and laid over the image turned by the camera's offset from the airframe
//   (its shake), so it shakes with the airframe and symbols stay on the scene they mark.
// The aircraft layer lies under the screen layer and over the water drops, which are outside the
// canopy. A layer is uploaded to the GPU only when it has been drawn since the last frame.
import { Fn, mix, screenUV, texture, uniform, vec2, vec3, vec4 } from 'three/tsl'
import {
  CanvasTexture,
  LinearFilter,
  Matrix3,
  Matrix4,
  SRGBColorSpace,
  Vector2,
  type Node,
  type Quaternion,
  type WebGPURenderer
} from 'three/webgpu'

/**
 * The HUD's typeface, for every layer: Share Tech Mono (Carrois Type Design, SIL Open Font
 * License), chosen by the maintainer from eight open typefaces (2026-10-07). Bundled in
 * public/fonts/ and loaded by loadHudFont() before the HUD draws.
 */
export const HUD_FONT_FAMILY = "'Share Tech Mono', monospace"

/** Loads the HUD's typeface, so the canvas does not draw with a fallback. */
export async function loadHudFont(): Promise<void> {
  const face = new FontFace('Share Tech Mono', `url(${import.meta.env.BASE_URL}fonts/ShareTechMono-Regular.ttf)`)
  document.fonts.add(await face.load())
}

/** How opaque the HUD is laid over the image, for both layers (0 to 1). */
export const HUD_OPACITY = 0.8

/** HUD green, as the maintainer wants the text and lines (2026-10-07). */
export const HUD_GREEN = 'rgb(115, 255, 150)'

/**
 * Sets a context to draw in HUD green with a glow around every stroke and letter. The glow is
 * the canvas's own shadow blur, so it costs nothing on the GPU.
 * @param height the canvas height in pixels, which scales the glow
 */
export function hudStyle(context: CanvasRenderingContext2D, height: number): void {
  context.fillStyle = HUD_GREEN
  context.strokeStyle = HUD_GREEN
  context.shadowColor = HUD_GREEN
  context.shadowBlur = Math.max(2, height / 180)
  context.lineCap = 'round'
  context.lineJoin = 'round'
}

export interface HudLayer {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  /** Call after drawing, so the GPU gets the new image this frame. */
  changed(): void
}

export interface Hud {
  readonly screen: HudLayer
  /** Drawn in the airframe's frame: the image centre is straight ahead of the aircraft. */
  readonly aircraft: HudLayer
  /**
   * Call each frame before drawing the layers: matches the canvases to the drawing buffer, and
   * takes the camera's offset from the airframe and its vertical field of view.
   * @returns true when the canvases were resized and cleared, so everything must be drawn again
   */
  update(renderer: WebGPURenderer, offset: Quaternion, fovDegrees: number): boolean
  /** Uploads the layers drawn this frame; call before the post-processing. */
  upload(): void
}

interface Layer extends HudLayer {
  texture: CanvasTexture
  dirty: boolean
}

function createLayer(): Layer {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No 2D canvas context for the HUD')
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.flipY = false
  map.generateMipmaps = false
  map.minFilter = LinearFilter
  map.magFilter = LinearFilter
  const layer: Layer = {
    canvas,
    context,
    texture: map,
    dirty: true,
    changed() {
      layer.dirty = true
    }
  }
  return layer
}

export function createHud(): Hud & {
  readonly screenLayer: Layer
  readonly aircraftLayer: Layer
  /** Camera offset from the airframe as a rotation matrix (camera axes). */
  readonly offsetMatrix: Node<'mat3'>
  /** (tan of half the vertical field of view, aspect ratio). */
  readonly projection: Node<'vec2'>
} {
  const screenLayer = createLayer()
  const aircraftLayer = createLayer()
  const size = new Vector2()
  const offsetMatrix = uniform(new Matrix3())
  const projection = uniform(new Vector2(1, 1))
  const rotation = new Matrix4()

  return {
    screen: screenLayer,
    aircraft: aircraftLayer,
    screenLayer,
    aircraftLayer,
    offsetMatrix: offsetMatrix as unknown as Node<'mat3'>,
    projection: projection as unknown as Node<'vec2'>,
    update(renderer, offset, fovDegrees) {
      renderer.getDrawingBufferSize(size)
      offsetMatrix.value.setFromMatrix4(rotation.makeRotationFromQuaternion(offset))
      projection.value.set(Math.tan((fovDegrees * Math.PI) / 360), size.x / size.y)
      let resized = false
      for (const layer of [screenLayer, aircraftLayer]) {
        if (layer.canvas.width !== size.x || layer.canvas.height !== size.y) {
          layer.canvas.width = size.x
          layer.canvas.height = size.y
          // A new size needs a new GPU texture.
          layer.texture.dispose()
          layer.dirty = true
          resized = true
        }
      }
      return resized
    },
    upload() {
      for (const layer of [screenLayer, aircraftLayer]) {
        if (layer.dirty) {
          layer.texture.needsUpdate = true
          layer.dirty = false
        }
      }
    }
  }
}

/**
 * Lays the HUD over the finished image: the aircraft layer, turned by the camera's offset from
 * the airframe, then the screen layer.
 */
export function hudComposite(image: Node<'vec4'>, hud: ReturnType<typeof createHud>): Node<'vec4'> {
  return Fn(() => {
    const tanHalf = hud.projection.x
    const aspect = hud.projection.y
    // The view direction through this pixel in camera axes (x right, y up, looking along −z),
    // turned into the airframe's axes, and projected back to the airframe's image.
    const ndc = vec2(screenUV.x.mul(2).sub(1), screenUV.y.mul(2).sub(1).negate())
    const direction = vec3(ndc.x.mul(aspect).mul(tanHalf), ndc.y.mul(tanHalf), -1)
    const turned = hud.offsetMatrix.mul(direction)
    const projected = turned.xy.div(turned.z.negate()).div(vec2(aspect.mul(tanHalf), tanHalf))
    const aircraftUv = vec2(projected.x.add(1).mul(0.5), projected.y.negate().add(1).mul(0.5))
    const aircraft = texture(hud.aircraftLayer.texture).sample(aircraftUv)
    const screen = texture(hud.screenLayer.texture).sample(screenUV)
    const withAircraft = mix(image.rgb, aircraft.rgb, aircraft.a.mul(HUD_OPACITY))
    return vec4(mix(withAircraft, screen.rgb, screen.a.mul(HUD_OPACITY)), image.a)
  })() as Node<'vec4'>
}
