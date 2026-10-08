// City lights at night (ADR 0041): points of light along the roads and on the buildings of GSI's
// vector tiles, the same tiles the water masks come from. Roads are lit only in the densely
// inhabited districts (urbanAreas.ts), brighter the denser they are: from the air, street lamps
// and traffic show in towns, not on mountain roads (the maintainer, 2026-10-08). Buildings
// outside them keep a faint light. Each terrain tile gets the lights of
// its own vector tile, so near tiles show the small streets and far ones the main roads, as the
// tiles' detail allows. A light is a small round point of a given luminous intensity, dimmer
// with the square of the distance, drawn additively into the scene before the aerial perspective,
// so the haze dims far lights. They switch on as the sun sets.
import { Geodetic, radians } from '@takram/three-geospatial'
import {
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  exp,
  float,
  modelWorldMatrix,
  mrt,
  positionGeometry,
  screenSize,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec4
} from 'three/tsl'
import {
  AddEquation,
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  OneFactor,
  PlaneGeometry,
  Sphere,
  Vector3,
  type Node
} from 'three/webgpu'

import { ecefToWorld, type LocalFrame } from '../geo/localFrame'
import type { VectorTileData } from './gsiSources'
import { GEOID_HEIGHT, sampleHeight, type HeightSource } from './tileGeometry'
import type { UrbanAreas } from './urbanAreas'
import { tileXToLongitude, tileYToLatitude, type TileKey } from './webMercator'

/** A light's size on screen, in pixels, for a light of average brightness. */
const POINT_PIXELS = 2.5
/** Brighter lights are drawn larger: the size follows the brightness by this power. */
const SIZE_POWER = 0.25
/**
 * All lights' intensities against the values below: lower, so that fewer lights saturate and their
 * differences in brightness and colour show (the maintainer chose 0.3 of three, 2026-10-08).
 */
const INTENSITY_SCALE = 0.3
/** Distance between lights along a road, in metres, where the tile is detailed enough. */
const ROAD_SPACING = 35
/** Lights per tile side at most along a road: far tiles space their lights more, each brighter. */
const MAX_LIGHTS_PER_SIDE = 400
/** Metres the lights stand above the ground. */
const LIGHT_HEIGHT = 5
/**
 * Twinkling, as distant lights do through moving air (and with traffic): each light's own speed
 * between these, in cycles per second, slow enough for the anti-aliasing not to average it out.
 */
const TWINKLE_SLOWEST = 0.3
const TWINKLE_FASTEST = 1.5
/** How deep the twinkling is near and 20 km away, as a share of the brightness either way. */
const TWINKLE_NEAR = 0.4
const TWINKLE_FAR = 0.8
/** Share of buildings with a light on. */
const LIT_BUILDINGS = 0.7

/** Luminous intensity in candelas and colour, by road category (GSI's vt_rdctg). */
const ROAD_LIGHTS: Record<string, { candela: number; color: [number, number, number] }> = {
  高速自動車国道等: { candela: 2000, color: [1, 0.62, 0.3] },
  国道: { candela: 2000, color: [1, 0.85, 0.65] },
  都道府県道: { candela: 1500, color: [1, 0.85, 0.65] },
  市区町村道等: { candela: 800, color: [1, 0.9, 0.78] }
}
const OTHER_ROAD = { candela: 800, color: [1, 0.9, 0.78] as [number, number, number] }
/** A building's lights in candelas per square root of its floor area in square metres. */
const BUILDING_CANDELA = 15
/** Buildings' light colours: warm lamps, white lamps and bluish LEDs, with their shares. */
const BUILDING_COLORS: { share: number; color: [number, number, number] }[] = [
  { share: 0.5, color: [1, 0.76, 0.48] },
  { share: 0.35, color: [1, 0.93, 0.82] },
  { share: 0.15, color: [0.82, 0.9, 1] }
]
/** Each light's brightness varies by up to this many stops either way, so towns do not look like grids. */
const BRIGHTNESS_STOPS = 1.5
/** Lights stand up to this many metres off their road's centre line or their building's centre. */
const POSITION_JITTER = 6
/** A building's light outside the densely inhabited districts, against one inside. */
const RURAL_BUILDING = 0.25
/** Population density (people per km²) at which the lights are as given; denser is brighter. */
const REFERENCE_DENSITY = 5000

let urbanAreas: UrbanAreas | null = null

/** The densely inhabited districts; set before the terrain loads. */
export function setUrbanAreas(areas: UrbanAreas): void {
  urbanAreas = areas
}

/** How much brighter a town's lights are for its population density. */
const densityFactor = (density: number): number => Math.min(Math.max(density / REFERENCE_DENSITY, 0.6), 2)

/** How much the city lights are on, 0 to 1. */
const cityLightsOn = uniform(0)
const materials: MeshBasicNodeMaterial[] = []

/** Switches the lights on (0 to 1); off, they are not drawn at all. */
export function setCityLightsOn(value: number): void {
  cityLightsOn.value = value
  for (const material of materials) material.visible = value > 0
}

