// GSI tiles (地理院タイル), loaded in real time, which the terms of use allow with attribution
// and without an application (checked 2026-10-06):
//   https://maps.gsi.go.jp/development/ichiran.html
// Requests are limited in number at a time to keep the load on GSI's servers modest.
import type { TileKey } from './webMercator'

import { readPolygonLayer, type PolygonLayer } from './vectorTile'

const DEM5A = 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png'
const VECTOR = 'https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1'
const DEM10 = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png'
const PHOTO = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto'

export const DEM5A_ZOOM = 15
export const DEM10_ZOOM = 14
export const PHOTO_MAX_ZOOM = 18
/** GSI's vector tiles go from zoom 4 to 16. */
export const VECTOR_MAX_ZOOM = 16

const MAX_CONCURRENT = 6
let active = 0
const waiting: (() => void)[] = []

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>(resolve => waiting.push(resolve))
  }
  active++
  try {
    return await task()
  } finally {
    active--
    waiting.shift()?.()
  }
}

async function fetchImage(url: string, signal?: AbortSignal): Promise<ImageBitmap | null> {
  return limited(async () => {
    if (signal?.aborted) return null
    const response = await fetch(url, { signal })
    // Tiles outside the data's coverage return 404.
    if (!response.ok) return null
    return createImageBitmap(await response.blob())
  })
}

/** Requests waiting or running, for the loading screen and checks. */
export function pendingRequests(): number {
  return active + waiting.length
}

export interface HeightGrid {
  /** Orthometric heights in metres, row by row from the north-west corner. NaN where missing. */
  heights: Float32Array
  size: number
}

// GSI elevation PNG: h = R * 2^16 + G * 2^8 + B; 2^23 means no data; values above 2^23 are
// negative after subtracting 2^24; the unit is 0.01 m.
function decodeElevationPng(image: ImageBitmap): HeightGrid {
  const size = image.width
  const canvas = new OffscreenCanvas(size, size)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(0, 0, size, size)
  const heights = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    const h = data[i * 4] * 65536 + data[i * 4 + 1] * 256 + data[i * 4 + 2]
    heights[i] = h === 8388608 ? Number.NaN : (h > 8388608 ? h - 16777216 : h) * 0.01
  }
  image.close()
  return { heights, size }
}

/**
 * Fills the missing values of a 5 m grid from the 10 m grid of its parent tile, interpolated;
 * where the 10 m grid is missing too (the sea), the value stays missing. The 5 m DEM has no data
 * over lakes and in patches on land: over Lake Ashi two thirds of a tile are missing, and read
 * as sea level they dropped the lake's surface by 725 m.
 * @param quarterX which half of the parent the fine tile is in, west 0 or east 1
 * @param quarterY north 0 or south 1
 */
export function fillFromParent(fine: HeightGrid, parent: HeightGrid, quarterX: number, quarterY: number): HeightGrid {
  const n = fine.size
  const m = parent.size
  const heights = fine.heights.slice()
  const at = (x: number, y: number): number => parent.heights[Math.min(y, m - 1) * m + Math.min(x, m - 1)]
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!Number.isNaN(heights[y * n + x])) continue
      // The fine pixel's centre in the parent's pixels.
      const fx = Math.max(((quarterX + (x + 0.5) / n) / 2) * m - 0.5, 0)
      const fy = Math.max(((quarterY + (y + 0.5) / n) / 2) * m - 0.5, 0)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const tx = fx - x0
      const ty = fy - y0
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
      heights[y * n + x] = top * (1 - ty) + bottom * ty
    }
  }
  return { heights, size: n }
}

const heightCache = new Map<string, Promise<HeightGrid | null>>()

function loadGrid(base: string, tile: TileKey, signal?: AbortSignal): Promise<HeightGrid | null> {
  const key = `${base}/${tile.z}/${tile.x}/${tile.y}`
  let promise = heightCache.get(key)
  if (!promise) {
    promise = fetchImage(`${key}.png`, signal).then(image => (image ? decodeElevationPng(image) : null))
    promise.catch(() => heightCache.delete(key))
    heightCache.set(key, promise)
  }
  return promise
}

/**
 * Heights for a DEM tile: the 5 m DEM at zoom 15, its gaps filled from the 10 m DEM of the
 * parent tile; else the 10 m DEM at zoom 14 for the same place. Cached for the session; the area
 * is fixed and small.
 */
export function loadHeights(tile: TileKey, signal?: AbortSignal): Promise<HeightGrid | null> {
  if (tile.z !== DEM5A_ZOOM) return loadGrid(DEM10, tile, signal)
  const key = `filled/${tile.z}/${tile.x}/${tile.y}`
  let promise = heightCache.get(key)
  if (!promise) {
    const parent = { z: tile.z - 1, x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2) }
    promise = Promise.all([loadGrid(DEM5A, tile, signal), loadGrid(DEM10, parent, signal)]).then(([fine, coarse]) =>
      fine && coarse ? fillFromParent(fine, coarse, tile.x % 2, tile.y % 2) : fine
    )
    promise.catch(() => heightCache.delete(key))
    heightCache.set(key, promise)
  }
  return promise
}

const waterCache = new Map<string, Promise<PolygonLayer | null>>()

/**
 * Water areas (sea, lakes, wide rivers) of a vector tile: the WA layer of GSI's vector tiles
 * (optimal_bvmap-v1), as polygons. Null where the tile has none or does not exist.
 */
export function loadWaterAreas(tile: TileKey, signal?: AbortSignal): Promise<PolygonLayer | null> {
  const key = `${tile.z}/${tile.x}/${tile.y}`
  let promise = waterCache.get(key)
  if (!promise) {
    promise = limited(async () => {
      // An aborted request throws, so that it is not cached as "no water".
      signal?.throwIfAborted()
      const response = await fetch(`${VECTOR}/${key}.pbf`, { signal })
      if (!response.ok) return null
      return readPolygonLayer(new Uint8Array(await response.arrayBuffer()), 'WA')
    })
    promise.catch(() => waterCache.delete(key))
    waterCache.set(key, promise)
  }
  return promise
}

/**
 * Aerial photographs covering a tile, stitched into one image: 2^levels × 2^levels photo
 * tiles from `levels` zoom levels deeper.
 */
export async function loadPhoto(
  tile: TileKey,
  levels: number,
  signal?: AbortSignal
): Promise<OffscreenCanvas | null> {
  const z = Math.min(tile.z + levels, PHOTO_MAX_ZOOM)
  const n = 2 ** (z - tile.z)
  const canvas = new OffscreenCanvas(256 * n, 256 * n)
  const context = canvas.getContext('2d')!
  const parts: Promise<void>[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = tile.x * n + i
      const y = tile.y * n + j
      parts.push(
        fetchImage(`${PHOTO}/${z}/${x}/${y}.jpg`, signal).then(image => {
          if (image) {
            context.drawImage(image, i * 256, j * 256)
            image.close()
          }
        })
      )
    }
  }
  await Promise.all(parts)
  return signal?.aborted ? null : canvas
}
