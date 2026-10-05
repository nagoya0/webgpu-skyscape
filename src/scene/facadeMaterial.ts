// Material for untextured PLATEAU buildings: the facade pattern is WGSL (ADR 0022); TSL only
// passes the world position and normal and maps the window mask to roughness.
import { mix, normalWorld, positionWorld, wgslFn } from 'three/tsl'
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu'

import facadeCode from './wgsl/facade.wgsl?raw'

const facade = wgslFn(facadeCode)

export function createFacadeMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 })
  const result = facade({ position: positionWorld, normal: normalWorld }) as Node<'vec4'>
  material.colorNode = result.xyz
  // Glass is smooth enough to catch the sun; walls are rough.
  material.roughnessNode = mix(0.9, 0.25, result.w)
  return material
}