/** On as the sun sets: from 1° to 6° below the horizon. */
export function cityLightsOnForSunAltitude(degrees: number): number {
  const x = Math.min(Math.max((-1 - degrees) / 5, 0), 1)
  return x * x * (3 - 2 * x)
}

/** A number from 0 to 1 that stays the same for a position. */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** The material shared by all tiles' lights. */
export function createCityLightsMaterial(luminanceScale: Node<'float'>): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()
  material.name = 'city lights'
  const offset = attribute('lightOffset', 'vec3')
  const intensity = attribute('lightIntensity', 'float')
  const color = attribute('lightColor', 'vec3')
  const pixels = attribute('lightSize', 'float')
  const world = modelWorldMatrix.mul(vec4(offset, 1))
  const clip = cameraProjectionMatrix.mul(cameraViewMatrix.mul(world))
  // A square of its size in pixels on screen around the light.
  const corner = positionGeometry.xy.mul(pixels.mul(2)).div(screenSize)
  material.vertexNode = vec4(clip.xy.add(corner.mul(clip.w)), clip.zw)
  // Luminance of the point: the illuminance at the eye (intensity over distance squared) spread
  // over the point's solid angle on screen.
  const distance = cameraPosition.distance(world.xyz)
  // TYPE-BRIDGE: @types/three 0.186 does not type element() on a matrix node. P[1][1] is
  // 1 / tan(half the vertical field of view).
  const projection = cameraProjectionMatrix as unknown as { element(i: number): { element(i: number): Node<'float'> } }
  const pixelAngle = float(2).div(screenSize.y.mul(projection.element(1).element(1)))
  const solidAngle = pixelAngle.mul(pixels).pow2()
  // Twinkling: a speed and a phase of its own from the light's position; deeper further away.
  const seed = sin(offset.x.mul(12.9898).add(offset.z.mul(78.233))).mul(43758.5453).fract()
  const speed = float(TWINKLE_SLOWEST).add(seed.mul(TWINKLE_FASTEST - TWINKLE_SLOWEST))
  const depth = float(TWINKLE_NEAR).add(smoothstep(2000, 20000, distance).mul(TWINKLE_FAR - TWINKLE_NEAR))
  const twinkle = float(1).add(sin(time.mul(speed).mul(2 * Math.PI).add(seed.mul(97.0))).mul(depth))
  const luminance = intensity
    .div(distance.pow2().mul(solidAngle))
    .mul(luminanceScale)
    .mul(cityLightsOn)
    .mul(twinkle)
  const radiance = color.mul(luminance).toVertexStage()
  // Round, soft at the edge.
  const r = uv().sub(0.5).length().mul(2)
  const shape = exp(r.pow2().mul(-3))
  const output = vec4(radiance.mul(shape), 0)
  material.colorNode = output
  // Additive: nothing is added to the scene's velocity, which the anti-aliasing reads.
  material.mrtNode = mrt({ output, velocity: vec4(0) })
  material.transparent = true
  // Added as it is: three's AdditiveBlending weighs the colour by its alpha, which is 0 here so
  // that the scene's alpha stays as it is.
  material.blending = CustomBlending
  material.blendEquation = AddEquation
  material.blendSrc = OneFactor
  material.blendDst = OneFactor
  material.depthWrite = false
  material.visible = cityLightsOn.value > 0
  materials.push(material)
  return material
}

const quad = new PlaneGeometry(1, 1)

/**
 * The lights of one terrain tile, from the part of a vector tile that covers it; null where there
 * are none. Positions are relative to the tile's centre, as the tile's mesh is.
 * @param vector the vector tile, and where the terrain tile lies in it (fractions)
 */
