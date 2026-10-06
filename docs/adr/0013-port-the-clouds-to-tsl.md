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
reading the shaders, is written when the cloud stage starts. The ray marching is mainly in
`clouds.frag` (1,003 lines), not `clouds.glsl` (190 lines) as first written here; the parts to
write anew come to an estimated 2,500 to 3,000 lines.

## Update 2026-10-05: scope and upstream

- **Scope.** The clouds are built only for what this demo needs: flying through low to medium
  cumulus along a fixed path. They are not a general library. Not having to support every
  altitude, several layer types and general use is what keeps the work small. If the result turns
  out well, it may be extracted and published later, but that is not a goal.
- **Upstream.** The upstream repository has had no commits since 2026-05-27, and the pull request
  for three r185 (#118) has been open since 2026-10-02 without response. Waiting for upstream
  WebGPU clouds is not a plan; the module stays replaceable, but we build the clouds ourselves.
- **Shader language.** The upstream author wrote on 2026-05-28 that TSL has no clear language
  specification, with operator and type conversion behaviour left to the implementation; this
  project has already hit two TSL changes between releases. Writing the heavy shader code in WGSL
  and using TSL only to connect it (`wgslFn`) may be more reliable, since this project needs no
  WebGL path ([ADR 0003](0003-webgpu-only.md)). A short trial decides this; see
  [ideas](../ideas.md).
- **Decided after the trial:** the port is to WGSL, not TSL
  ([ADR 0022](0022-heavy-shaders-in-wgsl.md)). The trial showed the porting itself to be close
  to mechanical. The main work is elsewhere: a temporal accumulation for the clouds (TAA alone
  left the clouds' sampling noise), aerial perspective on the clouds (distant clouds came out too
  dark without it), rendering at half resolution (the trial took about 5 ms per frame at
  1262 × 624 on a desktop GPU), and tuning the look.

## Update 2026-10-06: aim for takram parity

After the first port (step C1) left out light shafts, ground bounce, wind and other features to
keep the work small, the maintainer set the aim: in the end, reproduce as much of takram's clouds
as possible. The main features come first and the GPU cost is checked before adding the rest;
the order is left to the implementer. This replaces the scope limit above as the final goal; the
limit still describes the order of work.

Which takram features are done, planned or on hold is tracked in
[docs/clouds-parity.md](../clouds-parity.md), updated with every cloud change.
