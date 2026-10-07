// The HUD's Altitude & Altitude Scale, after the DCS: F-16C Viper guide (HUD symbology, item 13):
// feet above mean sea level to the nearest 10 ft; a moving vertical tape with a major tick every
// 500 ft labelled as thousands and hundreds ("09,0" for 9,000 ft) and a minor tick every 100 ft;
// the current value with a thousands comma in a box shaped like a home plate on its side,
// pointing left at the tape; the current value's line, fixed, from the box's point across the
// tape.
//
// The velocity scale mirrored about the boresight (velocityScale.ts), piece by piece, as the
// maintainer wants them symmetric: the same size, three times the guide's; the box's point 20°
// right of the boresight; the same length of tape on screen (1,500 ft either side of the current
// value); the current value's line as long as the velocity scale's, which runs past its G.
import { hudStyle, HUD_FONT_FAMILY } from './hud'

export const FEET_PER_METRE = 1 / 0.3048

/** Where the box's point is, in degrees from the boresight; right and up positive. */
const BOX_RIGHT = 20
const BOX_UP = 0.1
/** The rest in degrees too. The tape's ticks end this far left of the box's point. */
const TAPE_GAP = 0.75
/** Degrees per foot along the tape, and feet shown either side of the current value. */
const DEGREES_PER_FOOT = 0.0092
const SPAN_FEET = 1500
/** Tick lengths: all start at the same left edge; major ticks reach this much further right. */
const MINOR_TICK = 0.9
const MAJOR_EXTRA = 0.375
/** A label's left end lies this far left of the box's point, as the velocity scale's labels. */
const LABEL_IN = 0.3
/** Beyond the ticks the line runs as far as past the velocity scale's G: gap, G, gap. */
const LETTER_GAP = 0.3
/** Text height and line width. */
const TEXT = 1.5
const LINE = 0.15

/**
 * Draws digits with a comma that takes no room of its own, as in the guide's HUD: the comma sits
 * between the digits, over the boundary before the last commaAfter digits. The typeface is
 * monospaced, so every digit is as wide as '0'.
 */
function fillDigits(
  context: CanvasRenderingContext2D,
  digits: string,
  commaBefore: number,
  x: number,
  y: number,
  align: 'left' | 'right'
): void {
  const digit = context.measureText('0').width
  const left = align === 'left' ? x : x - digit * digits.length
  context.textAlign = 'left'
  context.fillText(digits, left, y)
  if (digits.length > commaBefore) {
    context.textAlign = 'center'
    // A little low and left of the boundary, where a comma's tail falls.
    context.fillText(',', left + digit * (digits.length - commaBefore) - digit * 0.08, y + digit * 0.25)
  }
}

/**
 * Draws the altitude scale on the aircraft layer.
 * @param pixelsPerDegree at the boresight, from the camera's field of view
 */
export function drawAltitudeScale(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelsPerDegree: number,
  feet: number
): void {
  const shown = Math.round(feet / 10) * 10
  const d = pixelsPerDegree
  const boxY = height / 2 - BOX_UP * d
  const tipX = width / 2 + BOX_RIGHT * d
  // The ticks' common left edge: minor ticks end TAPE_GAP short of the box's point.
  const tapeX = tipX - TAPE_GAP * d - MINOR_TICK * d
  const textPx = Math.max(10, Math.round(TEXT * d))

  context.save()
  hudStyle(context, height)
  context.lineWidth = Math.max(1, LINE * d)
  context.font = `${textPx}px ${HUD_FONT_FAMILY}`
  context.textBaseline = 'middle'

  // The tape: ticks with a common left edge, the major ones reaching further right; labels to
  // their right.
  const yOf = (value: number): number => boxY - (value - shown) * DEGREES_PER_FOOT * d
  const first = Math.ceil((shown - SPAN_FEET) / 100) * 100
  context.beginPath()
  for (let value = first; value <= shown + SPAN_FEET; value += 100) {
    const y = yOf(value)
    const major = value % 500 === 0
    context.moveTo(tapeX, y)
    context.lineTo(tapeX + (MINOR_TICK + (major ? MAJOR_EXTRA : 0)) * d, y)
  }
  context.stroke()
  context.textAlign = 'left'
  const labelX = tipX - LABEL_IN * d
  for (let value = Math.ceil((shown - SPAN_FEET) / 500) * 500; value <= shown + SPAN_FEET; value += 500) {
    const y = yOf(value)
    // The box covers labels near the current value.
    if (Math.abs(y - boxY) < textPx * 1.2) continue
    // "09,0" for 9,000 ft: thousands in two digits, a comma, hundreds.
    const hundreds = Math.round(value / 100)
    fillDigits(context, String(Math.floor(hundreds / 10)).padStart(2, '0') + String(hundreds % 10), 1, labelX, y, 'left')
  }

  // The box with the current value, its left side pointing at the tape; room for five digits (the
  // comma takes none).
  const boxHalfHeight = textPx * 0.75
  const boxWidth = context.measureText('00000').width + textPx * 0.6
  const point = boxHalfHeight
  const right = tipX + point + boxWidth
  context.beginPath()
  context.moveTo(tipX, boxY)
  context.lineTo(tipX + point, boxY - boxHalfHeight)
  context.lineTo(right, boxY - boxHalfHeight)
  context.lineTo(right, boxY + boxHalfHeight)
  context.lineTo(tipX + point, boxY + boxHalfHeight)
  context.closePath()
  context.stroke()
  fillDigits(context, String(shown), 3, right - textPx * 0.3, boxY, 'right')

  // The current value's line, fixed: from the box's point across the tape, as far beyond it as the
  // velocity scale's line runs past its G.
  const beyond = LETTER_GAP * d + context.measureText('G').width + LETTER_GAP * d
  context.beginPath()
  context.moveTo(tipX, boxY)
  context.lineTo(tapeX - beyond, boxY)
  context.stroke()
  context.restore()
}
