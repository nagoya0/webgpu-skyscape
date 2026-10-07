// The HUD's Velocity & Velocity Scale, after the DCS: F-16C Viper guide (HUD symbology, item 5):
// knots, shown from 60 to 900 (0 below 60); a moving vertical tape with a major tick every 50 kt
// labelled with two digits (35 for 350) and a minor tick every 10 kt; the current value in a box
// shaped like a home plate on its side, pointing at the tape; a letter beside the minor ticks for
// what is shown, standing on the current value's line, which runs from the box's point past it.
//
// Placed and sized with the maintainer (2026-10-07) rather than at the guide's angles: the HUD
// spans 25° in the real aircraft, small in the demo's 70° view, so the scale is three times the
// guide's size, its box about 20° left of the boresight, and its tape shows 160 kt either side.
// This is the size the other non-conformal HUD elements follow.
//
// Only the ground speed is shown, with its letter G (the maintainer): the simplest value, as the
// flight path has no wind. The real HUD can also show calibrated (C) and true (T) airspeed, which
// need the atmosphere.
import { hudStyle, HUD_FONT_FAMILY } from './hud'

export const KNOTS_PER_METRE_PER_SECOND = 3600 / 1852

/** Where the box's point is, in degrees from the boresight; right and up positive. */
const BOX_RIGHT = -20
const BOX_UP = 0.1
/** The rest in degrees too. The tape's ticks start this far right of the box's point. */
const TAPE_GAP = 0.75
/** Degrees per knot along the tape, and knots shown either side of the current value. */
const DEGREES_PER_KNOT = 0.087
const SPAN_KNOTS = 160
/** Tick lengths: all end at the same right edge; major ticks reach this much further left. */
const MINOR_TICK = 0.9
const MAJOR_EXTRA = 0.375
/** Gap between a label and its tick's left end; between the ticks and the letter. */
const LABEL_GAP = 0.45
const LETTER_GAP = 0.3
/** Text height and line width. */
const TEXT = 1.5
const LINE = 0.15

/**
 * Draws the velocity scale on the aircraft layer.
 * @param pixelsPerDegree at the boresight, from the camera's field of view
 */
export function drawVelocityScale(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelsPerDegree: number,
  knots: number
): void {
  const shown = knots < 60 ? 0 : Math.min(Math.round(knots), 900)
  const d = pixelsPerDegree
  const boxY = height / 2 - BOX_UP * d
  const tipX = width / 2 + BOX_RIGHT * d
  const tapeX = tipX + TAPE_GAP * d
  const textPx = Math.max(10, Math.round(TEXT * d))

  context.save()
  hudStyle(context, height)
  context.lineWidth = Math.max(1, LINE * d)
  context.font = `${textPx}px ${HUD_FONT_FAMILY}`
  context.textBaseline = 'middle'

  // The tape: ticks with a common right edge, the major ones reaching further left; labels to
  // their left.
  const yOf = (value: number): number => boxY - (value - shown) * DEGREES_PER_KNOT * d
  const first = Math.ceil((shown - SPAN_KNOTS) / 10) * 10
  context.beginPath()
  for (let value = Math.max(first, 0); value <= shown + SPAN_KNOTS; value += 10) {
    const y = yOf(value)
    const major = value % 50 === 0
    context.moveTo(tapeX - (major ? MAJOR_EXTRA * d : 0), y)
    context.lineTo(tapeX + MINOR_TICK * d, y)
  }
  context.stroke()
  context.textAlign = 'right'
  for (let value = Math.max(Math.ceil((shown - SPAN_KNOTS) / 50) * 50, 0); value <= shown + SPAN_KNOTS; value += 50) {
    const y = yOf(value)
    // The box covers labels near the current value.
    if (Math.abs(y - boxY) < textPx * 1.2) continue
    context.fillText(String(Math.floor(value / 10)).padStart(2, '0'), tapeX - LABEL_GAP * d, y)
  }

  // The box with the current value, its right side pointing at the tape; room for four digits.
  const boxHalfHeight = textPx * 0.75
  const boxWidth = context.measureText('0000').width + textPx * 0.6
  const point = boxHalfHeight
  const left = tipX - point - boxWidth
  context.beginPath()
  context.moveTo(tipX, boxY)
  context.lineTo(tipX - point, boxY - boxHalfHeight)
  context.lineTo(left, boxY - boxHalfHeight)
  context.lineTo(left, boxY + boxHalfHeight)
  context.lineTo(tipX - point, boxY + boxHalfHeight)
  context.closePath()
  context.stroke()
  context.textAlign = 'right'
  context.fillText(String(shown), tipX - point - textPx * 0.3, boxY)

  // What is shown, as in the guide: just right of the minor ticks, its foot on the current value's
  // line.
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  const letterX = tapeX + MINOR_TICK * d + LETTER_GAP * d
  context.fillText('G', letterX, boxY)

  // The current value's line, fixed: from the box's point across the tape, a little past the G.
  context.beginPath()
  context.moveTo(tipX, boxY)
  context.lineTo(letterX + context.measureText('G').width + LETTER_GAP * d, boxY)
  context.stroke()
  context.restore()
}
