# 4. Three.js WebGPURenderer and TSL, built with Vite and TypeScript

- Status: Accepted; the shader language is partly superseded by [0022](0022-heavy-shaders-in-wgsl.md)
- Date: 2026-10-03
- Amended: 2026-10-08 (3DTilesRendererJS removed with the PLATEAU buildings, [ADR 0036](0036-remove-the-tokyo-area.md))

## Context

The renderer has to run on WebGPU ([ADR 0003](0003-webgpu-only.md)) and work with the libraries
chosen for the atmosphere, the clouds and 3D Tiles
([ADR 0005](0005-atmosphere-and-clouds-from-takram.md),
[ADR 0007](0007-japanese-open-data.md)), which are all built on Three.js.

## Decision

- Rendering: Three.js `WebGPURenderer`. Shaders and post-processing are written in TSL, the
  Three.js node-based shading language.
- 3D Tiles: 3DTilesRendererJS (NASA-AMMOS, Apache-2.0).
- Build: Vite and TypeScript, with pnpm as the package manager.

## Consequences

The Three.js WebGPU and TSL APIs still change between releases. Version upgrades need to be done
deliberately and checked against the release notes.

## Update 2026-10-06

- Heavy shader code is written in WGSL, and TSL only connects it
  ([ADR 0022](0022-heavy-shaders-in-wgsl.md)).
- 3DTilesRendererJS is used for the PLATEAU buildings only. Its terrain and image-draping
  plugins work only with `WebGLRenderer`, so the terrain is our own
  ([ADR 0026](0026-own-terrain-from-gsi-tiles.md)).
