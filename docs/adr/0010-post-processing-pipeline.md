# 10. Post-processing order, temporal anti-aliasing and quality presets

- Status: Accepted
- Date: 2026-10-03

## Context

Atmosphere, clouds, rain and lens effects are applied as passes after the scene is drawn.
Volumetric clouds are built on reprojecting earlier frames. Integrated GPUs have little memory
bandwidth.

## Decision

Post-processing uses the TSL post-processing of Three.js `WebGPURenderer`, in this order:

1. aerial perspective
2. cloud compositing
3. rain ([ADR 0011](0011-rain-driven-by-relative-wind.md))
4. bloom and lens flare
5. tone mapping

- Temporal anti-aliasing is required. The scene must write a correct velocity buffer, because the
  clouds rely on it for reprojection.
- The sun and its surroundings are rendered in HDR, so that bloom and lens flare can show sunlight
  breaking through clouds against the light.
- Ambient occlusion and clouds are processed at half resolution and upsampled. Quality presets
  are built on this to keep bandwidth low on integrated GPUs.

## Consequences

Every pass reads the depth buffer, so the depth format had to be decided early. It is reversed Z
([ADR 0015](0015-reversed-z-depth.md)).
