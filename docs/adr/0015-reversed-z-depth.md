# 15. Reversed-Z depth buffer

- Status: Accepted
- Date: 2026-10-03

## Context

The demo draws a canopy a few tens of centimetres from the camera and terrain tens of kilometres
away in the same frame. Every screen-space pass reads the depth buffer
([ADR 0010](0010-post-processing-pipeline.md)), so the format had to be settled before building
them. Three.js `WebGPURenderer` 0.184.0 offers two options for large depth ranges:

- **Logarithmic depth** (`logarithmicDepthBuffer`). Each fragment shader writes its own depth.
- **Reversed Z** (`reversedDepthBuffer`). A 32-bit float depth buffer with the depth range
  reversed, so precision is spread evenly over distance. Depth is still written by the
  rasteriser.

On the library side, `@takram/three-atmosphere/webgpu` checks for the reversed depth buffer where
it detects the sky (`AerialPerspectiveNode`) and has no such check for logarithmic depth. Its
depth-to-distance conversion in `@takram/three-geospatial` handles both. All of takram's WebGPU
examples, including the cruising-altitude one, use reversed Z.

Measured with [experiments/depth](../../experiments/depth/), near plane 0.1 m and far plane
1000 km, in headless Chrome on an NVIDIA (Lovelace) GPU:

| | Standard | Logarithmic | Reversed Z |
|---|---|---|---|
| Planes 1 m apart, 1 m to 100 km away | Back plane shows through from 1 km | Correct | Correct |
| Planes 0.1 % of the distance apart | Back plane shows through from 1 km | Correct | Correct |
| 200 full-screen planes, expensive shader, ms per frame | 3.6–4.0 | 18.9–19.1 | 18.7–18.9 as shipped; 3.9–4.1 with the sort fix below |

Logarithmic depth is slow in the overdraw test because a shader that writes depth turns off the
GPU's early depth test, so hidden fragments are shaded too.

Reversed Z was just as slow at first, for a different reason: Three.js r184 sorts objects by
their projected z, which runs the other way under reversed Z, so opaque objects are drawn back to
front. Three.js fixed this in r185 (mrdoob/three.js#33700), which this project cannot use yet
([ADR 0014](0014-pin-three-and-takram-versions.md)). Installing comparators with the z direction
swapped, through `setOpaqueSort` and `setTransparentSort`, brings it back to the speed of the
standard buffer.

## Decision

- Use the reversed-Z depth buffer.
- While on Three.js r184, install the swapped sort comparators (`src/render/depthSort.ts`).
  Remove them when upgrading to r185 or later.

## Consequences

Reversed Z keeps both the precision and the early depth test. Any shader code of our own that reads
depth must handle the reversed direction (1 is near, 0 is far), and the cloud port
([ADR 0013](0013-port-the-clouds-to-tsl.md)) has to follow this.

`@takram/three-atmosphere` notes a known precision issue under reversed Z in its min/max depth
levels, used by the light shafts (`EpipolarShadowLengthNode`). It matters only if light shafts are
used.

The timings come from one desktop GPU. Integrated GPUs have not been measured.
