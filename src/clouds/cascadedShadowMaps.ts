// Cascaded shadow maps for the clouds: the view frustum is split by distance, and each part gets
// an orthographic view from the sun. Port of CascadedShadowMaps, FrustumCorners and
// splitFrustum from @takram/three-clouds 0.7.6 (src/CascadedShadowMaps.ts, src/helpers/), MIT,
// Copyright (c) 2024 Shota Matsuda, which are based on https://github.com/StrandedKitty/three-csm/
// and three.js examples/jsm/csm:
//
//   MIT License, Copyright (c) 2019 vtHawk
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this
//   software and associated documentation files (the "Software"), to deal in the Software
//   without restriction, including without limitation the rights to use, copy, modify, merge,
//   publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
//   to whom the Software is furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all copies or
//   substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
//   INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
//   PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
//   FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//   DEALINGS IN THE SOFTWARE.
//
// Changes: the frustum corners come from the camera's field of view and aspect rather than its
// inverse projection matrix, which under reversed Z (ADR 0015) maps depth differently; the
// matrices use the WebGL clip convention (z from -1 to 1), as the shaders that read them expect.
import { Box3, Matrix4, Object3D, Vector2, Vector3, type PerspectiveCamera } from 'three/webgpu'

export interface Cascade {
  /** Start and end of the cascade as fractions of `far`. */
  readonly interval: Vector2
  /** World to the cascade's clip space. */
  readonly matrix: Matrix4
  readonly inverseMatrix: Matrix4
  readonly projectionMatrix: Matrix4
  readonly viewMatrix: Matrix4
  readonly inverseViewMatrix: Matrix4
}

/** takram's "practical" split: uniform and logarithmic splits mixed by lambda (GPU Gems 3, 10). */
export function practicalSplits(count: number, near: number, far: number, lambda: number): number[] {
  const splits: number[] = []
  for (let i = 0; i < count; i++) {
    const uniform = (near + ((far - near) * (i + 1)) / count) / far
    const logarithmic = (near * (far / near) ** ((i + 1) / count)) / far
    splits.push(uniform + (logarithmic - uniform) * lambda)
  }
  return splits
}

interface Corners {
  near: Vector3[]
  far: Vector3[]
}

const newCorners = (): Corners => ({
  near: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
  far: [new Vector3(), new Vector3(), new Vector3(), new Vector3()]
})

/** View-space corners of the camera frustum from `camera.near` to `far`. */
function frustumCorners(camera: PerspectiveCamera, far: number, result: Corners): Corners {
  const tan = Math.tan((camera.fov * Math.PI) / 360) / camera.zoom
  const signs = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1]
  ]
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = signs[i]
    for (const [corner, d] of [
      [result.near[i], camera.near],
      [result.far[i], far]
    ] as const) {
      corner.set(sx * tan * camera.aspect * d, sy * tan * d, -d)
    }
  }
  return result
}

export class CascadedShadowMaps {
  readonly cascades: Cascade[] = []
  far = 0

  private readonly frustum = newCorners()
  private readonly parts: Corners[] = []
  private readonly part = newCorners()
  private readonly box = new Box3()
  private readonly lightOrientation = new Matrix4()
  private readonly cameraToLight = new Matrix4()
  private readonly center = new Vector3()
  private readonly position = new Vector3()
  private readonly direction = new Vector3()

  constructor(
    readonly cascadeCount: number,
    readonly mapSize: number,
    /** Shadows reach no further than this from the camera. */
    readonly maxFar: number,
    readonly splitLambda = 0.6,
    readonly fade = true
  ) {
    for (let i = 0; i < cascadeCount; i++) {
      this.cascades.push({
        interval: new Vector2(),
        matrix: new Matrix4(),
        inverseMatrix: new Matrix4(),
        projectionMatrix: new Matrix4(),
        viewMatrix: new Matrix4(),
        inverseViewMatrix: new Matrix4()
      })
      this.parts.push(newCorners())
    }
  }

  /**
   * @param sunDirection towards the sun, in world space
   * @param distance from the cascade centres to the light's position, along the sun direction
   */
  update(camera: PerspectiveCamera, sunDirection: Vector3, distance = 1): void {
    this.far = Math.min(this.maxFar, camera.far)
    const splits = practicalSplits(this.cascadeCount, camera.near, this.far, this.splitLambda)
    frustumCorners(camera, this.far, this.frustum)
    for (let i = 0; i < this.cascadeCount; i++) {
      const from = i === 0 ? null : splits[i - 1]
      const to = i === this.cascadeCount - 1 ? null : splits[i]
      const part = this.parts[i]
      for (let j = 0; j < 4; j++) {
        const near = this.frustum.near[j]
        const far = this.frustum.far[j]
        if (from === null) part.near[j].copy(near)
        else part.near[j].lerpVectors(near, far, from)
        if (to === null) part.far[j].copy(far)
        else part.far[j].lerpVectors(near, far, to)
      }
      this.cascades[i].interval.set(splits[i - 1] ?? 0, splits[i] ?? 0)
    }

    const lightOrientation = this.lightOrientation.lookAt(
      new Vector3(),
      this.direction.copy(sunDirection).negate(),
      Object3D.DEFAULT_UP
    )
    const cameraToLight = this.cameraToLight.copy(lightOrientation).invert().multiply(camera.matrixWorld)

    for (let i = 0; i < this.cascadeCount; i++) {
      const cascade = this.cascades[i]
      const part = this.parts[i]

      // The radius covers the longer diagonal of the part, plus the fade between cascades.
      let diagonal = Math.max(part.far[0].distanceTo(part.far[2]), part.far[0].distanceTo(part.near[2]))
      if (this.fade) {
        const fraction = -part.far[0].z / (this.far - camera.near)
        diagonal += 0.25 * fraction ** 2 * (this.far - camera.near)
      }
      const radius = diagonal / 2
      cascade.projectionMatrix.makeOrthographic(-radius, radius, radius, -radius, 0, radius * 2)

      this.box.makeEmpty()
      for (let j = 0; j < 4; j++) {
        this.box.expandByPoint(this.part.near[j].copy(part.near[j]).applyMatrix4(cameraToLight))
        this.box.expandByPoint(this.part.far[j].copy(part.far[j]).applyMatrix4(cameraToLight))
      }
      const center = this.box.getCenter(this.center)
      center.z = this.box.max.z

      // Snap the light-space translation to whole texels, so the shadows do not shimmer.
      const texel = (radius * 2) / this.mapSize
      center.x = Math.round(center.x / texel) * texel
      center.y = Math.round(center.y / texel) * texel

      center.applyMatrix4(lightOrientation)
      const position = this.position.copy(sunDirection).multiplyScalar(distance).add(center)
      cascade.inverseViewMatrix.lookAt(center, position, Object3D.DEFAULT_UP).setPosition(position)
      cascade.viewMatrix.copy(cascade.inverseViewMatrix).invert()
      cascade.matrix.multiplyMatrices(cascade.projectionMatrix, cascade.viewMatrix)
      cascade.inverseMatrix.copy(cascade.matrix).invert()
    }
  }
}
