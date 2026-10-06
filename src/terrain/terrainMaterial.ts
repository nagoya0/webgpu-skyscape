// The terrain tiles' material: physical, so that the specular intensity can differ between land
// and water (water.ts). three's direct light ignores that intensity at grazing angles: its
// specular term uses a Fresnel reflectance of 1 there, whatever the intensity. Scaling the
// direct specular by the material's grazing reflectance (specularF90, which is the intensity for
// a non-metal) makes an intensity of 0 a plain Lambertian surface, as fields and forests are.
import { specularF90, vec3 } from 'three/tsl'
import { MeshPhysicalNodeMaterial, type Node, type NodeBuilder } from 'three/webgpu'

interface DirectInput {
  reflectedLight: { directDiffuse: Node<'vec3'>; directSpecular: Node<'vec3'> }
  [key: string]: unknown
}

// TYPE-BRIDGE: the lighting model's direct() is not in the type declarations.
interface LightingModel {
  direct(input: DirectInput, builder: NodeBuilder): void
}

export class TerrainMaterial extends MeshPhysicalNodeMaterial {
  override setupLightingModel(): ReturnType<MeshPhysicalNodeMaterial['setupLightingModel']> {
    const model = super.setupLightingModel()
    const lighting = model as unknown as LightingModel
    const direct = lighting.direct.bind(lighting)
    lighting.direct = (input, nodeBuilder) => {
      const specular = vec3(0).toVar()
      direct(
        { ...input, reflectedLight: { directDiffuse: input.reflectedLight.directDiffuse, directSpecular: specular } },
        nodeBuilder
      )
      ;(input.reflectedLight.directSpecular as unknown as { addAssign(value: Node): void }).addAssign(
        specular.mul(specularF90)
      )
    }
    return model
  }
}
