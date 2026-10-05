// PLATEAU buildings as 3D Tiles (ADR 0007, ADR 0023), streamed for now from PLATEAU's own
// distribution service. The tiles are in ECEF; one matrix moves them into the local frame
// (ADR 0017).
import { TilesRenderer } from '3d-tiles-renderer'
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import {
  Box3,
  BundleGroup,
  Group,
  type Material,
  type Mesh,
  type PerspectiveCamera
} from 'three/webgpu'

import type { LocalFrame } from '../geo/localFrame'

// The wards along the proposed course (ideas.md): Shinjuku, Shibuya, Minato, Chiyoda, Chuo,
// Taito, Sumida, Koto.
const WARDS = ['13104', '13113', '13103', '13101', '13102', '13106', '13107', '13108']

/** LOD2 buildings of the wards along the course, with or without PLATEAU's textures. */
export function plateauBuildingUrls(textured: boolean): string[] {
  const variant = textured ? 'texture' : 'notexture'
  return WARDS.map(
    code => `https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/${code}-bldg-lod2-${variant}-latest/tileset.json`
  )
}

export interface Buildings {
  group: Group
  /** Call once per frame, after the camera has moved. */
  update(width: number, height: number): void
  /** Tiles currently downloading or parsing, and tiles loaded. */
  stats(): { loading: number; loaded: number }
  /** For checks: world-space bounds of the loaded meshes, rounded to metres. */
  bounds(): { min: number[]; max: number[]; meshes: number } | null
  /** For checks: visible tiles per depth in the tile tree, and active tiles. */
  traversal(): { visibleByDepth: Record<number, number>; active: number; cacheMB: number[]; full: boolean[] }
}

export function createBuildings(
  frame: LocalFrame,
  camera: PerspectiveCamera,
  urls: readonly string[],
  /** Replaces the material of every loaded mesh, for the untextured tiles. */
  material: Material | null = null,
  errorTarget = 20,
  cacheBytes = 1.5e9,
  /** Record the tiles' draw calls in a render bundle, re-recorded only when tiles change. */
  bundle = true
): Buildings {
  // Encoding about a thousand tile draw calls every frame cost about 9 ms of JavaScript
  // (2026-10-06). The tiles renderer already hides tiles outside the view, so the bundle only
  // needs re-recording when a tile is shown, hidden, loaded or unloaded.
  const group = bundle ? new BundleGroup() : new Group()
  group.name = 'PLATEAU buildings'
  group.matrixAutoUpdate = false
  group.matrix.copy(frame.ecefToWorld)
  const invalidate = (): void => {
    if (group instanceof BundleGroup) group.needsUpdate = true
  }

  // PLATEAU meshes are Draco-compressed and carry their centre in the CESIUM_RTC extension.
  const dracoLoader = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

  // PLATEAU's textured tiles take about 25 MB each once their textures are decoded, so the
  // default cache (0.4 GB per tileset) fills after about 50 tiles and the finer levels, which
  // hold the small buildings, never load. One cache is shared by all wards with a larger
  // limit. Converting the textures to KTX2 (ADR 0006) will be needed to bring this down.
  let sharedCache: unknown = null
  const tilesets = urls.map(url => {
    const tiles = new TilesRenderer(url)
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader, rtc: true }))
    tiles.errorTarget = errorTarget
    const cache = (tiles as unknown as { lruCache: { minBytesSize: number; maxBytesSize: number } })
      .lruCache
    if (sharedCache === null) {
      cache.minBytesSize = cacheBytes * 0.75
      cache.maxBytesSize = cacheBytes
      sharedCache = cache
    } else {
      ;(tiles as unknown as { lruCache: unknown }).lruCache = sharedCache
    }
    if (material) {
      tiles.addEventListener('load-model', ({ scene }) => {
        scene.traverse(object => {
          const mesh = object as Mesh
          if (mesh.isMesh) {
            // 'load-model' fires after the renderer has recorded the tile's own materials, which
            // it disposes when the tile unloads; the shared material is not among them.
            mesh.material = material
          }
        })
      })
    }
    tiles.addEventListener('tile-visibility-change', invalidate)
    tiles.addEventListener('load-model', invalidate)
    tiles.addEventListener('dispose-model', invalidate)
    tiles.setCamera(camera)
    group.add(tiles.group)
    return tiles
  })
  group.updateMatrixWorld(true)

  return {
    group,
    update(width, height) {
      for (const tiles of tilesets) {
        tiles.setResolution(camera, width, height)
        tiles.update()
      }
    },
    stats() {
      let loading = 0
      let loaded = 0
      for (const tiles of tilesets) {
        // `stats` exists at run time but is missing from the type declarations of 0.5.3.
        const s = (tiles as unknown as { stats: { queued: number; downloading: number; parsing: number; loaded: number } }).stats
        loading += s.queued + s.downloading + s.parsing
        loaded += s.loaded
      }
      return { loading, loaded }
    },
    bounds() {
      const box = new Box3()
      let meshes = 0
      group.traverse(object => {
        if ((object as Mesh).isMesh) {
          // Precise: transform every vertex, not the local bounding box.
          box.expandByObject(object, true)
          meshes++
        }
      })
      if (meshes === 0) return null
      return {
        min: box.min.toArray().map(Math.round),
        max: box.max.toArray().map(Math.round),
        meshes
      }
    },
    traversal() {
      const visibleByDepth: Record<number, number> = {}
      let active = 0
      const cacheMB: number[] = []
      const full: boolean[] = []
      for (const tiles of tilesets) {
        // Internal fields of 0.5.3, read only for checks.
        const t = tiles as unknown as {
          visibleTiles: Set<{ internal: { depth: number } }>
          activeTiles: Set<unknown>
          lruCache: { cachedBytes: number; isFull(): boolean }
        }
        cacheMB.push(Math.round(t.lruCache.cachedBytes / 1e6))
        full.push(t.lruCache.isFull())
        for (const tile of t.visibleTiles) {
          visibleByDepth[tile.internal.depth] = (visibleByDepth[tile.internal.depth] ?? 0) + 1
        }
        active += t.activeTiles.size
      }
      return { visibleByDepth, active, cacheMB, full }
    }
  }
}
