// Colour grading after tone mapping (ADR 0031), screen based (wgsl/colorGrade.wgsl). The settings
// are uniforms; the neutral ones leave the image as it is.
import { uniform, vec4, wgslFn } from 'three/tsl'
import { Vector3, type Node } from 'three/webgpu'

import colorGradeCode from './wgsl/colorGrade.wgsl?raw'

const colorGradeFn = wgslFn(colorGradeCode)

export interface GradeSettings {
  /** Colour temperature, -1 cooler to 1 warmer. */
  temperature: number
  /** Tint, -1 green to 1 magenta. */
  tint: number
  contrast: number
  saturation: number
  vibrance: number
  /** Shift of blue hues in turns of the colour wheel. */
  blueHue: number
  blueSaturation: number
  /** Hue of the colour added to the shadows (0 to 1 around the wheel) and how much. */
  shadowHue: number
  shadowAmount: number
  highlightHue: number
  highlightAmount: number
}

export const NEUTRAL_GRADE: GradeSettings = {
  temperature: 0,
  tint: 0,
  contrast: 1,
  saturation: 1,
  vibrance: 0,
  blueHue: 0,
  blueSaturation: 1,
  shadowHue: 0.6,
  shadowAmount: 0,
  highlightHue: 0.1,
  highlightAmount: 0
}

/**
 * The demo's grade, chosen by the maintainer in the browser (2026-10-09, ADR 0043): more contrast,
 * and the blues shifted a little and a little more saturated; the rest neutral.
 */
export const DEMO_GRADE: GradeSettings = { ...NEUTRAL_GRADE, contrast: 1.3, blueHue: 0.01, blueSaturation: 1.1 }

/** A hue's colour less its average, so that a tint changes the colour more than the brightness. */
function tintColor(hue: number, amount: number, target: Vector3): Vector3 {
  const channel = (n: number): number => {
    const k = (n + hue * 6) % 6
    return 1 - Math.max(0, Math.min(k, 4 - k, 1))
  }
  target.set(channel(5), channel(3), channel(1))
  const mean = (target.x + target.y + target.z) / 3
  return target.subScalar(mean).multiplyScalar(amount * 0.15)
}

export function createColorGrading() {
  const whiteBalance = uniform(new Vector3(1, 1, 1))
  const contrast = uniform(1)
  const saturation = uniform(1)
  const vibrance = uniform(0)
  const blueHue = uniform(0)
  const blueSaturation = uniform(1)
  const shadowTint = uniform(new Vector3())
  const highlightTint = uniform(new Vector3())

  return {
    /** The graded colour; the alpha is kept. */
    node(color: Node<'vec4'>): Node<'vec4'> {
      const rgb = colorGradeFn({
        color: color.xyz,
        whiteBalance,
        contrast,
        saturation,
        vibrance,
        blueHue,
        blueSaturation,
        shadowTint,
        highlightTint
      }) as Node<'vec3'>
      return vec4(rgb, color.w)
    },
    set(settings: GradeSettings): void {
      // Warmer adds red and takes blue; a tint towards magenta takes green.
      whiteBalance.value.set(1 + 0.15 * settings.temperature, 1 - 0.1 * settings.tint, 1 - 0.15 * settings.temperature)
      contrast.value = settings.contrast
      saturation.value = settings.saturation
      vibrance.value = settings.vibrance
      blueHue.value = settings.blueHue
      blueSaturation.value = settings.blueSaturation
      tintColor(settings.shadowHue, settings.shadowAmount, shadowTint.value)
      tintColor(settings.highlightHue, settings.highlightAmount, highlightTint.value)
    }
  }
}

export type ColorGrading = ReturnType<typeof createColorGrading>
