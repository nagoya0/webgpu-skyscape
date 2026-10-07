// The HUD's Attitude Bars (pitch ladder), after the DCS: F-16C Viper guide (HUD symbology, item
// 10): bars every 5° of pitch (every 10° beyond 60°) and the Horizon Line at 0°; bars above the
// horizon solid, below it dashed; all canted by half their angle into a caret pointing at the
// horizon (the maintainer, from the real aircraft); each bar with a short line at its inner end pointing towards the
// horizon, and its angle standing on its outer end. Only the five or so bars nearest the nose's
// pitch are drawn (the maintainer), as the real HUD's 25° field shows few.
//
// The bars mark the scene, so they sit at true angles: each is the direction at its elevation on
// the aircraft's heading, projected through the airframe's attitude, and turns with the bank. The
// guide cages them to the flight path marker in azimuth; until that marker is drawn they follow
// the nose's heading, the same on the placeholder path. Their lengths and the gap in the middle do
// not mark the scene and are drawn twice the guide's size (three times would reach the velocity
// and altitude tapes).
import { Quaternion, Vector3 } from 'three/webgpu'

import { hudStyle, HUD_FONT_FAMILY } from './hud'

/** In degrees on the HUD: half the gap in the middle, and each half bar's length. */
const HALF_GAP = 5.1
const BAR = 4.2
/** The Horizon Line reaches this far out from the middle. */
const HORIZON_OUT = 11.6
/** Bars are canted by this share of their pitch angle. */
const CANT = 0.5
/** The short line at a bar's inner end, towards the horizon, as in the guide. */
const END_TICK = 0.8
/**
 * Dashes of the bars below the horizon: four equal dashes per half bar, from end to end, with gaps
 * 0.6 of a dash.
 */
const DASHES = 4
const DASH = BAR / (DASHES + (DASHES - 1) * 0.6)
const DASH_GAP = DASH * 0.6
const TEXT = 1.5
const LINE = 0.15
/** Only the bars this close to the nose's pitch are drawn: five at 5° spacing (the maintainer). */
const WINDOW = 12.5

const toBody = new Quaternion()
const ned = new Vector3()

/**
 * Draws the attitude bars on the aircraft layer.
 * @param pixelsPerDegree at the boresight, from the camera's field of view
 * @param bodyToNED the aircraft's attitude
 * @param heading the direction the bars face, radians from north towards east
 */
export function drawAttitudeBars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelsPerDegree: number,
  bodyToNED: Quaternion,
  heading: number
): void {
  const d = pixelsPerDegree
  const f = (d * 180) / Math.PI
  const cx = width / 2
  const cy = height / 2
  toBody.copy(bodyToNED).invert()
  // The nose's pitch: its elevation in north-east-down.
  ned.set(1, 0, 0).applyQuaternion(bodyToNED)
  const pitch = (Math.asin(Math.min(Math.max(-ned.z, -1), 1)) * 180) / Math.PI

  // A direction at an elevation on an azimuth, as a point on the airframe's image; null behind.
  const project = (elevation: number, azimuth: number): [number, number] | null => {
    ned.set(Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), -Math.sin(elevation))
    ned.applyQuaternion(toBody) // body axes: forward, right, down
    if (ned.x < 0.05) return null
    return [cx + (f * ned.y) / ned.x, cy + (f * ned.z) / ned.x]
  }

  context.save()
  hudStyle(context, height)
  context.lineWidth = Math.max(1, LINE * d)
  const textPx = Math.max(10, Math.round(TEXT * d))
  context.font = `${textPx}px ${HUD_FONT_FAMILY}`
  context.textBaseline = 'middle'
  context.textAlign = 'center'

  const angles: number[] = []
  for (let a = -90; a <= 90; a += Math.abs(a) >= 60 ? 10 : 5) angles.push(a)
  for (const degrees of angles) {
    if (Math.abs(degrees) >= 90 || Math.abs(degrees - pitch) > WINDOW) continue
    const elevation = (degrees * Math.PI) / 180
    const centre = project(elevation, heading)
    const along = project(elevation, heading + 0.002)
    if (!centre || !along) continue
    // Along the bar on screen, and across it towards the horizon.
    let ux = along[0] - centre[0]
    let uy = along[1] - centre[1]
    const length = Math.hypot(ux, uy)
    if (length < 1e-6) continue
    ux /= length
    uy /= length
    const towards = project(elevation - Math.sign(degrees || 1) * 0.002, heading)
    if (!towards) continue
    let tx = -uy
    let ty = ux
    if (tx * (towards[0] - centre[0]) + ty * (towards[1] - centre[1]) < 0) {
      tx = -tx
      ty = -ty
    }
    // Skip bars well off the screen.
    if (Math.abs(centre[1] - cy) > height && Math.abs(centre[0] - cx) > width) continue

    const at = (out: number, across = 0): [number, number] => [
      centre[0] + ux * out * d + tx * across * d,
      centre[1] + uy * out * d + ty * across * d
    ]
    context.setLineDash(degrees < 0 ? [DASH * d, DASH_GAP * d] : [])
    context.beginPath()
    if (degrees === 0) {
      for (const side of [-1, 1]) {
        context.moveTo(...at(side * HALF_GAP))
        context.lineTo(...at(side * HORIZON_OUT))
      }
      context.stroke()
      continue
    }
    // A half bar from its inner end outwards, canted by half the pitch, its outer end away from the
    // horizon, so the two halves make a caret pointing at the horizon.
    const cant = (Math.abs(degrees) * CANT * Math.PI) / 180
    const halfBar = (side: number, distance: number): [number, number] => {
      const [ix, iy] = at(side * HALF_GAP)
      const ax = ux * side * Math.cos(cant) - tx * Math.sin(cant)
      const ay = uy * side * Math.cos(cant) - ty * Math.sin(cant)
      return [ix + ax * distance * d, iy + ay * distance * d]
    }
    for (const side of [-1, 1]) {
      context.moveTo(...halfBar(side, 0))
      context.lineTo(...halfBar(side, BAR))
    }
    context.stroke()
    // The short lines, solid, at the inner ends towards the horizon.
    context.setLineDash([])
    context.beginPath()
    for (const side of [-1, 1]) {
      const inner = side * HALF_GAP
      context.moveTo(...at(inner))
      context.lineTo(...at(inner, END_TICK))
    }
    context.stroke()
    // The labels stand on the outer ends: centred on them, their foot on the bar's line, on the
    // bar's upper side as the bar turns with the bank.
    for (const side of [-1, 1]) {
      const [ox, oy] = halfBar(side, BAR)
      const lift = textPx / 2
      context.fillText(String(Math.abs(degrees)), ox + uy * lift, oy - ux * lift)
    }
  }
  context.restore()
}
