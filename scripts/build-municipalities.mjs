// Builds public/places/municipalities.json, the municipal boundaries the HUD's "FLYING OVER"
// line looks the aircraft up in, from the Ministry of Land, Infrastructure, Transport and
// Tourism's National Land Numerical Information administrative areas (国土数値情報 行政区域, N03,
// CC BY 4.0). Run once after downloading and unzipping the prefectures' N03 GeoJSON files:
//
//   node scripts/build-municipalities.mjs <folder with N03 .geojson files> [radius km]
//
// Keeps the municipalities within the radius (60 km by default) of the Hakone area's origin,
// merges the wards of designated cities into their city, thins the boundaries to about 50 m and
// names them in romaji from scripts/municipality-romaji.json; it stops if a name is missing.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = [139.02, 35.23]
const TOLERANCE_DEGREES = 0.0005
const here = dirname(fileURLToPath(import.meta.url))
const romaji = JSON.parse(readFileSync(join(here, 'municipality-romaji.json'), 'utf8'))

const [input, radiusArgument] = process.argv.slice(2)
if (!input) {
  console.error('usage: node scripts/build-municipalities.mjs <folder with N03 .geojson files> [radius km]')
  process.exit(1)
}
const radiusKm = Number(radiusArgument ?? 60)

const files = []
const walk = folder => {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (path.endsWith('.geojson')) files.push(path)
  }
}
walk(input)

const km = ([lon, lat]) =>
  Math.hypot((lon - ORIGIN[0]) * 111.32 * Math.cos((ORIGIN[1] * Math.PI) / 180), (lat - ORIGIN[1]) * 110.6)

// Douglas-Peucker on a closed ring, keeping its first point.
function simplify(points) {
  if (points.length < 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const length = Math.hypot(bx - ax, by - ay) || 1e-12
    let worst = -1
    let index = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      const distance =
        a === 0 && b === points.length - 1 && length < 1e-9
          ? Math.hypot(px - ax, py - ay)
          : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
      if (distance > worst) {
        worst = distance
        index = i
      }
    }
    if (worst > TOLERANCE_DEGREES) {
      keep[index] = 1
      stack.push([a, index], [index, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

const places = new Map()
const missing = new Set()
for (const file of files) {
  const collection = JSON.parse(readFileSync(file, 'utf8'))
  for (const feature of collection.features) {
    const p = feature.properties
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
    let nearest = Infinity
    for (const polygon of polygons) for (const ring of polygon) for (const point of ring) nearest = Math.min(nearest, km(point))
    if (nearest > radiusKm) continue
    // N03_004 is the municipality, or the designated city whose ward is N03_005.
    const prefecture = romaji.prefectures[p.N03_001]
    const municipality = romaji.municipalities[p.N03_004]
    if (!prefecture) missing.add(p.N03_001)
    if (!municipality) missing.add(p.N03_004)
    if (!prefecture || !municipality) continue
    const key = `${municipality}, ${prefecture}`
    const rings = places.get(key) ?? []
    for (const polygon of polygons) {
      for (const ring of polygon) {
        const thinned = simplify(ring)
        if (thinned.length >= 4) rings.push(thinned.flatMap(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))]))
      }
    }
    places.set(key, rings)
  }
}
if (missing.size) {
  console.error(`No romaji for: ${[...missing].join(', ')} (add them to scripts/municipality-romaji.json)`)
  process.exit(1)
}

const output = join(here, '..', 'public', 'places', 'municipalities.json')
mkdirSync(dirname(output), { recursive: true })
const json = {
  source: '国土数値情報（行政区域データ）（国土交通省）, N03 2024, CC BY 4.0, processed by this project',
  places: [...places].map(([name, rings]) => ({ name, rings }))
}
writeFileSync(output, JSON.stringify(json))
console.log(`${places.size} places, ${(JSON.stringify(json).length / 1024).toFixed(0)} KB -> ${output}`)