export function buildCityLights(
  tile: TileKey,
  frame: LocalFrame,
  center: Vector3,
  radius: number,
  heights: HeightSource,
  vector: { data: VectorTileData; u0: number; v0: number; size: number },
  material: MeshBasicNodeMaterial
): Mesh | null {
  const west = tileXToLongitude(tile.x, tile.z)
  const east = tileXToLongitude(tile.x + 1, tile.z)
  const latitude = tileYToLatitude(tile.y + 0.5, tile.z)
  const urban = urbanAreas?.within(west, tileYToLatitude(tile.y + 1, tile.z), east, tileYToLatitude(tile.y, tile.z))
  const tileMetres = (40075016.686 * Math.cos(radians(latitude))) / 2 ** tile.z
  const spacing = Math.max(ROAD_SPACING, tileMetres / MAX_LIGHTS_PER_SIDE)

  const offsets: number[] = []
  const intensities: number[] = []
  const colors: number[] = []
  const sizes: number[] = []
  const geodetic = new Geodetic()
  const ecef = new Vector3()
  const point = new Vector3()
  const add = (u: number, v: number, candela: number, color: [number, number, number], road: boolean): void => {
    // Off the line or centre by a few metres, and of its own brightness and colour.
    const r1 = hash(u * 7919, v * 104729)
    const r2 = hash(v * 7919, u * 104729)
    const r3 = hash(u * 3571 + v, v * 2017 - u)
    u += ((r1 - 0.5) * 2 * POSITION_JITTER) / tileMetres
    v += ((r2 - 0.5) * 2 * POSITION_JITTER) / tileMetres
    if (u < 0 || u > 1 || v < 0 || v > 1) return
    const brightness = 2 ** ((r3 - 0.5) * 2 * BRIGHTNESS_STOPS)
    candela *= brightness * INTENSITY_SCALE
    if (road) {
      // Between the road's colour and a whiter one.
      const w = hash(r1, r3) * 0.5
      color = [color[0], color[1] + (0.95 - color[1]) * w, color[2] + (0.88 - color[2]) * w]
    } else {
      let pick = hash(r2, r3)
      color = BUILDING_COLORS[BUILDING_COLORS.length - 1].color
      for (const choice of BUILDING_COLORS) {
        if (pick < choice.share) {
          color = choice.color
          break
        }
        pick -= choice.share
      }
    }
    const longitude = west + (east - west) * u
    const lat = tileYToLatitude(tile.y + v, tile.z)
    const density = urban?.densityAt(longitude, lat) ?? REFERENCE_DENSITY
    if (road && density === 0) return
    candela *= density > 0 ? densityFactor(density) : RURAL_BUILDING
    const height = sampleHeight(heights, u, v) + GEOID_HEIGHT + LIGHT_HEIGHT
    geodetic.set(radians(longitude), radians(lat), height).toECEF(ecef)
    ecefToWorld(frame, ecef, point).sub(center)
    offsets.push(point.x, point.y, point.z)
    intensities.push(candela)
    colors.push(...color)
    sizes.push(POINT_PIXELS * brightness ** SIZE_POWER)
  }
  // Vector tile coordinates to the terrain tile's (u, v).
  const toTile = (x: number, y: number, extent: number): [number, number] => [
    (x / extent - vector.u0) / vector.size,
    (y / extent - vector.v0) / vector.size
  ]

  const { roads, buildings } = vector.data
  if (roads) {
    const metresPerUnit = (tileMetres * vector.size) / roads.extent / vector.size ** 2
    for (const feature of roads.features) {
      if (feature.type !== 2) continue
      const kind = ROAD_LIGHTS[String(feature.properties.vt_rdctg)] ?? OTHER_ROAD
      // Each light stands for the lamps of its stretch, so far tiles keep the same brightness.
      const candela = (kind.candela * spacing) / ROAD_SPACING
      for (const line of feature.parts) {
        let carry = hash(line[0][0], line[0][1]) * spacing
        for (let i = 1; i < line.length; i++) {
          const [x0, y0] = line[i - 1]
          const [x1, y1] = line[i]
          const length = Math.hypot(x1 - x0, y1 - y0) * metresPerUnit
          for (let s = carry; s < length; s += spacing) {
            const t = s / length
            const [u, v] = toTile(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, roads.extent)
            add(u, v, candela, kind.color, true)
          }
          carry = (((carry - length) % spacing) + spacing) % spacing
        }
      }
    }
  }
  if (buildings) {
    const squareMetresPerUnit = ((tileMetres * vector.size) / buildings.extent / vector.size ** 2) ** 2
    for (const feature of buildings.features) {
      if (feature.type !== 3 || feature.parts.length === 0) continue
      const ring = feature.parts[0]
      let area = 0
      let cx = 0
      let cy = 0
      for (let i = 0; i < ring.length; i++) {
        const [x0, y0] = ring[i]
        const [x1, y1] = ring[(i + 1) % ring.length]
        area += x0 * y1 - x1 * y0
        cx += x0
        cy += y0
      }
      cx /= ring.length
      cy /= ring.length
      if (hash(cx, cy) > LIT_BUILDINGS) continue
      const squareMetres = (Math.abs(area) / 2) * squareMetresPerUnit
      const [u, v] = toTile(cx, cy, buildings.extent)
      add(u, v, BUILDING_CANDELA * Math.sqrt(squareMetres), BUILDING_COLORS[0].color, false)
    }
  }
  if (intensities.length === 0) return null

  const geometry = new InstancedBufferGeometry()
  // Each tile its own copy of the quad, as disposing a geometry frees its buffers on the GPU.
  geometry.index = quad.index!.clone()
  geometry.setAttribute('position', quad.getAttribute('position').clone())
  geometry.setAttribute('uv', quad.getAttribute('uv').clone())
  geometry.setAttribute('lightOffset', new InstancedBufferAttribute(new Float32Array(offsets), 3))
  geometry.setAttribute('lightIntensity', new InstancedBufferAttribute(new Float32Array(intensities), 1))
  geometry.setAttribute('lightColor', new InstancedBufferAttribute(new Float32Array(colors), 3))
  geometry.setAttribute('lightSize', new InstancedBufferAttribute(new Float32Array(sizes), 1))
  geometry.instanceCount = intensities.length
  geometry.boundingSphere = new Sphere(new Vector3(), radius + LIGHT_HEIGHT)
  const mesh = new Mesh(geometry, material)
  mesh.name = 'city lights'
  return mesh
}
