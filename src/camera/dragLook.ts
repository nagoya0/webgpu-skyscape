// Temporary: look around by dragging, until the first-person camera on the flight path exists
// (ADR 0009). The camera stays where it is; only its heading and pitch change.
import { MathUtils, type PerspectiveCamera } from 'three/webgpu'

export function attachDragLook(
  element: HTMLElement,
  camera: PerspectiveCamera,
  initialHeading: number,
  initialPitch: number
): void {
  // World axes: x north, y up, z east. Heading is clockwise from north, in degrees.
  let heading = initialHeading
  let pitch = initialPitch
  const apply = (): void => {
    camera.rotation.order = 'YXZ'
    // A camera looks down its local -z. Turning it by -(heading + 90°) about y points it at
    // (cos heading, 0, sin heading): north at 0°, east at 90°.
    camera.rotation.y = -MathUtils.degToRad(heading) - Math.PI / 2
    camera.rotation.x = MathUtils.degToRad(pitch)
    camera.rotation.z = 0
  }
  apply()

  let dragging = false
  element.addEventListener('pointerdown', event => {
    dragging = true
    element.setPointerCapture(event.pointerId)
  })
  element.addEventListener('pointerup', event => {
    dragging = false
    element.releasePointerCapture(event.pointerId)
  })
  element.addEventListener('pointermove', event => {
    if (!dragging) return
    const degreesPerPixel = camera.fov / element.clientHeight
    heading = (heading - event.movementX * degreesPerPixel + 360) % 360
    pitch = MathUtils.clamp(pitch + event.movementY * degreesPerPixel, -89, 89)
    apply()
  })
}
