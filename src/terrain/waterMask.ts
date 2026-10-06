// The water mask of a terrain tile, MASK_SIZE × MASK_SIZE values from 0 to 255 (255 = water),
// from two sources:
// - the 10 m elevation model's missing data, which is the sea (GSI serves no file for an
//   elevation tile that is all sea, so a missing grid is all water);
// - the water areas of GSI's vector tiles, which include lakes such as Lake Ashi; the
//   elevation model has heights for those.
import type { HeightSource } from './tileGeometry'
import type { PolygonLayer } from './vectorTile'

export const MASK_SIZE = 128

/** Where a tile sits in an ancestor's data: offset and size as fractions of it. */
export interface Window {
  u0: number
  v0: number
  size: number
}

/** Null when the tile has no water at all. */
export function buildWaterMask(
  heights: HeightSource,
  areas: { layer: PolygonLayer | null } & Window
): Uint8Array | null {
  const mask = new Uint8Array(MASK_SIZE * MASK_SIZE)
  let any = false

  const { grid } = heights
  if (!grid) {
    mask.fill(255)
    return mask
  }
  const n = grid.size
  for (let j = 0; j < MASK_SIZE; j++) {
    for (let i = 0; i < MASK_SIZE; i++) {
      const x = Math.min(Math.max(Math.floor((heights.u0 + ((i + 0.5) / MASK_SIZE) * heights.size) * n), 0), n - 1)
      const y = Math.min(Math.max(Math.floor((heights.v0 + ((j + 0.5) / MASK_SIZE) * heights.size) * n), 0), n - 1)
      if (Number.isNaN(grid.heights[y * n + x])) {
        mask[j * MASK_SIZE + i] = 255
        any = true
      }
    }
  }

  const { layer } = areas
  if (layer && layer.features.length > 0) {
    // Draw the polygons over the tile's window of the vector tile, then merge.
    const canvas = new OffscreenCanvas(MASK_SIZE, MASK_SIZE)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const scale = MASK_SIZE / (areas.size * layer.extent)
    context.setTransform(scale, 0, 0, scale, -areas.u0 * layer.extent * scale, -areas.v0 * layer.extent * scale)
    context.fillStyle = '#fff'
    for (const feature of layer.features) {
      context.beginPath()
      for (const ring of feature.rings) {
        ring.forEach(([x, y], k) => (k === 0 ? context.moveTo(x, y) : context.lineTo(x, y)))
        context.closePath()
      }
      // Holes (islands) are rings of the same feature.
      context.fill('evenodd')
    }
    const { data } = context.getImageData(0, 0, MASK_SIZE, MASK_SIZE)
    for (let p = 0; p < MASK_SIZE * MASK_SIZE; p++) {
      if (data[p * 4 + 3] > mask[p]) {
        mask[p] = data[p * 4 + 3]
        if (mask[p] > 127) any = true
      }
    }
  }
  return any ? mask : null
}
