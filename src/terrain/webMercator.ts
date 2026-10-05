// XYZ tile coordinates in Web Mercator, as used by GSI tiles (地理院タイル).

export interface TileKey {
  z: number
  x: number
  y: number
}

export const tileId = ({ z, x, y }: TileKey): string => `${z}/${x}/${y}`

/** Longitude in degrees of the west edge of tile column x at zoom z. */
export function tileXToLongitude(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180
}

/** Latitude in degrees of the north edge of tile row y at zoom z. */
export function tileYToLatitude(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

/** Fractional tile coordinates of a point. */
export function lonLatToTile(longitude: number, latitude: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const lat = (latitude * Math.PI) / 180
  return {
    x: ((longitude + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n
  }
}

export function childrenOf({ z, x, y }: TileKey): TileKey[] {
  return [
    { z: z + 1, x: 2 * x, y: 2 * y },
    { z: z + 1, x: 2 * x + 1, y: 2 * y },
    { z: z + 1, x: 2 * x, y: 2 * y + 1 },
    { z: z + 1, x: 2 * x + 1, y: 2 * y + 1 }
  ]
}

/** The ancestor of a tile at a lower zoom, and where the tile sits inside it (0..1). */
export function ancestorOf(
  tile: TileKey,
  z: number
): { tile: TileKey; u0: number; v0: number; size: number } {
  const shift = tile.z - z
  const scale = 2 ** shift
  const x = Math.floor(tile.x / scale)
  const y = Math.floor(tile.y / scale)
  return {
    tile: { z, x, y },
    u0: (tile.x - x * scale) / scale,
    v0: (tile.y - y * scale) / scale,
    size: 1 / scale
  }
}
