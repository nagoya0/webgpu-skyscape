// Temporary: a flat disc so the lighting and the motion can be judged before terrain exists
// (ADR 0007). The atmosphere draws its virtual ground below the horizon in black, so the disc has
// to reach close to the horizon: from 1500 m up the horizon is about 140 km away. Being flat,
// the disc's edge sits slightly above the true horizon, which the haze at that distance hides.
// A 1 km grid makes the speed visible.
import {
  abs,
  cameraPosition,
  float,
  Fn,
  fract,
  fwidth,
  length,
  min,
  mix,
  positionWorld,
  smoothstep,
  vec3
} from 'three/tsl'
import { CircleGeometry, Mesh, MeshStandardNodeMaterial } from 'three/webgpu'

export function createPlaceholderGround(): Mesh {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  material.colorNode = Fn(() => {
    const base = vec3(0.31, 0.35, 0.27)
    const lineColor = vec3(0.22, 0.25, 0.19)
    const cell = positionWorld.xz.div(1000)
    // Distance to the nearest grid line in pixels, for lines that stay one pixel wide.
    const distance = abs(fract(cell.sub(0.5)).sub(0.5)).div(fwidth(cell))
    const line = float(1).sub(min(min(distance.x, distance.y), float(1)))
    // Fade the grid with distance, where it would only produce moiré.
    const fade = float(1).sub(smoothstep(8000, 30000, length(positionWorld.xz.sub(cameraPosition.xz))))
    return mix(base, lineColor, line.mul(fade))
  })()
  const ground = new Mesh(new CircleGeometry(200_000, 256), material)
  // World axes: x north, y up, z east. The disc is created in the xy plane.
  ground.rotation.x = -Math.PI / 2
  return ground
}
