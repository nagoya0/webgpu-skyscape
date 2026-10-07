# 6. A fixed area, made more detailed over time

- Status: Accepted; area settled by [0023](0023-area-central-tokyo.md), then
  [0028](0028-area-sagami-bay-hakone-fuji.md); tiles from the sources by
  [0026](0026-own-terrain-from-gsi-tiles.md) (updates below)
- Date: 2026-10-03
- Amended: 2026-10-08 (the Tokyo area and the PLATEAU buildings removed, [ADR 0036](0036-remove-the-tokyo-area.md))

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

## Update 2026-10-06

- The area is central Tokyo ([ADR 0023](0023-area-central-tokyo.md)).
- Vegetation is placed from PLATEAU vegetation models and land use, not from the colour of the
  aerial photographs ([ADR 0023](0023-area-central-tokyo.md)).
- The project does not produce tiles of its own so far. Terrain and photographs are loaded from
  GSI's tiles in real time ([ADR 0026](0026-own-terrain-from-gsi-tiles.md)), and buildings from
  PLATEAU's 3D Tiles, in the formats those sources publish (PNG and JPEG images, glTF with
  Draco). The tile hierarchies with levels of detail are kept. KTX2 and meshopt apply only if
  the project makes tiles of its own later.

## Update 2026-10-07

The area is now Sagami Bay, Hakone and Mount Fuji
([ADR 0028](0028-area-sagami-bay-hakone-fuji.md)). The way vegetation is placed came from the
Tokyo area (PLATEAU vegetation models) and is open again for the new area ([ideas](../ideas.md)).
