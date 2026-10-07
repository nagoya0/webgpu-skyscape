# 26. Our own terrain from GSI tiles, streamed in real time

- Status: Accepted
- Date: 2026-10-06

## Context

The ground needs the GSI elevation model and aerial photographs
([ADR 0007](0007-japanese-open-data.md)) under the PLATEAU buildings
([ADR 0024](0024-untextured-buildings-with-procedural-facades.md)).

3DTilesRendererJS has plugins for terrain from RGB-encoded elevation tiles and for draping image
tiles, but their materials change GLSL through `onBeforeCompile`, which works only with
`WebGLRenderer`. Under [ADR 0021](0021-keep-threejs-and-takram.md) (choose what works now) they
are not usable here.

GSI's terms (checked 2026-10-06 at https://maps.gsi.go.jp/development/ichiran.html and the GSI
content terms of use) allow web applications to load GSI tiles in real time with attribution and
without an application; when the data is processed, that has to be stated as well. Heavy access
or bulk downloads are to be discussed with GSI first.

## Decision

- The terrain is ours (`src/terrain/`): a quadtree of XYZ tiles in Web Mercator, the scheme GSI
  tiles use, from zoom 10 roots around the area down to zoom 17. A tile is refined while one
  texel of its photograph would cover more than 1.5 pixels, and is drawn until all four children
  are ready, so the surface has no holes while loading. Tile edges hang a skirt to hide cracks
  between levels (30 m at first; as deep as the tile is wide since 2026-10-07).
- Heights come from GSI's 5 m DEM (`dem5a_png`, zoom 15) where available, else the 10 m DEM
  (`dem_png`, up to zoom 14); missing values, mostly sea, are taken as 0 m. GSI heights are above
  the geoid, while PLATEAU and the atmosphere use the ellipsoid, so a constant geoid height of
  36.8 m is added: GSI's geoid calculator gives 36.69 m at the origin, 37.07 m at Shinjuku and
  36.83 m at Oshiage, so a constant is within 0.4 m over the area. (Since 2026-10-08, for the
  Hakone area: 40.9 m, GSI's value at its origin; 38.5 to 42.5 m along the course.)
- The surface colour is GSI's seamless aerial photograph (`seamlessphoto`), one zoom level deeper
  than the tile, stitched into a 512 × 512 texture per tile.
- Tiles are loaded from GSI in real time, at most six requests at a time. Nothing is
  downloaded in bulk or rehosted.
- The credits for GSI and PLATEAU are shown on screen, stating that the GSI data is processed.

## Consequences

- Terrain textures took about 225 MB for about 160 tiles in the first test, within the memory
  budget of [ADR 0025](0025-target-hardware.md) together with the buildings.
- The aerial photographs contain the shadows and lighting of the day they were taken, under the
  demo's own lighting.
- Small dark slivers can still show where tiles of different levels meet.
- If the demo's traffic grows, GSI's guidance on heavy access applies.

## Update 2026-10-07

- The root tiles and their extent are set per area (`src/areas.ts`). In the Hakone area
  ([ADR 0028](0028-area-sagami-bay-hakone-fuji.md)) the roots are at zoom 8 and cover 2.5°
  around the origin, out to the horizon ([ADR 0030](0030-terrain-to-the-horizon.md)); up to
  1,000 tiles are kept. At 3,000 m this loads about 170 to 185 tiles and 240 to 260 MB of
  textures, about as much as Tokyo at low altitude, since a higher camera needs less detail
  below it.
- The photographs are corrected for the haze they carry
  ([ADR 0031](0031-correct-the-sources-grade-at-the-end.md)), and water is drawn where GSI's
  data shows sea, lakes and rivers ([ADR 0029](0029-water-from-gsi-data.md)).
- Seen on the mountains: ridges drawn as straight segments by the 33 × 33 grid; dark wedges where
  tiles of different levels meet on steep slopes, deeper than the 30 m skirts; and slopes facing
  away from the sun look flat, being lit evenly by the sky only. The skirts now hang as deep as
  the tile is wide, and their back faces no longer show black (2026-10-07); the rest is on hold
  as room for improvement ([ideas](../ideas.md)).
- The land reflects light diffusely only; water keeps its specular reflection
  ([ADR 0032](0032-land-reflects-diffusely.md)).
