// The HUD's Current G, after the DCS: F-16C Viper guide (HUD symbology, item 2): the load factor
// to a tenth of a G, from -9.9 to +9.9, above the top of the velocity scale. Followed by a "G",
// which the real HUD does not show (the maintainer, 2026-10-08). Moved here from the debug text.
import { HUD_FONT_FAMILY, hudStyle } from './hud'
import { velocityTapeTop } from './velocityScale'

/** Gap between the tape's top and the text, and the text height, in degrees. */
const GAP = 0.6
const TEXT = 1.5

/** "1.0G": a tenth of a G, clamped to ±9.9. */
export function currentGText(loadFactor: number): string {
  const g = Math.max(-9.9, Math.min(9.9, loadFactor))
  // Avoid "-0.0".
  const tenths = Math.round(g * 10)
  return `${(tenths === 0 ? 0 : tenths / 10).toFixed(1)}G`
}

/**
 * Draws the current G on the aircraft layer.
 * @param pixelsPerDegree at the boresight, from the camera's field of view
 */
export function drawCurrentG(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelsPerDegree: number,
  loadFactor: number
): void {
  const d = pixelsPerDegree
  const top = velocityTapeTop(width, height, d)
  context.save()
  hudStyle(context, height)
  context.font = `${Math.max(10, Math.round(TEXT * d))}px ${HUD_FONT_FAMILY}`
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillText(currentGText(loadFactor), top.x, top.y - GAP * d)
  context.restore()
}
