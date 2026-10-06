// Polygons from a Mapbox Vector Tile (MVT) layer, enough for GSI's vector tiles: the
// protocol buffer is read directly, and each feature's geometry decoded into rings in tile
// coordinates (0 to extent). Spec: https://github.com/mapbox/vector-tile-spec

export interface PolygonFeature {
  /** Rings in tile coordinates; outer rings and holes, told apart by winding. */
  rings: [number, number][][]
}

export interface PolygonLayer {
  extent: number
  features: PolygonFeature[]
}

interface Field {
  field: number
  value?: number
  start?: number
  end?: number
}

function* fields(buf: Uint8Array, start = 0, end = buf.length): Generator<Field> {
  let pos = start
  const varint = (): number => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = buf[pos++]
      result += (byte & 0x7f) * 2 ** shift
      shift += 7
    } while (byte & 0x80)
    return result
  }
  while (pos < end) {
    const key = varint()
    const field = Math.floor(key / 8)
    const type = key & 7
    if (type === 0) yield { field, value: varint() }
    else if (type === 2) {
      const length = varint()
      yield { field, start: pos, end: pos + length }
      pos += length
    } else if (type === 5) pos += 4
    else if (type === 1) pos += 8
    else throw new Error(`Unsupported protobuf wire type ${type}`)
  }
}

/** Unpacks a packed repeated uint32 field. */
function packed(buf: Uint8Array, start: number, end: number): number[] {
  const values: number[] = []
  let pos = start
  while (pos < end) {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = buf[pos++]
      result += (byte & 0x7f) * 2 ** shift
      shift += 7
    } while (byte & 0x80)
    values.push(result)
  }
  return values
}

const zigzag = (n: number): number => (n % 2 === 1 ? -(n + 1) / 2 : n / 2)

/** Decodes MVT geometry commands into rings (MoveTo, LineTo, ClosePath). */
export function decodeRings(commands: number[]): [number, number][][] {
  const rings: [number, number][][] = []
  let ring: [number, number][] = []
  let x = 0
  let y = 0
  let i = 0
  while (i < commands.length) {
    const id = commands[i] & 7
    const count = commands[i] >> 3
    i++
    if (id === 1 || id === 2) {
      for (let k = 0; k < count; k++) {
        x += zigzag(commands[i++])
        y += zigzag(commands[i++])
        if (id === 1 && ring.length > 0) {
          rings.push(ring)
          ring = []
        }
        ring.push([x, y])
      }
    } else if (id === 7) {
      if (ring.length > 0) rings.push(ring)
      ring = []
    }
  }
  if (ring.length > 0) rings.push(ring)
  return rings
}

/** The polygon features of one layer, or null when the tile has no such layer. */
export function readPolygonLayer(buf: Uint8Array, layerName: string): PolygonLayer | null {
  const text = new TextDecoder()
  for (const layer of fields(buf)) {
    if (layer.field !== 3 || layer.start === undefined) continue
    let name = ''
    let extent = 4096
    const features: PolygonFeature[] = []
    for (const f of fields(buf, layer.start, layer.end)) {
      if (f.field === 1 && f.start !== undefined) name = text.decode(buf.subarray(f.start, f.end))
      else if (f.field === 5 && f.value !== undefined) extent = f.value
      else if (f.field === 2 && f.start !== undefined) {
        let type = 0
        let geometry: number[] = []
        for (const g of fields(buf, f.start, f.end)) {
          if (g.field === 3 && g.value !== undefined) type = g.value
          else if (g.field === 4 && g.start !== undefined) geometry = packed(buf, g.start, g.end!)
        }
        // 3: polygon
        if (type === 3) features.push({ rings: decodeRings(geometry) })
      }
    }
    if (name === layerName) return { extent, features }
  }
  return null
}
