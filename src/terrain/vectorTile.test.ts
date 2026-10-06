import { describe, expect, it } from 'vitest'

import { decodeRings, readPolygonLayer } from './vectorTile'

const zz = (n: number): number => (n >= 0 ? n * 2 : -n * 2 - 1)
const command = (id: number, count: number): number => (count << 3) | id

// A square from (1, 1) to (3, 3), then a second ring.
const square = [
  command(1, 1), zz(1), zz(1),
  command(2, 3), zz(2), zz(0), zz(0), zz(2), zz(-2), zz(0),
  command(7, 1),
  command(1, 1), zz(0), zz(-1),
  command(2, 2), zz(1), zz(0), zz(0), zz(1),
  command(7, 1)
]

function varint(n: number): number[] {
  const out: number[] = []
  while (n > 127) {
    out.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  out.push(n)
  return out
}
const bytes = (field: number, data: number[]): number[] => [...varint((field << 3) | 2), ...varint(data.length), ...data]
const int = (field: number, value: number): number[] => [...varint(field << 3), ...varint(value)]

describe('vector tiles', () => {
  it('decodes polygon rings from geometry commands', () => {
    expect(decodeRings(square)).toEqual([
      [[1, 1], [3, 1], [3, 3], [1, 3]],
      [[1, 2], [2, 2], [2, 3]]
    ])
  })

  it('reads a named layer from a tile', () => {
    const geometry = square.flatMap(varint)
    const feature = [...int(3, 3), ...bytes(4, geometry)]
    const name = [...new TextEncoder().encode('WA')]
    const layer = [...bytes(1, name), ...bytes(2, feature), ...int(5, 4096)]
    const tile = new Uint8Array(bytes(3, layer))
    const result = readPolygonLayer(tile, 'WA')
    expect(result?.extent).toBe(4096)
    expect(result?.features).toHaveLength(1)
    expect(result?.features[0].rings[0][2]).toEqual([3, 3])
    expect(readPolygonLayer(tile, 'other')).toBeNull()
  })
})
