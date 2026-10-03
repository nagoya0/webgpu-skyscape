# 13. Port the volumetric clouds to TSL ourselves

- Status: Accepted
- Date: 2026-10-03
- Supersedes the clouds part of [ADR 0005](0005-atmosphere-and-clouds-from-takram.md)

## Context

`@takram/three-clouds` 0.7.6 works only with `WebGLRenderer`
([ADR 0005](0005-atmosphere-and-clouds-from-takram.md)). Three ways forward were considered:

1. **Write the clouds for WebGPU ourselves**, using the takram GLSL implementation as the
   reference. It is MIT-licensed, so it can be ported if its copyright notice is kept.
2. **Switch to WebGL 2** and use the existing packages as they are. This reverses
   [ADR 0003](0003-webgpu-only.md), and because `@takram/three-clouds` is built on the WebGL-only
   `postprocessing` library, the post-processing would also be tied to WebGL, against
   [ADR 0010](0010-post-processing-pipeline.md).
3. **Wait for upstream WebGPU support.** The `webgpu/clouds` branch was last updated in April
   2026, so there is no date to plan around.

Much of what the port needs already exists for WebGPU under the MIT licence:

- the `webgpu/clouds` branch has the cloud shape, shape detail, local weather and turbulence
  textures as TSL nodes;
- `@takram/three-geospatial/webgpu` has temporal anti-aliasing, cascaded shadow maps, STBN noise
  and lens flare nodes;
- `@takram/three-atmosphere/webgpu` provides the transmittance and irradiance tables the clouds
  need for lighting.

What remains to write is mainly the ray marching (`clouds.glsl`) and its connection to the
atmosphere.

## Decision

Port the takram volumetric clouds to TSL ourselves (option 1).

- Ported files keep takram's copyright notice, and the README credits the original.
- The clouds are a separate module: it takes the atmosphere tables and the depth buffer and
  returns cloud colour and transmittance. If upstream releases WebGPU clouds later, the module
  can be replaced with theirs.
- Build it in stages:
  1. simple ray-marched clouds;
  2. temporal reprojection, together with temporal anti-aliasing and the velocity buffer;
  3. shape and detail noise and the weather map;
  4. cloud shadows.

  Temporal reprojection comes second because the clouds are designed to depend on it
  ([ADR 0010](0010-post-processing-pipeline.md)), and ray marching without it is too slow on
  integrated GPUs to tune the look.

## Consequences

The clouds become the largest piece of work in the project. A detailed porting plan, based on
reading `clouds.glsl`, is written when the cloud stage starts.
