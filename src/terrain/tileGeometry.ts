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
/**
 * How far the skirt hangs below the tile edge at least, in metres. Along an edge it hangs this
 * much further than the edge's own rise and fall: a coarser neighbour draws the shared edge with
 * fewer vertices, and on a steep edge the gap between the two can be as large as that range.
 */
const SKIRT_MIN_DEPTH = 30

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
  const longitudes = new Float64Array(cols)
  const latitudes = new Float64Array(cols)
  const surfaceHeights = new Float64Array(surfaceCount)
  const geodetic = new Geodetic()
  const ecef = new Vector3()
  const point = new Vector3()
  const place = (k: number, i: number, j: number, height: number): void => {
    geodetic.set(radians(longitudes[i]), radians(latitudes[j]), height).toECEF(ecef)
    ecefToWorld(frame, ecef, point)
    world[k * 3] = point.x
    world[k * 3 + 1] = point.y
    world[k * 3 + 2] = point.z
  }

  const west = tileXToLongitude(tile.x, tile.z)
  const east = tileXToLongitude(tile.x + 1, tile.z)
  for (let n = 0; n < cols; n++) {
    longitudes[n] = west + ((east - west) * n) / SEGMENTS
    latitudes[n] = tileYToLatitude(tile.y + n / SEGMENTS, tile.z)
  }
  for (let j = 0; j < cols; j++) {
    const v = j / SEGMENTS
    for (let i = 0; i < cols; i++) {
      const u = i / SEGMENTS
      const k = j * cols + i
      surfaceHeights[k] = sampleHeight(heights, u, v) + GEOID_HEIGHT
      place(k, i, j, surfaceHeights[k])
      uvs[k * 2] = u
      uvs[k * 2 + 1] = v
    }
  }

  // Skirt: a copy of the perimeter, lowered straight down (along the ellipsoid normal, not the
  // frame's y, which leans away from up far from the origin) to hide cracks between levels of
  // detail. Each edge's skirt is as deep as the edge rises and falls, plus a margin.
  const edgeRange = (indices: number[]): number => {
    let low = Infinity
    let high = -Infinity
    for (const k of indices) {
      low = Math.min(low, surfaceHeights[k])
      high = Math.max(high, surfaceHeights[k])
    }
    return high - low
  }
  const line = (from: number, step: number): number[] => Array.from({ length: cols }, (_, n) => from + n * step)
  const north = edgeRange(line(0, 1))
  const south = edgeRange(line((cols - 1) * cols, 1))
  const westEdge = edgeRange(line(0, cols))
  const eastEdge = edgeRange(line(cols - 1, cols))
  perimeter.forEach((source, p) => {
    const i = source % cols
    const j = Math.floor(source / cols)
    // A corner takes the deeper of its two edges.
    let range = 0
    if (j === 0) range = Math.max(range, north)
    if (j === cols - 1) range = Math.max(range, south)
    if (i === 0) range = Math.max(range, westEdge)
    if (i === cols - 1) range = Math.max(range, eastEdge)
    const k = surfaceCount + p
    place(k, i, j, surfaceHeights[source] - range - SKIRT_MIN_DEPTH)
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
  // 1 on the skirt, for debugging (?terraindebug=4).
  geometry.setAttribute('skirt', new BufferAttribute(new Float32Array(count).fill(1, surfaceCount), 1))
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
