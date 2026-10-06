# 23. The area is central Tokyo

- Status: Superseded by [0028](0028-area-sagami-bay-hakone-fuji.md)
- Date: 2026-10-05

## Context

[ADR 0006](0006-fixed-area-tiled-detail.md) left the area open until PLATEAU's coverage was
checked. Checked on 2026-10-05 against PLATEAU's dataset catalogue: 247 of 306 cities have
textured LOD2 buildings in 3D Tiles and 18 have LOD3, so building data does not narrow the
choice much. Candidates looked at: Tokyo Bay and central Tokyo; Mount Fuji and Suruga Bay
(Numazu, Fuji, Shizuoka); Hiroshima and the Seto Inland Sea; the Kofu basin.

The maintainer chose central Tokyo, for two reasons:

- The aircraft flies low ([ADR 0018](0018-f16-at-cruise-speed.md)), where buildings show best.
- Where there are no buildings, the ground is only terrain and aerial photographs and looks
  bare; it would need vegetation such as forests to be made. Vegetation is wanted in Tokyo too.

## Decision

The area is central Tokyo. The exact course and bounds are not decided yet
([ideas](../ideas.md)).

PLATEAU data available in the central wards, besides buildings (textured LOD2; LOD3 in Minato,
Taito, Sumida, Yokohama and Kawasaki):

- vegetation models, up to LOD3 with textures, in Chiyoda, Chuo, Shinjuku, Shibuya, Minato,
  Taito, Sumida, Koto and Yokohama;
- land use for almost every ward;
- city furniture (LOD3), roads (up to LOD3), bridges and water bodies.

## Consequences

- Vegetation comes in two layers: PLATEAU vegetation models where they exist, and trees
  instanced on land-use areas such as parks and forests elsewhere. This replaces the idea in
  ADR 0006 of placing vegetation by the colour of the aerial photographs.
- City furniture may give street lamp positions for the night scenes, if lamps are in the data.
- The terrain is mostly flat, so terrain detail matters less than building and vegetation
  detail.
- Textured LOD2 buildings are 100 to 900 MB per ward, so only the strip along the course is
  prepared in detail ([ADR 0018](0018-f16-at-cruise-speed.md)).

Update 2026-10-06: the buildings are untextured with procedural facades
([ADR 0024](0024-untextured-buildings-with-procedural-facades.md)), streamed from PLATEAU for
eight wards (Shinjuku, Shibuya, Minato, Chiyoda, Chuo, Taito, Sumida, Koto). The maintainer kept
the proposed course as the target and chose to load more wards rather than shrink it. Detail
follows the camera through the tiles' levels of detail rather than a prepared strip.
