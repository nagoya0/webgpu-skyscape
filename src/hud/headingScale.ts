// The HUD's Heading Scale, after the DCS: F-16C Viper guide (HUD symbology, item 20): the
// aircraft's magnetic heading on a moving horizontal tape, a major tick every 10° labelled with two
// digits (19 for 190°) and a minor tick every 5°; a fixed lubber line above the tape's centre and
// the heading as three digits in a box below it.
//
// The tape is compressed as in the guide's picture (a degree of heading about 0.19° on the HUD)
// and, like the velocity scale, drawn three times the guide's size (docs/ideas.md).
import { hudStyle, HUD_FONT_FAMILY } from './hud'

/**
 * Where the tape's line is, in degrees below the boresight: the lubber line's top level with the
 * bottom of the velocity and altitude tapes, about 13.8° down (the maintainer).
 */
const TAPE_DOWN = 16.3
/** The rest in degrees too. Degrees on the HUD per degree of heading, and heading shown either side. */
const DEGREES_PER_HEADING = 0.57
const SPAN_HEADING = 15
/** Ticks hang down from the tape's line. */
const MINOR_TICK = 0.6
const MAJOR_TICK = 0.9
/** The lubber line stands this tall, starting this far above the tape's line, as in the guide. */
const LUBBER = 2.3
const LUBBER_GAP = 0.2
/** Gap between the ticks and the labels' row. */
const LABEL_GAP = 0.3
/** Text height and line width. */
const TEXT = 1.5
const LINE = 0.15

/**
 * Draws the heading scale on the aircraft layer.
 * @param pixelsPerDegree at the boresight, from the camera's field of view
 * @param heading magnetic heading in degrees
 */
export function drawHeadingScale(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelsPerDegree: number,
  heading: number
): void {
  const d = pixelsPerDegree
  const cx = width / 2
  const tapeY = height / 2 + TAPE_DOWN * d
  const textPx = Math.max(10, Math.round(TEXT * d))
  const labelY = tapeY + (MAJOR_TICK + LABEL_GAP) * d + textPx / 2

  context.save()
  hudStyle(context, height)
  context.lineWidth = Math.max(1, LINE * d)
  context.font = `${textPx}px ${HUD_FONT_FAMILY}`
  context.textBaseline = 'middle'
  context.textAlign = 'center'

  // The heading as three digits, 360 shown as 000.
  const shown = ((Math.round(heading) % 360) + 360) % 360
  const boxText = String(shown).padStart(3, '0')
  const boxHalfWidth = context.measureText('000').width / 2 + textPx * 0.3
  const boxHalfHeight = textPx * 0.75

  // The tape: ticks hanging from the line, labels under the major ones except under the box.
  const xOf = (value: number): number => cx + (value - heading) * DEGREES_PER_HEADING * d
  context.beginPath()
  for (let value = Math.ceil((heading - SPAN_HEADING) / 5) * 5; value <= heading + SPAN_HEADING; value += 5) {
    const x = xOf(value)
    const major = ((value % 10) + 10) % 10 === 0
    context.moveTo(x, tapeY)
    context.lineTo(x, tapeY + (major ? MAJOR_TICK : MINOR_TICK) * d)
    if (major && Math.abs(x - cx) > boxHalfWidth + textPx * 0.8) {
      const label = String(((((value / 10) % 36) + 36) % 36)).padStart(2, '0')
      context.fillText(label, x, labelY)
    }
  }
  context.stroke()

  // The lubber line, fixed above the tape's centre.
  context.beginPath()
  context.moveTo(cx, tapeY - LUBBER_GAP * d)
  context.lineTo(cx, tapeY - (LUBBER_GAP + LUBBER) * d)
  context.stroke()

  // The heading in a box under the lubber line.
  context.strokeRect(cx - boxHalfWidth, labelY - boxHalfHeight, boxHalfWidth * 2, boxHalfHeight * 2)
  context.fillText(boxText, cx, labelY)
  context.restore()
}
