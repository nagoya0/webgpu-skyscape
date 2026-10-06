// Terrain from GSI elevation and aerial photograph tiles (ADR 0026): a quadtree of XYZ tiles,
// refined where a photo texel would cover more than a pixel or so. A tile is drawn until all
// four of its children are ready, so the surface never has holes while loading.
import type { AtmosphereContext } from '@takram/three-atmosphere/webgpu'
import {
  CanvasTexture,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardNodeMaterial,
  RedFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
  type PerspectiveCamera
} from 'three/webgpu'

import { Geodetic, radians } from '@takram/three-geospatial'

import { ecefToWorld, type LocalFrame } from '../geo/localFrame'
import { DEM10_ZOOM, DEM5A_ZOOM, loadHeights, loadPhoto, pendingRequests } from './gsiSources'
import { gradedPhoto } from './photoGrade'
import { buildTileGeometry, buildWaterMask, GEOID_HEIGHT, type HeightSource } from './tileGeometry'
import { terrainShading } from './water'
import {
  ancestorOf,
  childrenOf,
  lonLatToTile,
  tileId,
  tileXToLongitude,
  tileYToLatitude,
  type TileKey
} from './webMercator'

export interface TerrainOptions {
  /** Centre of the area, degrees. */
  longitude: number
  latitude: number
  /** Half the width of the area covered by root tiles, in degrees of longitude. */
  extentDegrees: number
  rootZoom: number
  maxZoom: number
  /** Photo tiles per terrain tile side = 2^photoLevels. */
  photoLevels: number
  /** Refine while a photo texel covers more than this many pixels. */
  texelPixels: number
  /** Tiles kept loaded at most. */
  maxTiles: number
  /** Tiles loading at once at most. */
  maxLoading: number
}

export const DEFAULT_TERRAIN: TerrainOptions = {
  longitude: 139.757,
  latitude: 35.665,
  extentDegrees: 0.6,
  rootZoom: 10,
  maxZoom: 17,
  photoLevels: 1,
  texelPixels: 1.5,
  maxTiles: 300,
  maxLoading: 8
}

type State = 'empty' | 'loading' | 'ready' | 'failed'

interface Tile {
  key: TileKey
  state: State
  mesh: Mesh | null
  center: Vector3
  radius: number
  /** Width of the tile on the ground, metres. */
  size: number
  children: Tile[] | null
  lastUsed: number
  abort: AbortController | null
}

export interface Terrain {
  group: Group
  update(camera: PerspectiveCamera, height: number): void
  stats(): {
    ready: number
    loading: number
    drawn: number
    requests: number
    textureMB: number
    /** Ready tiles drawn with water. */
    water: number
    /** Tiles whose loading failed; they leave holes. */
    failed: number
  }
}

