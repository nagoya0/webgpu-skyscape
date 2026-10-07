// The scene's date and time on the screen layer, top left: the time given to the atmosphere
// (?date=, ?time=), fixed for the flight. "SCENE" in front, so it is not taken for the viewer's own
// clock (the maintainer, 2026-10-07). In HUD green with its glow, the HUD's text size.
import { HUD_FONT_FAMILY, hudStyle } from './hud'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
/** In degrees, as the aircraft's HUD: text height, and the margin from the screen's corner. */
const TEXT = 1.5
const MARGIN = 1.5

/** "SCENE 2026-10-07 16:30 JST". */
export function sceneTimeText(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS).toISOString()
  return `SCENE ${jst.slice(0, 10)} ${jst.slice(11, 16)} JST`
}

/**
 * Draws the scene's time on the screen layer.
 * @param pixelsPerDegree at the boresight, from the camera's field of view
 */
export function drawSceneTime(
  context: CanvasRenderingContext2D,
  height: number,
  pixelsPerDegree: number,
  date: Date
): void {
  const d = pixelsPerDegree
  context.save()
  hudStyle(context, height)
  context.font = `${Math.max(10, Math.round(TEXT * d))}px ${HUD_FONT_FAMILY}`
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillText(sceneTimeText(date), MARGIN * d, MARGIN * d)
  context.restore()
}
