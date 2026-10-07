# 30. The terrain reaches the horizon; a sea-level sphere lies beyond it

- Status: Accepted
- Date: 2026-10-07
- Amended: 2026-10-08 (the flat disc removed with the Tokyo area, [ADR 0036](0036-remove-the-tokyo-area.md))

## Context

Flown at 3,000 m ([ADR 0028](0028-area-sagami-bay-hakone-fuji.md)), the horizon is about 200 km
away. In the first Hakone trial the terrain covered 1.5° around the origin (about 135 km), and a
line of dark specks showed along the horizon where it ended. The flat placeholder disc beyond
the terrain lies on the origin's tangent plane; past about 25 km the curving sea drops below it,
so the disc hid the sea.

The maintainer asked whether to extend the terrain properly or hide its end in fog, as games
often do. The answer given: extend the terrain. Distant tiles are coarse, so the cost is small
(from 1.5° to 2.5°, 48 more tiles and 67 MB more textures at 3,000 m); the far mountains and
coasts are worth seeing on a clear day; and the physical aerial perspective already fades
them. A fog strong enough to hide the terrain's end would take away the clear view, and the
saving it would bring is not needed. The maintainer agreed.

## Decision

Proposed to the maintainer and agreed:

- The terrain reaches the horizon: in the Hakone area it covers 2.5° around the origin, with
  root tiles at zoom 8 (`src/areas.ts`).
- Beyond the terrain lies a sphere at sea level following the earth's curvature, a little below
  the sea and drawn like the water ([ADR 0029](0029-water-from-gsi-data.md),
  `src/terrain/seaSphere.ts`). It replaces the flat disc in this area; the terrain covers it
  wherever terrain exists.
- No fog is added to hide the terrain's end.

Implementation details, not discussed: the sphere is a cap 6° in radius, 60 m below sea level,
divided into 256 × 64 segments.

## Consequences

- From 9,000 m the sea and land still reach the horizon without gaps.
- The sphere cap has about 17,000 vertices, drawn in one call.
- The Tokyo area keeps the flat disc (`?area=tokyo`).
