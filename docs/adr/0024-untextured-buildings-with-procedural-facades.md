# 24. Untextured PLATEAU buildings with procedural facades

- Status: Accepted
- Date: 2026-10-06

## Context

The first test of PLATEAU's 3D Tiles (2026-10-05) streamed LOD2 buildings straight from PLATEAU
for central Tokyo ([ADR 0023](0023-area-central-tokyo.md)). The tiles are a quadtree whose
coarse levels hold only tall buildings. PLATEAU's textured tiles take about 11 to 25 MB each in
memory once their textures are decoded; even with a 1.5 GB tile cache, the cache filled with
coarse tiles before the small buildings near the camera loaded. The untextured tiles loaded
about 1,000 tiles in about 420 MB and showed the dense city.

Two ways forward were considered:

- **A.** Use the untextured tiles and draw the facades with a shader of our own.
- **B.** Download the textured tiles, convert their textures to KTX2 at a lower resolution, and
  host the result ourselves.

The maintainer chose A.

## Decision

- Buildings use PLATEAU's untextured LOD2 tiles.
- Their material is replaced when each tile loads with a shared material whose colour comes from
  a WGSL facade function ([ADR 0022](0022-heavy-shaders-in-wgsl.md)): floors and window bays laid
  out from the world position and normal, varied per building by a coarse cell of the ground
  plan; roofs without windows. The window pattern fades to an average colour where a bay is
  only a few pixels wide.
- PLATEAU's textured tiles stay available behind `?textures=1` for comparison.

## Consequences

- The same window layout can light windows at night.
- Facades are generic: a building does not look like its real self. Option B remains possible
  if this is not enough.
- The tiles are still streamed from PLATEAU's distribution service, which is run on an
  experimental basis without a guaranteed level of service. Hosting a copy
  ([ADR 0012](0012-site-and-tile-data-hosted-apart.md)) is still to be done for publication.
