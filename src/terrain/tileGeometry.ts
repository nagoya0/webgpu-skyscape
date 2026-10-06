// Geometry for one terrain tile: a grid over the tile in Web Mercator, raised to GSI heights and
// placed in the local frame (ADR 0017). Positions are relative to the tile's centre, which
// becomes the mesh position, so 32-bit vertex positions stay small.
import { Geodetic, radians } from '@takram/three-geospatial'
import { BufferAttribute, BufferGeometry, Vector3 } from 'three/webgpu'

import { ecefToWorld, type LocalFrame } from '../geo/localFrame'
import type { HeightGrid } from './gsiSources'
import { tileXToLongitude, tileYToLatitude, type TileKey } from './webMercator'

/** Grid segments per tile side. */
export const SEGMENTS = 32
/** How far the skirt hangs below the tile edge, in metres. */
const SKIRT_DEPTH = 30

/**
 * Geoid height over central Tokyo, from GSI's geoid calculator (2026-10-06): 36.69 m at
 * 35.665 N 139.757 E, 37.07 m at Shinjuku, 36.83 m at Oshiage. GSI heights are above the
 * geoid; PLATEAU and the atmosphere use the ellipsoid. A constant is within 0.4 m here.
 */
export const GEOID_HEIGHT = 36.8

export interface HeightSource {
  grid: HeightGrid | null
  /** Where this tile sits in the grid: offset and size as fractions of the grid. */
  u0: number
  v0: number
  size: number
}

function sampleHeight(source: HeightSource, u: number, v: number): number {
  const { grid } = source
  if (!grid) return 0
  const n = grid.size
  const fx = Math.min(Math.max((source.u0 + u * source.size) * n - 0.5, 0), n - 1)
  const fy = Math.min(Math.max((source.v0 + v * source.size) * n - 0.5, 0), n - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, n - 1)
  const y1 = Math.min(y0 + 1, n - 1)
  const tx = fx - x0
  const ty = fy - y0
  // Missing data is mostly sea; treat it as sea level.
  const h = (x: number, y: number): number => {
    const value = grid.heights[y * n + x]
    return Number.isNaN(value) ? 0 : value
  }
  const top = h(x0, y0) * (1 - tx) + h(x1, y0) * tx
  const bottom = h(x0, y1) * (1 - tx) + h(x1, y1) * tx
  return top * (1 - ty) + bottom * ty
}

/**
 * A water mask over the tile, `size` × `size` values from 0 to 255 (255 = water), where the
 * elevation model has no data: sea. GSI serves no file for an elevation tile that is all sea,
 * so a missing grid is all water. Lakes have heights in the model and are not included. Null
 * when the tile has no water at all.
 */
export function buildWaterMask(source: HeightSource, size = 64): Uint8Array | null {
  const { grid } = source
  if (!grid) return new Uint8Array(size * size).fill(255)
  const n = grid.size
  const mask = new Uint8Array(size * size)
  let any = false
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = Math.min(Math.max(Math.floor((source.u0 + ((i + 0.5) / size) * source.size) * n), 0), n - 1)
      const y = Math.min(Math.max(Math.floor((source.v0 + ((j + 0.5) / size) * source.size) * n), 0), n - 1)
      if (Number.isNaN(grid.heights[y * n + x])) {
        mask[j * size + i] = 255
        any = true
      }
    }
  }
  return any ? mask : null
}

export interface TileMesh {
  geometry: BufferGeometry
  /** World position of the tile centre. */
  center: Vector3
  /** Radius of a sphere around the tile, from the centre. */
  radius: number
}

export function buildTileGeometry(
  tile: TileKey,
  frame: LocalFrame,
  heights: HeightSource
): TileMesh {
  const cols = SEGMENTS + 1
  const surfaceCount = cols * cols
  const perimeter: number[] = []
  for (let i = 0; i < cols; i++) perimeter.push(i)
  for (let j = 1; j < cols; j++) perimeter.push(j * cols + cols - 1)
  for (let i = cols - 2; i >= 0; i--) perimeter.push((cols - 1) * cols + i)
  for (let j = cols - 2; j >= 1; j--) perimeter.push(j * cols)

  const count = surfaceCount + perimeter.length
  const world = new Float64Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const geodetic = new Geodetic()
  const ecef = new Vector3()
  const point = new Vector3()

  const west = tileXToLongitude(tile.x, tile.z)
  const east = tileXToLongitude(tile.x + 1, tile.z)
  for (let j = 0; j < cols; j++) {
    const v = j / SEGMENTS
    const latitude = tileYToLatitude(tile.y + v, tile.z)
    for (let i = 0; i < cols; i++) {
      const u = i / SEGMENTS
      const longitude = west + (east - west) * u
      const height = sampleHeight(heights, u, v) + GEOID_HEIGHT
      geodetic.set(radians(longitude), radians(latitude), height).toECEF(ecef)
      ecefToWorld(frame, ecef, point)
      const k = j * cols + i
      world[k * 3] = point.x
      world[k * 3 + 1] = point.y
      world[k * 3 + 2] = point.z
      uvs[k * 2] = u
      uvs[k * 2 + 1] = v
    }
  }

  // Skirt: a copy of the perimeter, lowered, to hide cracks between levels of detail.
  perimeter.forEach((source, p) => {
    const k = surfaceCount + p
    world[k * 3] = world[source * 3]
    world[k * 3 + 1] = world[source * 3 + 1] - SKIRT_DEPTH
    world[k * 3 + 2] = world[source * 3 + 2]
    uvs[k * 2] = uvs[source * 2]
    uvs[k * 2 + 1] = uvs[source * 2 + 1]
  })

  // Centre and radius, then positions relative to the centre in 32 bits.
  const center = new Vector3()
  const c = Math.floor(surfaceCount / 2)
  center.set(world[c * 3], world[c * 3 + 1], world[c * 3 + 2])
  const positions = new Float32Array(count * 3)
  let radius = 0
  for (let k = 0; k < count; k++) {
    const x = world[k * 3] - center.x
    const y = world[k * 3 + 1] - center.y
    const z = world[k * 3 + 2] - center.z
    positions[k * 3] = x
    positions[k * 3 + 1] = y
    positions[k * 3 + 2] = z
    radius = Math.max(radius, Math.hypot(x, y, z))
  }

  // Triangles: surface, then skirt. Columns run east (+z) and rows south (−x), so (a, d, b)
  // has its normal along +y: (−x) × (+z) = +y.
  const indices: number[] = []
  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * cols + i
      const b = a + 1
      const d = a + cols
      const e = d + 1
      indices.push(a, d, b, b, d, e)
    }
  }
  const surfaceIndexCount = indices.length
  for (let p = 0; p < perimeter.length; p++) {
    const a = perimeter[p]
    const b = perimeter[(p + 1) % perimeter.length]
    const sa = surfaceCount + p
    const sb = surfaceCount + ((p + 1) % perimeter.length)
    indices.push(a, sa, b, b, sa, sb)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  // Normals from the surface alone: including the skirt would tilt the edge normals sideways
  // and draw dark lines along every tile edge. Skirt vertices copy their edge vertex's normal.
  geometry.setIndex(indices.slice(0, surfaceIndexCount))
  geometry.computeVertexNormals()
  const normals = geometry.getAttribute('normal') as BufferAttribute
  perimeter.forEach((source, p) => {
    normals.setXYZ(surfaceCount + p, normals.getX(source), normals.getY(source), normals.getZ(source))
  })
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return { geometry, center, radius }
}