export function createTerrain(
  frame: LocalFrame,
  options: TerrainOptions = DEFAULT_TERRAIN,
  /** For the sky reflected on water; without it, water is drawn as the photograph. */
  atmosphereContext: AtmosphereContext | null = null
): Terrain {
  const group = new Group()
  group.name = 'Terrain'
  const tiles = new Map<string, Tile>()
  let frameNumber = 0
  let loading = 0
  let drawn = 0

  const metresPerDegree = 111_320 * Math.cos((options.latitude * Math.PI) / 180)
  const geodetic = new Geodetic()
  const ecef = new Vector3()
  const makeTile = (key: TileKey): Tile => {
    const id = tileId(key)
    let tile = tiles.get(id)
    if (!tile) {
      const size = (360 / 2 ** key.z) * metresPerDegree
      // Until the tile loads, its centre is estimated at the geoid; good enough to rank tiles.
      const longitude = (tileXToLongitude(key.x, key.z) + tileXToLongitude(key.x + 1, key.z)) / 2
      const latitude = (tileYToLatitude(key.y, key.z) + tileYToLatitude(key.y + 1, key.z)) / 2
      geodetic.set(radians(longitude), radians(latitude), GEOID_HEIGHT).toECEF(ecef)
      tile = {
        key,
        state: 'empty',
        mesh: null,
        center: ecefToWorld(frame, ecef),
        radius: size * 0.75,
        size,
        children: null,
        lastUsed: 0,
        abort: null
      }
      tiles.set(id, tile)
    }
    return tile
  }

  // Root tiles around the area.
  const { rootZoom } = options
  const a = lonLatToTile(options.longitude - options.extentDegrees, options.latitude + options.extentDegrees, rootZoom)
  const b = lonLatToTile(options.longitude + options.extentDegrees, options.latitude - options.extentDegrees, rootZoom)
  const roots: Tile[] = []
  for (let y = Math.floor(a.y); y <= Math.floor(b.y); y++) {
    for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++) {
      roots.push(makeTile({ z: rootZoom, x, y }))
    }
  }

  const heightSource = async (key: TileKey, signal: AbortSignal): Promise<HeightSource> => {
    if (key.z >= DEM5A_ZOOM) {
      const fine = ancestorOf(key, DEM5A_ZOOM)
      const grid = await loadHeights(fine.tile, signal)
      if (grid) return { grid, u0: fine.u0, v0: fine.v0, size: fine.size }
    }
    const coarse = ancestorOf(key, Math.min(key.z, DEM10_ZOOM))
    const grid = await loadHeights(coarse.tile, signal)
    return { grid, u0: coarse.u0, v0: coarse.v0, size: coarse.size }
  }

  const load = (tile: Tile): void => {
    tile.state = 'loading'
    loading++
    const abort = new AbortController()
    tile.abort = abort
    // The water mask comes from the 10 m DEM, which covers all land; the 5 m DEM has gaps on
    // land that would read as sea.
    const maskSource = async (): Promise<HeightSource> => {
      const coarse = ancestorOf(tile.key, Math.min(tile.key.z, DEM10_ZOOM))
      const grid = await loadHeights(coarse.tile, abort.signal)
      return { grid, u0: coarse.u0, v0: coarse.v0, size: coarse.size }
    }
    Promise.all([
      heightSource(tile.key, abort.signal),
      loadPhoto(tile.key, options.photoLevels, abort.signal),
      atmosphereContext ? maskSource() : null
    ])
      .then(([heights, photo, maskHeights]) => {
        if (abort.signal.aborted || !photo) {
          tile.state = 'empty'
          return
        }
        const { geometry, center, radius } = buildTileGeometry(tile.key, frame, heights)
        const texture = new CanvasTexture(photo)
        texture.colorSpace = SRGBColorSpace
        texture.flipY = false
        texture.anisotropy = 8
        const material = new MeshStandardNodeMaterial({
          map: texture,
          roughness: 1,
          metalness: 0,
          side: DoubleSide
        })
        const land = gradedPhoto(texture)
        const mask = maskHeights && atmosphereContext ? buildWaterMask(maskHeights) : null
        let waterMask: DataTexture | null = null
        if (mask && atmosphereContext) {
          // Only tiles with water get the water shading, which costs a sky lookup per pixel.
          waterMask = new DataTexture(mask, 64, 64, RedFormat, UnsignedByteType)
          waterMask.minFilter = LinearFilter
          waterMask.magFilter = LinearFilter
          waterMask.needsUpdate = true
          Object.assign(material, terrainShading(atmosphereContext, land, waterMask))
        } else {
          material.colorNode = land
        }
        const mesh = new Mesh(geometry, material)
        mesh.name = `terrain ${tileId(tile.key)}`
        mesh.userData.waterMask = waterMask
        mesh.position.copy(center)
        mesh.receiveShadow = true // cloud shadows
        mesh.visible = false
        group.add(mesh)
        tile.mesh = mesh
        tile.center.copy(center)
        tile.radius = radius
        tile.state = 'ready'
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          console.warn(`Terrain tile ${tileId(tile.key)} failed`, error)
          tile.state = 'failed'
        } else {
          tile.state = 'empty'
        }
      })
      .finally(() => {
        loading--
        tile.abort = null
      })
  }

  const unload = (tile: Tile): void => {
    tile.abort?.abort()
    if (tile.mesh) {
      group.remove(tile.mesh)
      tile.mesh.geometry.dispose()
      const material = tile.mesh.material as MeshStandardNodeMaterial
      material.map?.dispose()
      ;(tile.mesh.userData.waterMask as DataTexture | null)?.dispose()
      material.dispose()
      tile.mesh = null
    }
    tile.state = 'empty'
  }

  const cameraPosition = new Vector3()
  return {
    group,
    update(camera, height) {
      frameNumber++
      cameraPosition.setFromMatrixPosition(camera.matrixWorld)
      const pixelsPerRadian = height / (2 * Math.tan((camera.fov * Math.PI) / 360))
      const wanted: Tile[] = []
      drawn = 0

      const distanceTo = (tile: Tile): number =>
        Math.max(cameraPosition.distanceTo(tile.center) - tile.radius, 1)

      // Photo texel size on screen, in pixels, for a tile seen from the camera.
      const texelOnScreen = (tile: Tile): number => {
        const distance = distanceTo(tile)
        const texel = tile.size / (256 * 2 ** options.photoLevels)
        return (texel / distance) * pixelsPerRadian
      }

      const visit = (tile: Tile): void => {
        tile.lastUsed = frameNumber
        if (tile.state !== 'ready') {
          if (tile.state === 'empty') wanted.push(tile)
          return
        }
        const refine = tile.key.z < options.maxZoom && texelOnScreen(tile) > options.texelPixels
        if (refine) {
          tile.children ??= childrenOf(tile.key).map(makeTile)
          const ready = tile.children.every(child => child.state === 'ready' || child.state === 'failed')
          if (ready) {
            for (const child of tile.children) {
              if (child.state === 'ready') visit(child)
            }
            tile.mesh!.visible = false
            return
          }
          for (const child of tile.children) {
            child.lastUsed = frameNumber
            if (child.state === 'empty') wanted.push(child)
          }
        }
        tile.mesh!.visible = true
        drawn++
      }

      for (const tile of tiles.values()) {
        if (tile.mesh) tile.mesh.visible = false
      }
      for (const root of roots) visit(root)

      // Start the nearest wanted tiles first. A tile is only wanted once its parent is ready.
      wanted.sort((p, q) => distanceTo(p) - distanceTo(q))
      for (const tile of wanted) {
        if (loading >= options.maxLoading) break
        load(tile)
      }

      // Unload tiles not used recently when over the limit, oldest first, never roots.
      const loaded = [...tiles.values()].filter(t => t.state === 'ready' && t.lastUsed !== frameNumber)
      const excess = [...tiles.values()].filter(t => t.state === 'ready').length - options.maxTiles
      if (excess > 0) {
        loaded
          .filter(t => !roots.includes(t))
          .sort((p, q) => p.lastUsed - q.lastUsed)
          .slice(0, excess)
          .forEach(unload)
      }
    },
    stats() {
      let ready = 0
      let failed = 0
      let water = 0
      let textureBytes = 0
      for (const tile of tiles.values()) {
        if (tile.state === 'ready') {
          ready++
          if (tile.mesh?.userData.waterMask) water++
          const side = 256 * 2 ** options.photoLevels
          // RGBA8 with mipmaps.
          textureBytes += side * side * 4 * (4 / 3)
        } else if (tile.state === 'failed') {
          failed++
        }
      }
      return {
        ready,
        loading,
        drawn,
        requests: pendingRequests(),
        textureMB: Math.round(textureBytes / 1e6),
        water,
        failed
      }
    }
  }
}
