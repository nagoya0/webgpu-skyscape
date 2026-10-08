// The densely inhabited districts (人口集中地区, DID) around the course, where the city lights
// shine at night (ADR 0041): built by scripts/build-urban-areas.mjs from the National Land
// Numerical Information (2020 census) into public/places/urban-areas.json.

export interface UrbanArea {
  name: string
  /** People per square kilometre. */
  density: number
  /** Outer ring, then holes; each as longitude, latitude pairs in a flat list. */
  rings: number[][]
}

export interface UrbanAreas {
  /** People per square kilometre at a place, or 0 outside every district. */
  densityAt(longitude: number, latitude: number): number
  /** The districts that may cover a box, to test many points within it faster. */
  within(west: number, south: number, east: number, north: number): UrbanAreas
}

interface Indexed extends UrbanArea {
  west: number
  south: number
  east: number
  north: number
}

/** Whether a point is inside a ring (even-odd rule). */
function inRing(ring: number[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]
    const yi = ring[i + 1]
    const xj = ring[j]
    const yj = ring[j + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function make(areas: Indexed[]): UrbanAreas {
  return {
    densityAt(longitude, latitude) {
      for (const area of areas) {
        if (longitude < area.west || longitude > area.east || latitude < area.south || latitude > area.north) continue
        if (!inRing(area.rings[0], longitude, latitude)) continue
        if (area.rings.slice(1).some(hole => inRing(hole, longitude, latitude))) continue
        return area.density
      }
      return 0
    },
    within(west, south, east, north) {
      return make(areas.filter(a => a.east >= west && a.west <= east && a.north >= south && a.south <= north))
    }
  }
}

export function urbanAreasFrom(areas: UrbanArea[]): UrbanAreas {
  return make(
    areas.map(area => {
      const outer = area.rings[0]
      let west = Infinity
      let south = Infinity
      let east = -Infinity
      let north = -Infinity
      for (let i = 0; i < outer.length; i += 2) {
        west = Math.min(west, outer[i])
        east = Math.max(east, outer[i])
        south = Math.min(south, outer[i + 1])
        north = Math.max(north, outer[i + 1])
      }
      return { ...area, west, south, east, north }
    })
  )
}

export async function loadUrbanAreas(): Promise<UrbanAreas> {
  const response = await fetch(`${import.meta.env.BASE_URL}places/urban-areas.json`)
  const data = (await response.json()) as { areas: UrbanArea[] }
  return urbanAreasFrom(data.areas)
}
