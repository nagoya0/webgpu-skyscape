# 30. The terrain reaches the horizon; a sea-level sphere lies beyond it

- Status: Accepted
- Date: 2026-10-07

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

- In the Hakone area the terrain covers 2.5° around the origin, with root tiles at zoom 8
  (`src/areas.ts`).
- Beyond the terrain lies a cap of a sphere around the earth's centre, 60 m below sea level and
  6° in radius, drawn as water ([ADR 0029](0029-water-from-gsi-data.md),
  `src/terrain/seaSphere.ts`). It replaces the flat disc in this area; the terrain covers it
  wherever terrain exists.
- No fog is added to hide the terrain's end.

## Consequences

- From 9,000 m the sea and land still reach the horizon without gaps.
- The sphere cap has about 17,000 vertices, drawn in one call.
- The Tokyo area keeps the flat disc (`?area=tokyo`).
