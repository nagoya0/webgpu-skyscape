// The HUD's Roll Indicator, after the DCS: F-16C Viper guide (HUD symbology, item 19): increment
// marks at 0°, 10°, 20°, 30° and 45° of bank on either side, along the lower arc of a circle and
// pointing at its centre, the 0° and 45° marks longer; a caret outside the arc, pointing at the
// centre, rotates along it to show the bank. Banked right, the caret moves right, as a pointer to
// the ground would. Beyond the last mark (45°) the caret stops at it (the maintainer: the real one
// stops there too and squashes sideways, which is left out). Inverted, the bank is about 180°,
// so the caret sits at one end and changes ends as the aircraft rolls through it.
//
// Placed below the heading scale as in the guide's picture, three times its size (docs/ideas.md):
// the circle's centre 17.5° below the boresight, its radius 8.7°.
import { HUD_LINE, hudStyle } from './hud'

/** The circle, in degrees: centre below the boresight, and radius to the marks' inner ends. */
const CENTRE_DOWN = 17.5
const RADIUS = 8.7
/** Mark lengths, outwards from the radius. */
const LONG_MARK = 1.0
const SHORT_MARK = 0.7
/** The caret: gap outside the long marks, height and half its base. */
const CARET_GAP = 0.2
const CARET_HEIGHT = 1.15
const CARET_HALF_BASE = 0.55

/** The last mark; the caret goes no further. */
const MAX_BANK = 45

const MARKS: readonly [number, boolean][] = [
  [0, true],
  [10, false],
  [20, false],
  [30, false],
  [45, true]
]

/**
 * Draws the roll indicator on the aircraft layer.
 * @param pixelsPerDegree at the boresight, from the camera's field of view
 * @param bankDegrees the aircraft's bank, right positive
 */
export function drawRollIndicator(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelsPerDegree: number,
  bankDegrees: number
): void {
  const d = pixelsPerDegree
  const cx = width / 2
  const cy = height / 2 + CENTRE_DOWN * d
  // A point at `angle` degrees from straight down, right positive, `radius` degrees out.
  const at = (angle: number, radius: number): [number, number] => {
    const a = (angle * Math.PI) / 180
    return [cx + Math.sin(a) * radius * d, cy + Math.cos(a) * radius * d]
  }

  context.save()
  hudStyle(context, height)
  context.lineWidth = Math.max(1, HUD_LINE * d)

  context.beginPath()
  for (const [angle, long] of MARKS) {
    for (const side of angle === 0 ? [1] : [-1, 1]) {
      const [x0, y0] = at(angle * side, RADIUS)
      const [x1, y1] = at(angle * side, RADIUS + (long ? LONG_MARK : SHORT_MARK))
      context.moveTo(x0, y0)
      context.lineTo(x1, y1)
    }
  }
  context.stroke()

  // The caret: its point towards the centre, its base further out; stopped at the last mark.
  const bank = Math.min(Math.max(bankDegrees, -MAX_BANK), MAX_BANK)
  const tip = RADIUS + LONG_MARK + CARET_GAP
  const [px, py] = at(bank, tip)
  const half = (CARET_HALF_BASE / (tip + CARET_HEIGHT)) * (180 / Math.PI)
  const [lx, ly] = at(bank - half, tip + CARET_HEIGHT)
  const [rx, ry] = at(bank + half, tip + CARET_HEIGHT)
  context.beginPath()
  context.moveTo(px, py)
  context.lineTo(lx, ly)
  context.lineTo(rx, ry)
  context.closePath()
  context.stroke()
  context.restore()
}
