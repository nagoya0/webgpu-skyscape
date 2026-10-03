# 6. A fixed area, made more detailed over time

- Status: Accepted
- Date: 2026-10-03

## Context

The demo covers one area. As the project goes on, it can either cover more ground or show the same
ground in more detail. The project's aim is rendering quality
([ADR 0002](0002-a-rendering-quality-demo.md)), so detail matters more than coverage.

## Decision

- The area is fixed. Which area is not decided yet; it depends on the level of detail and
  textures available in PLATEAU ([ADR 0007](0007-japanese-open-data.md)).
- Terrain, aerial photographs and buildings are all handled as tile hierarchies with levels of
  detail. Adding detail later means adding deeper levels, not changing the structure.
- Textures are compressed as KTX2 (Basis Universal). Meshes are compressed with meshopt or Draco.
- Detail can also be added without more data: detail textures, normal maps generated from the
  elevation model, and vegetation instanced from the colour of the aerial photographs.

## Consequences

The data pipeline has to produce tiles from the start, even while the area is small enough to load
at once.
