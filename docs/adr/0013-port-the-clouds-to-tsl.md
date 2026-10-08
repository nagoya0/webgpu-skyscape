# 13. Port the volumetric clouds to TSL ourselves

- Status: Accepted; the port is to WGSL, not TSL ([0022](0022-heavy-shaders-in-wgsl.md)), and the
  stages are replaced by steps C1 to C5 (update 2026-10-06 below)
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
- **Upstream.** The last commit to the upstream repository is from 2026-05-27, and the pull
  request for three r185 (#118), opened on 2026-10-02, is not merged. There is no date for
  WebGPU clouds to plan around; the module stays replaceable, but we build the clouds ourselves.
- **Shader language.** TSL has no formal language specification; how its operators and type
  conversions behave is defined by its implementation, and this project has already hit two TSL
  changes between releases. Writing the heavy shader code in WGSL
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

## Update 2026-10-06: stages

The four stages in the decision above were replaced by steps C1 to C5, agreed with the
maintainer when the cloud stage started and listed in [ideas](../ideas.md): shape and detail
noise and the weather map first (C1), then temporal accumulation and half resolution (C2). The
reason given above for putting
temporal reprojection second, speed on integrated GPUs, no longer applies: integrated GPUs are
not targeted ([ADR 0025](0025-target-hardware.md)).

This file keeps its name, which still says TSL, so that existing links keep working.

## Update 2026-10-07: steps C1 to C4 and light shafts done

Done between 2026-10-06 and 2026-10-07; the details per feature are in
[docs/clouds-parity.md](../clouds-parity.md).

- C2 uses takram's temporal upscaling: a quarter of the resolution in each direction, filled in
  over 16 frames, instead of the half resolution first planned. The clouds' GPU time fell from
  about 2.6 ms to about 0.3 ms. A still frame shows single-sample dots at the cloud edges; the
  maintainer judged it acceptable at 60 fps, so takram's method stays.
  Update 2026-10-08: at dusk the same dots stand out as dark dots in a 4-pixel grid, as clouds
  in silhouette against a bright sky give the largest difference. Each frame they are the pixels
  just rendered, one per 4 × 4 block, differing from their accumulated neighbours; the same with
  takram's own blue noise, so it is takram's method, not this project's noise. Tried: a
  Catmull-Rom history lookup (more speckle elsewhere), blending the new pixel half and half with
  the history (fine by day, a faint fixed grid at dusk), and no upscaling (no dots, but about
  1.4 ms more GPU at 1262 × 600, several times that on the target hardware). The maintainer
  accepted the dots at dusk too, as the same trade-off.- C3: aerial perspective on the clouds, haze, and sun and sky light by height.
- C4: takram's cascaded shadow maps, for the clouds' long-range self-shadowing and for cloud
  shadows on the scene. The scene receives them through the sun light's custom shadow node, so
  only direct sunlight is dimmed, and building shadows can be combined there later. The
  maintainer chose to do the cloud shadows before the building shadows.
- Light shafts (`SHADOW_LENGTH`), which the maintainer requires.
- The haze stops at the top of the low clouds instead of the top of all layers: flown above the
  low clouds, takram's ceiling drew a grey band above the horizon. Agreed with the maintainer.
- A value that is not a finite number is dropped in the temporal resolve; one had spread through
  the history until the screen went black when flying into a cloud.

The maintainer then judged the clouds good enough for now and put the ground's quality before
the remaining cloud features.
