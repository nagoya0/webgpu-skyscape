// Draws all building tiles in one BatchedMesh instead of one draw call per tile mesh.
// 3DTilesRendererJS's own BatchedTilesPlugin works only with WebGLRenderer.
//
// Each tile mesh becomes one geometry and one instance. The instance matrix is computed on the
// CPU in 64 bits, ECEF to the local frame (ADR 0017), so the GPU only sees world coordinates of a
// few kilometres; passing ECEF matrices would leave buildings jittering by about half a metre.
import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  type Material,
  type Mesh,
  type Object3D
} from 'three/webgpu'

import type { LocalFrame } from '../geo/localFrame'

export interface TileBatcher {
  mesh: BatchedMesh
  /** Takes over the meshes of a newly loaded tile and hides the originals. */
  add(scene: Object3D): void
  setVisible(scene: Object3D, visible: boolean): void
  remove(scene: Object3D): void
  stats(): {
    instances: number
    visible: number
    maxInstances: number
    vertexMB: number
    sampleTranslation: number[] | null
  }
}

interface Entry {
  geometryId: number
  instanceId: number
}

/** Positions and normals only, as 32-bit floats, indexed: the layout every batched geometry needs. */
function normalise(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry()
  const position = source.getAttribute('position')
  const count = position.count
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = position.getX(i)
    positions[i * 3 + 1] = position.getY(i)
    positions[i * 3 + 2] = position.getZ(i)
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const index = source.getIndex()
  if (index) {
    geometry.setIndex(new BufferAttribute(Uint32Array.from(index.array as ArrayLike<number>), 1))
  } else {
    geometry.setIndex(new BufferAttribute(Uint32Array.from({ length: count }, (_, i) => i), 1))
  }
  const normal = source.getAttribute('normal')
  if (normal) {
    const normals = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      normals[i * 3] = normal.getX(i)
      normals[i * 3 + 1] = normal.getY(i)
      normals[i * 3 + 2] = normal.getZ(i)
    }
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  } else {
    geometry.computeVertexNormals()
  }
  return geometry
}

export function createTileBatcher(frame: LocalFrame, material: Material): TileBatcher {
  // Fixed, never grown: Three.js 0.186 keeps the previous frame's instance matrices for motion
  // vectors in a texture sized when the mesh is first drawn, and growing the instance count
  // later overruns it ("RangeError: offset is out of bounds"). 8,192 instances take 0.5 MB of
  // matrices; about 2,600 tiles have been seen loaded at once.
  const maxInstances = 8192
  let maxVertices = 2_000_000
  let maxIndices = 4_000_000
  const mesh = new BatchedMesh(maxInstances, maxVertices, maxIndices, material)
  mesh.name = 'PLATEAU buildings (batched)'
  // Front-to-back order helps the early depth test; per-instance culling is on by default.
  mesh.sortObjects = true

  const entries = new Map<Object3D, Entry[]>()
  let instances = 0
  const matrix = new Matrix4()

  const ensureCapacity = (vertices: number, indices: number): boolean => {
    if (instances + 1 > maxInstances) {
      console.warn('Building batch is full; a tile is left out.')
      return false
    }
    if (mesh.unusedVertexCount < vertices || mesh.unusedIndexCount < indices) {
      mesh.optimize()
    }
    if (mesh.unusedVertexCount < vertices || mesh.unusedIndexCount < indices) {
      maxVertices = Math.ceil((maxVertices + vertices) * 1.5)
      maxIndices = Math.ceil((maxIndices + indices) * 1.5)
      mesh.setGeometrySize(maxVertices, maxIndices)
    }
    return true
  }

  return {
    mesh,
    add(scene) {
      scene.updateMatrixWorld(true)
      // The tile scene's own matrix holds the tile transform, so a mesh's matrixWorld is in
      // ECEF when the scene has no parent. If the tiles renderer has already attached the scene,
      // the parent's transform is taken back out.
      const parentInverse = scene.parent
        ? new Matrix4().copy(scene.parent.matrixWorld).invert()
        : new Matrix4()
      const list: Entry[] = []
      scene.traverse(object => {
        const tileMesh = object as Mesh
        if (!tileMesh.isMesh) return
        const geometry = normalise(tileMesh.geometry)
        if (!ensureCapacity(geometry.getAttribute('position').count, geometry.getIndex()!.count)) {
          geometry.dispose()
          return
        }
        const geometryId = mesh.addGeometry(geometry)
        const instanceId = mesh.addInstance(geometryId)
        instances++
        // ECEF, then the local frame, in 64-bit JavaScript numbers.
        matrix.multiplyMatrices(parentInverse, tileMesh.matrixWorld).premultiply(frame.ecefToWorld)
        mesh.setMatrixAt(instanceId, matrix)
        mesh.setVisibleAt(instanceId, false)
        geometry.dispose()
        // The original stays in the tile scene for the tiles renderer's bookkeeping, unseen.
        tileMesh.visible = false
        list.push({ geometryId, instanceId })
      })
      entries.set(scene, list)
    },
    setVisible(scene, visible) {
      for (const { instanceId } of entries.get(scene) ?? []) {
        mesh.setVisibleAt(instanceId, visible)
      }
    },
    remove(scene) {
      for (const { geometryId, instanceId } of entries.get(scene) ?? []) {
        mesh.deleteInstance(instanceId)
        mesh.deleteGeometry(geometryId)
        instances--
      }
      entries.delete(scene)
    },
    stats() {
      let visible = 0
      let sampleTranslation: number[] | null = null
      for (const list of entries.values()) {
        for (const { instanceId } of list) {
          if (mesh.getVisibleAt(instanceId)) {
            visible++
            if (!sampleTranslation) {
              mesh.getMatrixAt(instanceId, matrix)
              sampleTranslation = [matrix.elements[12], matrix.elements[13], matrix.elements[14]].map(Math.round)
            }
          }
        }
      }
      return {
        instances,
        visible,
        maxInstances,
        vertexMB: Math.round((maxVertices * 24 + maxIndices * 4) / 1e6),
        sampleTranslation
      }
    }
  }
}
