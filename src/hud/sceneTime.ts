// The screen layer's text, top left: the scene's date and time, the time given to the atmosphere
// (?date=, ?time=), fixed for the flight, with "SCENE" in front so it is not taken for the
// viewer's own clock (the maintainer, 2026-10-07); below it, any further lines, such as where the
// aircraft is flying over. In HUD green with its glow, the HUD's text size.
import { HUD_FONT_FAMILY, hudStyle } from './hud'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
/** In degrees, as the aircraft's HUD: text height, line spacing, and the margin from the corner. */
const TEXT = 1.5
const LINE_SPACING = 2.1
const MARGIN = 1.5

/**
 * The second line: the aircraft the flight path is computed with, JSBSim's F-16 model ("General
 * Dynamics F-16A" in its file) (the maintainer, 2026-10-07).
 */
export const FLIGHT_MODEL_LINE = 'FLIGHT MODEL JSBSIM F-16A'

/** "SCENE 2026-10-07 16:30 JST". */
export function sceneTimeText(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS).toISOString()
  return `SCENE ${jst.slice(0, 10)} ${jst.slice(11, 16)} JST`
}

/**
 * Draws lines of text on the screen layer, from its top left corner down.
 * @param pixelsPerDegree at the boresight, from the camera's field of view
 */
export function drawScreenLines(
  context: CanvasRenderingContext2D,
  height: number,
  pixelsPerDegree: number,
  lines: readonly string[]
): void {
  const d = pixelsPerDegree
  context.save()
  hudStyle(context, height)
  context.font = `${Math.max(10, Math.round(TEXT * d))}px ${HUD_FONT_FAMILY}`
  context.textAlign = 'left'
  context.textBaseline = 'top'
  lines.forEach((line, i) => context.fillText(line, MARGIN * d, (MARGIN + i * LINE_SPACING) * d))
  context.restore()
}
