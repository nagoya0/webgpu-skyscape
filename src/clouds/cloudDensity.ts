// The clouds' density at one point, on the CPU (cloud step C5): the same weather map, shape and
// detail noise and layer settings as the GPU march (wgsl/cloudWeather.wgsl, wgsl/cloudMedia.wgsl),
// sampled with the same bilinear and trilinear filtering. It tells the effects whether the camera
// is in a cloud. Turbulence is not in the GPU march either.

/** An RGBA8 image whose row 0 is at v = 0, as the GPU samples it. */
export interface WeatherMap {
  data: Uint8Array
  size: number
}

/** A single-channel 8-bit volume, x fastest, as uploaded to the GPU. */
export interface NoiseVolume {
  data: Uint8Array
  size: number
}

export interface DensityLayer {
  altitude: number
  height: number
  densityScale: number
  shapeAmount: number
  detailAmount: number
  weatherExponent: number
  shapeAlteringBias: number
  coverageFilterWidth: number
}

export interface DensityInputs {
  weather: WeatherMap
  shape: NoiseVolume
  /** Null when the SHAPE_DETAIL feature is off. */
  detail: NoiseVolume | null
  layers: readonly DensityLayer[]
  /** Texture repeats per metre: shape, detail, weather (1 / tile size). */
  shapeRepeat: number
  detailRepeat: number
  weatherRepeat: number
  /** takram's density profile: linear × height fraction + constant. */
  profileLinear: number
  profileConstant: number
  /** The earth as a sphere in world coordinates. */
  earthCenter: { x: number; y: number; z: number }
  earthRadius: number
}

/** Offsets that move the clouds with the wind, as the GPU's uniforms. */
export interface DensityOffsets {
  weather: { x: number; y: number }
  shape: { x: number; y: number; z: number }
  detail: { x: number; y: number; z: number }
}

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1)
const remapClamped = (x: number, a: number, b: number): number => clamp01((x - a) / Math.max(b - a, 1e-7))
const mix = (a: number, b: number, t: number): number => a + (b - a) * t
const wrap = (i: number, n: number): number => ((i % n) + n) % n

/** Bilinear sample of one channel with repeat wrapping, texel centres at half texels. */
function sampleWeather(map: WeatherMap, u: number, v: number, channel: number): number {
  const n = map.size
  const fx = u * n - 0.5
  const fy = v * n - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const at = (x: number, y: number): number => map.data[(wrap(y, n) * n + wrap(x, n)) * 4 + channel]
  const top = mix(at(x0, y0), at(x0 + 1, y0), tx)
  const bottom = mix(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx)
  return mix(top, bottom, ty) / 255
}

/** Trilinear sample with repeat wrapping. */
function sampleVolume(volume: NoiseVolume, u: number, v: number, w: number): number {
  const n = volume.size
  const fx = u * n - 0.5
  const fy = v * n - 0.5
  const fz = w * n - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const z0 = Math.floor(fz)
  const tx = fx - x0
  const ty = fy - y0
  const tz = fz - z0
  const at = (x: number, y: number, z: number): number =>
    volume.data[(wrap(z, n) * n + wrap(y, n)) * n + wrap(x, n)]
  const plane = (z: number): number =>
    mix(mix(at(x0, y0, z), at(x0 + 1, y0, z), tx), mix(at(x0, y0 + 1, z), at(x0 + 1, y0 + 1, z), tx), ty)
  return mix(plane(z0), plane(z0 + 1), tz) / 255
}

/**
 * Extinction per metre at a world position: the sum over the layers of their density, as the
 * GPU march takes it (the scattering coefficient is 1).
 * @param coverage 0 to 1, as the clouds' coverage
 */
export function cloudDensityAt(
  inputs: DensityInputs,
  position: { x: number; y: number; z: number },
  offsets: DensityOffsets,
  coverage: number
): number {
  const { x, y, z } = position
  const rx = x - inputs.earthCenter.x
  const ry = y - inputs.earthCenter.y
  const rz = z - inputs.earthCenter.z
  const distance = Math.hypot(rx, ry, rz)
  const height = distance - inputs.earthRadius

  // World axes: x north, z east; the weather map's u runs north, v east.
  const u = x * inputs.weatherRepeat + offsets.weather.x
  const v = z * inputs.weatherRepeat + offsets.weather.y
  // takram's evolution: the shape moves down along the surface normal as the weather moves.
  const evolution = Math.hypot(offsets.weather.x, offsets.weather.y) * 2e4
  const k = 1 - evolution / distance
  const sx = rx * k + inputs.earthCenter.x
  const sy = ry * k + inputs.earthCenter.y
  const sz = rz * k + inputs.earthCenter.z

  let sum = 0
  let shape: number | null = null
  let detail: number | null = null
  inputs.layers.forEach((layer, i) => {
    if (i > 3) return
    const heightFraction = remapClamped(height, layer.altitude, layer.altitude + layer.height)
    if (heightFraction <= 0 || heightFraction >= 1) return

    // cloudWeather(): the coverage-modulated weather.
    const weather = Math.pow(sampleWeather(inputs.weather, u, v, i), layer.weatherExponent)
    const biased = Math.pow(heightFraction, layer.shapeAlteringBias)
    const c = Math.min(Math.max(biased * 2 - 1, -1), 1)
    const factor = 1 - coverage * (1 - c * c)
    let density = remapClamped(
      mix(weather, 1, layer.coverageFilterWidth),
      factor,
      factor + layer.coverageFilterWidth
    )
    if (density <= 1e-5) return

    // cloudMedia(): shape, detail and the density profile.
    shape ??= sampleVolume(
      inputs.shape,
      sx * inputs.shapeRepeat + offsets.shape.x,
      sy * inputs.shapeRepeat + offsets.shape.y,
      sz * inputs.shapeRepeat + offsets.shape.z
    )
    density = remapClamped(density, (1 - shape) * layer.shapeAmount, 1)
    if (inputs.detail) {
      detail ??= sampleVolume(
        inputs.detail,
        x * inputs.detailRepeat + offsets.detail.x,
        y * inputs.detailRepeat + offsets.detail.y,
        z * inputs.detailRepeat + offsets.detail.z
      )
      let modifier = mix(Math.pow(detail, 6), 1 - detail, remapClamped(heightFraction, 0.2, 0.4))
      modifier = mix(0, modifier, layer.detailAmount)
      density = remapClamped(density * 2, modifier * 0.5, 1)
    }
    sum += clamp01(density * layer.densityScale * (inputs.profileLinear * heightFraction + inputs.profileConstant))
  })
  return sum
}
