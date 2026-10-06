# 7. Japanese open data for the ground; not Google Photorealistic 3D Tiles

- Status: Accepted
- Date: 2026-10-03

## Context

The ground needs buildings, terrain and a surface texture. Google Photorealistic 3D Tiles would
provide all three, but:

- their terms do not allow caching the data or bundling it with the demo;
- the shading of the day the photographs were taken is part of the texture. The demo lights the
  scene itself with atmospheric scattering and a changing time of day, so the ground would be lit
  twice: once in the photograph and once by the renderer.

## Decision

- Buildings: PLATEAU 3D Tiles (licence comparable to CC BY 4.0).
- Terrain: the Geospatial Information Authority of Japan (GSI) digital elevation model, 5 m and
  10 m mesh. Finer 1 m elevation models and point clouds published by local governments may be
  used later.
- Surface texture: GSI aerial photograph tiles.
- Google Photorealistic 3D Tiles are not used.

## Consequences

Every source must be credited on screen and in the README, for example "出典：国土地理院" for GSI
data. The exact wording follows each source's terms.

## Update 2026-10-07

The area is now Sagami Bay, Hakone and Mount Fuji
([ADR 0028](0028-area-sagami-bay-hakone-fuji.md)), without buildings; PLATEAU stays in use for
the Tokyo area. GSI's vector tiles are used as well, for the water areas
([ADR 0029](0029-water-from-gsi-data.md)).
