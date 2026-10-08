// Builds public/places/urban-areas.json, the densely inhabited districts (人口集中地区, DID) where
// the city lights shine at night (ADR 0041), from the National Land Numerical Information
// densely inhabited district data (国土数値情報 人口集中地区データ, A16, 2020 census; Government
// Standard Terms of Use 2.0, compatible with CC BY 4.0). Run once after downloading and unzipping
// the prefectures' A16-20 files:
//
//   node scripts/build-urban-areas.mjs <folder with A16 .geojson files> [radius km]
//
// Keeps the districts within the radius (60 km by default) of the Hakone area's origin and thins
// their outlines to about 50 m. Each district keeps its population density.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = [139.02, 35.23]
const TOLERANCE_DEGREES = 0.0005
const here = dirname(fileURLToPath(import.meta.url))

const [input, radiusArgument] = process.argv.slice(2)
if (!input) {
  console.error('usage: node scripts/build-urban-areas.mjs <folder with A16 .geojson files> [radius km]')
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

const round = value => Math.round(value * 1e5) / 1e5
const areas = []
for (const file of files) {
  const collection = JSON.parse(readFileSync(file, 'utf8'))
  for (const feature of collection.features) {
    const p = feature.properties
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
    for (const polygon of polygons) {
      let nearest = Infinity
      for (const point of polygon[0]) nearest = Math.min(nearest, km(point))
      if (nearest > radiusKm) continue
      const rings = polygon.map(ring => simplify(ring).flatMap(([lon, lat]) => [round(lon), round(lat)]))
      if (rings[0].length < 6) continue
      // People per square kilometre; A16_005 is the population, A16_006 the area in km².
      const density = Math.round(p.A16_005 / Math.max(p.A16_006, 0.01))
      areas.push({ name: p.A16_003, density, rings })
    }
  }
}
areas.sort((a, b) => b.density - a.density)

const output = join(here, '..', 'public', 'places', 'urban-areas.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify({ source: 'A16-20 (2020 census)', areas }))
console.log(`${areas.length} districts, ${Math.round(statSync(output).size / 1024)} KB`)
