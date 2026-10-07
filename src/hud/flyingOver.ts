// Which municipality the aircraft is over, for the screen layer's "FLYING OVER SUSONO, SHIZUOKA"
// line (the maintainer, 2026-10-07). The boundaries are National Land Numerical Information
// administrative areas within 60 km of the Hakone origin, thinned and named in romaji by
// scripts/build-municipalities.mjs. Over none of them near the course, the aircraft is over the
// sea; further out than the data reaches, nothing is said.

export interface Places {
  /** The line for a position, or null where the data does not reach. */
  lineAt(longitude: number, latitude: number): string | null
}

interface Place {
  name: string
  rings: Float64Array[]
  box: [number, number, number, number]
}

/** The data covers 60 km around this point; inside 55 km, no municipality means the sea. */
const ORIGIN = { longitude: 139.02, latitude: 35.23 }
const SEA_RADIUS_KM = 55

/** Even-odd test over all of a place's rings (outer boundaries and holes alike). */
function inside(place: Place, x: number, y: number): boolean {
  const [minX, minY, maxX, maxY] = place.box
  if (x < minX || x > maxX || y < minY || y > maxY) return false
  let odd = false
  for (const ring of place.rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i]
      const yi = ring[i + 1]
      const xj = ring[j]
      const yj = ring[j + 1]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd
    }
  }
  return odd
}

export async function loadPlaces(): Promise<Places> {
  const response = await fetch(`${import.meta.env.BASE_URL}places/municipalities.json`)
  const json = (await response.json()) as { places: { name: string; rings: number[][] }[] }
  const places: Place[] = json.places.map(({ name, rings }) => {
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) {
        box[0] = Math.min(box[0], ring[i])
        box[1] = Math.min(box[1], ring[i + 1])
        box[2] = Math.max(box[2], ring[i])
        box[3] = Math.max(box[3], ring[i + 1])
      }
    }
    return { name, rings: rings.map(ring => Float64Array.from(ring)), box }
  })
  return {
    lineAt(longitude, latitude) {
      const place = places.find(p => inside(p, longitude, latitude))
      if (place) return `FLYING OVER ${place.name}`
      const km = Math.hypot(
        (longitude - ORIGIN.longitude) * 111.32 * Math.cos((ORIGIN.latitude * Math.PI) / 180),
        (latitude - ORIGIN.latitude) * 110.6
      )
      return km < SEA_RADIUS_KM ? 'FLYING OVER THE SEA' : null
    }
  }
}
