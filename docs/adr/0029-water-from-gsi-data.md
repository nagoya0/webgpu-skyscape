# 29. Water drawn where GSI's data shows sea, lakes and rivers

- Status: Accepted
- Date: 2026-10-07

## Context

In the area of [ADR 0028](0028-area-sagami-bay-hakone-fuji.md), Sagami Bay, Lake Ashi and the
rivers fill much of the image. The aerial photographs show water as a flat picture, with the
light of the day they were taken. Among the ground work, the maintainer asked for water first
(2026-10-06).

GSI's 10 m elevation model (`dem_png`) has no data over the sea, and GSI serves no file for an
elevation tile that is all sea. Lakes have heights in it (the water level), so the elevation
model alone does not find them. GSI's vector tiles (`optimal_bvmap-v1`, zoom 4 to 16, under the
same terms as the other GSI tiles, [ADR 0026](0026-own-terrain-from-gsi-tiles.md)) have a water
area layer, `WA`, with the sea, lakes, rivers and ponds as polygons.

## Decision

Proposed to the maintainer before each part was built, and agreed:

- Each terrain tile gets a water mask (128 × 128), from the 10 m elevation model's missing data
  and from the vector tiles' water areas (`src/terrain/waterMask.ts`). The 5 m elevation model
  is not used for the mask: it has gaps on land. The vector tiles are read by a small decoder of
  our own (`src/terrain/vectorTile.ts`), without adding a library.
- Where the mask is set, the terrain is drawn as water (`src/terrain/water.ts`): a dark body
  colour; small moving waves that flatten with distance while the surface gets rougher; the
  atmosphere's sky luminance in the reflected direction, weighted by Fresnel; and the sun's glint
  from the sun light's specular.
- Rivers reflect the sky like the rest of the water. The maintainer finds that more real than
  toning them down.

Implementation details, not discussed: an elevation tile that GSI does not serve counts as all
water (found while fixing patches of sea drawn as photographs); tiles without water keep the
plain photograph material; the wave model (six directional waves in WGSL) and the colour and
roughness values.

## Consequences

- With water in almost every tile (the vector tiles include rivers and ponds), the whole frame
  took about 2.7 ms of GPU at 1920 × 1080 on the development machine, as before.
- Each terrain tile loads one more GSI file, the vector tile, shared by the tiles under it.
- Clouds are not reflected in the water.
