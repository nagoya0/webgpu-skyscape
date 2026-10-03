import type { WebGPURenderer } from 'three/webgpu'

// Three.js r184 sorts render lists by the projected z, which runs the other way under a
// reversed depth buffer: opaque objects are drawn back to front, so every hidden surface is
// shaded. These comparators swap the z direction and keep groupOrder and renderOrder as they
// are. r185 fixed this upstream (mrdoob/three.js#33700); drop this when upgrading (ADR 0015).

interface RenderItem {
  id: number
  groupOrder: number
  renderOrder: number
  z: number
}

function opaqueReversed(a: RenderItem, b: RenderItem): number {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder
  if (a.z !== b.z) return b.z - a.z
  return a.id - b.id
}

function transparentReversed(a: RenderItem, b: RenderItem): number {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder
  if (a.z !== b.z) return a.z - b.z
  return a.id - b.id
}

export function applyReversedDepthSort(renderer: WebGPURenderer): void {
  renderer.setOpaqueSort(opaqueReversed as Parameters<WebGPURenderer['setOpaqueSort']>[0])
  renderer.setTransparentSort(transparentReversed as Parameters<WebGPURenderer['setTransparentSort']>[0])
}
