// The correction applied to every aerial photograph tile (wgsl/photoGrade.wgsl), shared by all
// terrain materials and set from the URL (?photodehaze=, ?photocontrast=, ?photosat=).
import { texture, uniform, wgslFn } from 'three/tsl'
import { Vector4, type Node, type Texture } from 'three/webgpu'

import photoGradeCode from './wgsl/photoGrade.wgsl?raw'

const photoGradeFn = wgslFn(photoGradeCode)

/** (dehaze, contrast, saturation, unused); (0, 1, 1) leaves the photographs unchanged. */
export const photoGrade = uniform(new Vector4(0, 1, 1, 0))

/** The graded colour of a photograph tile. */
export function gradedPhoto(map: Texture): Node<'vec3'> {
  return photoGradeFn({ color: texture(map).rgb, grade: photoGrade }) as Node<'vec3'>
}
