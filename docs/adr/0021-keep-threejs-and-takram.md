# 21. Keep Three.js and takram; choose by what works now, not long-term upkeep

- Status: Accepted
- Date: 2026-10-05

## Context

Three things changed after the stack was chosen ([ADR 0004](0004-threejs-webgpu-vite-typescript.md),
[ADR 0005](0005-atmosphere-and-clouds-from-takram.md)): the demo became WebGPU only
([ADR 0003](0003-webgpu-only.md)), the clouds have to be written by us
([ADR 0013](0013-port-the-clouds-to-tsl.md)), and the takram packages have had no commits since
2026-05-27. So the choice was looked at again.

Babylon.js 9.0 (March 2026) was the strongest alternative found. Compared on 2026-10-05, from
documentation; Babylon.js was not run:

| | Three.js + takram | Babylon.js 9.0 |
|---|---|---|
| Volumetric clouds for WebGPU | None; written by us | None; written by us |
| Atmosphere | Bruneton's precomputed tables with Hillaire's multiple scattering; aerial perspective ray marched per pixel; light shafts, moon, stars. Already running here | Official add-on using Hillaire's lookup tables, with the aerial perspective in a coarse volume texture |
| Upkeep of the atmosphere | One maintainer; last commit 2026-05-27; our patches needed for Three.js r185 and r186 | Maintained with the engine by a team |
| Shaders | TSL; WGSL through `wgslFn` | WGSL supported directly |
| 3D Tiles | 3DTilesRendererJS, whose primary target is Three.js | The same library, with a Babylon.js renderer added later |
| Large-world coordinates | Our local frame ([ADR 0017](0017-local-world-frame.md)) | Built in |
| TAA, bloom, lens flare | Available | Available |

Other implementations looked at: Three.js Sky Pro has WebGPU clouds but is paid and closed;
small WGSL cloud projects are experimental. No maintained, open WebGPU volumetric cloud
implementation was found, so the clouds are ours whichever engine is used.

The maintainer set the criterion: this project needs to produce a convincing demo now and will
not be maintained for years. What counts is whether a library works well enough today, not how
well it will be kept up.

## Decision

- Keep Three.js and `@takram/three-atmosphere`. Babylon.js's one clear advantage was upkeep,
  which by the criterion above does not count; on the atmosphere, 3D Tiles and existing work,
  the current stack is as good or better.
- The same criterion applies to later choices: prefer what works now for this demo over what
  is easier to keep up to date.

## Consequences

- Versions stay pinned ([ADR 0014](0014-pin-three-and-takram-versions.md)). Upgrades happen
  only when a needed feature or fix requires one; [docs/upgrading.md](../upgrading.md) is the
  procedure for that case, not a schedule.
- Local patches or a fork are fine whenever they are cheaper than waiting for upstream.
