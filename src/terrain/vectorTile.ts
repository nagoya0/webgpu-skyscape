// Features from a Mapbox Vector Tile (MVT) layer, enough for GSI's vector tiles: the protocol
// buffer is read directly, and each feature's geometry decoded into rings or lines in tile
// coordinates (0 to extent), with its properties. Spec: https://github.com/mapbox/vector-tile-spec

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
  /** A fixed-size value (32 or 64 bits), for property values. */
  fixed?: boolean
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
    } else if (type === 5) {
      yield { field, start: pos, end: pos + 4, fixed: true }
      pos += 4
    } else if (type === 1) {
      yield { field, start: pos, end: pos + 8, fixed: true }
      pos += 8
    }
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

export interface Feature {
  /** 1 point, 2 line, 3 polygon. */
  type: number
  /** Rings of a polygon, or the parts of a line, in tile coordinates. */
  parts: [number, number][][]
  properties: Record<string, string | number>
}

export interface Layer {
  extent: number
  features: Feature[]
}

/** Reads a property value message: string, float, double or integer. */
function readValue(buf: Uint8Array, start: number, end: number): string | number {
  for (const f of fields(buf, start, end)) {
    if (f.field === 1 && f.start !== undefined) return new TextDecoder().decode(buf.subarray(f.start, f.end))
    if (f.fixed && f.start !== undefined) {
      const view = new DataView(buf.buffer, buf.byteOffset + f.start, f.end! - f.start)
      return f.end! - f.start === 4 ? view.getFloat32(0, true) : view.getFloat64(0, true)
    }
    if (f.value !== undefined) return f.field === 6 ? zigzag(f.value) : f.value
  }
  return 0
}

/** The named layers of a tile, with every feature's geometry and properties. */
export function readLayers(buf: Uint8Array, names: readonly string[]): Map<string, Layer> {
  const text = new TextDecoder()
  const layers = new Map<string, Layer>()
  for (const layer of fields(buf)) {
    if (layer.field !== 3 || layer.start === undefined) continue
    let name = ''
    let extent = 4096
    const keys: string[] = []
    const values: (string | number)[] = []
    const raw: { type: number; tags: number[]; geometry: number[] }[] = []
    for (const f of fields(buf, layer.start, layer.end)) {
      if (f.field === 1 && f.start !== undefined) name = text.decode(buf.subarray(f.start, f.end))
      else if (f.field === 5 && f.value !== undefined) extent = f.value
      else if (f.field === 3 && f.start !== undefined) keys.push(text.decode(buf.subarray(f.start, f.end)))
      else if (f.field === 4 && f.start !== undefined) values.push(readValue(buf, f.start, f.end!))
      else if (f.field === 2 && f.start !== undefined) {
        let type = 0
        let tags: number[] = []
        let geometry: number[] = []
        for (const g of fields(buf, f.start, f.end)) {
          if (g.field === 3 && g.value !== undefined) type = g.value
          else if (g.field === 2 && g.start !== undefined) tags = packed(buf, g.start, g.end!)
          else if (g.field === 4 && g.start !== undefined) geometry = packed(buf, g.start, g.end!)
        }
        raw.push({ type, tags, geometry })
      }
    }
    if (!names.includes(name)) continue
    const features = raw.map(({ type, tags, geometry }) => {
      const properties: Record<string, string | number> = {}
      for (let i = 0; i + 1 < tags.length; i += 2) properties[keys[tags[i]]] = values[tags[i + 1]]
      return { type, parts: decodeRings(geometry), properties }
    })
    layers.set(name, { extent, features })
  }
  return layers
}