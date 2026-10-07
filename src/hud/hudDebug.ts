// ?huddebug: a test pattern on both HUD layers, to check how they are laid over the image. The
// screen layer gets a frame and a label; the aircraft layer a cross at the airframe's straight
// ahead and the horizon worked out from the airframe's attitude alone. With the camera shaking,
// that line should stay on the real horizon (a little above it, as the real one dips below the
// level with height).
import { Quaternion, Vector3 } from 'three/webgpu'

import { HUD_FONT_FAMILY, hudStyle, type HudLayer } from './hud'

const up = new Vector3()
const inverse = new Quaternion()

export function drawHudDebug(screen: HudLayer, aircraft: HudLayer, aircraftQuaternion: Quaternion, fovDegrees: number): void {
  const { canvas: s, context: sc } = screen
  sc.clearRect(0, 0, s.width, s.height)
  sc.strokeStyle = 'rgb(255, 220, 80)'
  sc.lineWidth = 3
  sc.strokeRect(10, 10, s.width - 20, s.height - 20)
  sc.fillStyle = 'rgb(255, 220, 80)'
  sc.font = `${Math.round(s.height / 30)}px ${HUD_FONT_FAMILY}`
  sc.fillText('SCREEN LAYER (top left)', 24, 24 + s.height / 30)
  screen.changed()

  const { canvas: a, context: ac } = aircraft
  const w = a.width
  const h = a.height
  ac.clearRect(0, 0, w, h)
  hudStyle(ac, h)
  ac.lineWidth = 2
  const size = h / 20
  ac.beginPath()
  ac.moveTo(w / 2 - size, h / 2)
  ac.lineTo(w / 2 + size, h / 2)
  ac.moveTo(w / 2, h / 2 - size)
  ac.lineTo(w / 2, h / 2 + size)
  ac.stroke()
  ac.font = `${Math.round(h / 30)}px ${HUD_FONT_FAMILY}`
  ac.fillText('AIRCRAFT LAYER', w / 2 + size, h / 2 - size)

  // The horizon: directions square to up, in the airframe's camera axes (x right, y up, −z ahead),
  // as a line in normalised device coordinates: n·(X·aspect·t, Y·t, −1) = 0.
  up.set(0, 1, 0).applyQuaternion(inverse.copy(aircraftQuaternion).invert())
  const t = Math.tan((fovDegrees * Math.PI) / 360)
  const aspect = w / h
  const nx = up.x * aspect * t
  const ny = up.y * t
  const nz = -up.z
  if (Math.abs(ny) > 1e-6) {
    const toPixel = (x: number): [number, number] => {
      const y = -(nx * x + nz) / ny
      return [((x + 1) / 2) * w, ((1 - y) / 2) * h]
    }
    const [x0, y0] = toPixel(-1.2)
    const [x1, y1] = toPixel(1.2)
    ac.beginPath()
    ac.moveTo(x0, y0)
    ac.lineTo(x1, y1)
    ac.stroke()
  }
  aircraft.changed()
}
