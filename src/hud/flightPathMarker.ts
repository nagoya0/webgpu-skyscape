// The HUD's Boresight Cross and Flight Path Marker, after the DCS: F-16C Viper guide (HUD
// symbology, items 11 and 12). The cross marks the fuselage reference line, straight ahead of the
// nose; the marker, a circle with lines out at 12, 3 and 9 o'clock, marks where the aircraft is
// actually going, its velocity. Both mark the scene, so they sit at true angles; their sizes are
// three times the guide's (docs/ideas.md).
//
// On the placeholder path the nose always points along the velocity, so the marker sits on the
// cross; the JSBSim path's angle of attack and sideslip will move it.
import type { Vector3 } from 'three/webgpu'

import { hudStyle } from './hud'

/**
 * In degrees on the HUD: the cross's arms reach out to CROSS_ARM from an open centre of half-width
 * CROSS_GAP (the maintainer); the marker's radius, wings and fin.
 */
const CROSS_ARM = 1
const CROSS_GAP = 0.35
const RADIUS = 0.8
const WING = 2.0
const FIN = 1.2
const LINE = 0.15

/** Draws the boresight cross at the image's centre, straight ahead of the airframe, open in the middle. */
export function drawBoresightCross(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelsPerDegree: number
): void {
  const d = pixelsPerDegree
  const cx = width / 2
  const cy = height / 2
  context.save()
  hudStyle(context, height)
  context.lineWidth = Math.max(1, LINE * d)
  context.beginPath()
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    context.moveTo(cx + dx * CROSS_GAP * d, cy + dy * CROSS_GAP * d)
    context.lineTo(cx + dx * CROSS_ARM * d, cy + dy * CROSS_ARM * d)
  }
  context.stroke()
  context.restore()
}

/**
 * Draws the flight path marker where the velocity points.
 * @param velocity the velocity in body axes: forward, right, down
 */
export function drawFlightPathMarker(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelsPerDegree: number,
  velocity: Vector3
): void {
  if (velocity.x <= 0) return
  const d = pixelsPerDegree
  const f = (d * 180) / Math.PI
  const x = width / 2 + (f * velocity.y) / velocity.x
  const y = height / 2 + (f * velocity.z) / velocity.x
  const r = RADIUS * d
  context.save()
  hudStyle(context, height)
  context.lineWidth = Math.max(1, LINE * d)
  context.beginPath()
  context.arc(x, y, r, 0, Math.PI * 2)
  context.moveTo(x - r, y)
  context.lineTo(x - r - WING * d, y)
  context.moveTo(x + r, y)
  context.lineTo(x + r + WING * d, y)
  context.moveTo(x, y - r)
  context.lineTo(x, y - r - FIN * d)
  context.stroke()
  context.restore()
}
