// Temporary: a flat disc so the lighting can be judged before terrain exists (ADR 0007).
// The atmosphere draws its virtual ground below the horizon in black, so the disc has to reach
// close to the horizon: from 1000 m up the horizon is about 113 km away. Being flat, the disc's
// edge sits slightly above the true horizon, which the haze at that distance hides.
import { CircleGeometry, Mesh, MeshStandardNodeMaterial } from 'three/webgpu'

export function createPlaceholderGround(): Mesh {
  const ground = new Mesh(
    new CircleGeometry(200_000, 256),
    new MeshStandardNodeMaterial({ color: 0x4f5a46, roughness: 1, metalness: 0 })
  )
  // World axes: x north, y up, z east. The disc is created in the xy plane.
  ground.rotation.x = -Math.PI / 2
  return ground
}
