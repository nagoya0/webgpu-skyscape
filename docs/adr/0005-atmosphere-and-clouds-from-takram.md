# 5. Atmosphere and clouds from takram's three-geospatial packages

- Status: Accepted; the clouds part is superseded by [0013](0013-port-the-clouds-to-tsl.md)
- Date: 2026-10-03

## Context

Physically based sky, aerial perspective and volumetric clouds are each large pieces of work.
takram's `three-geospatial` packages provide them for Three.js under the MIT licence:
`@takram/three-atmosphere` (Bruneton's precomputed atmospheric scattering) and
`@takram/three-clouds`.

## Decision

Use `@takram/three-atmosphere` for the sky, the sun, the aerial perspective and the atmospheric
lighting, and `@takram/three-clouds` for the volumetric clouds.

## Consequences

Checked on 2026-10-03:

- `@takram/three-atmosphere` 0.19.1 has a WebGPU entry point, `@takram/three-atmosphere/webgpu`,
  marked work in progress. It requires `three` 0.182 or later.
- `@takram/three-clouds` 0.7.6 has no WebGPU entry point. It is written in GLSL on the
  `postprocessing` library, which works only with `WebGLRenderer`. Upstream has a
  `webgpu/clouds` branch, last updated in April 2026, that contains only the noise textures and
  not the cloud rendering itself.

So the clouds cannot be used as decided. [ADR 0013](0013-port-the-clouds-to-tsl.md) decides how
to handle this.

Licences of the bundled assets (precomputed tables, star data, noise textures) are to be checked
when each asset is first used.
