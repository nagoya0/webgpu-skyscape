# 12. The site and the tile data are hosted apart

- Status: Accepted; tile storage not needed so far, see the update below
- Date: 2026-10-03
- Amended: 2026-10-08 (no buildings from PLATEAU any more: the Tokyo area removed, [ADR 0036](0036-remove-the-tokyo-area.md))

## Context

The code and the built site are small. The tile data for terrain, photographs and buildings is
large and grows as detail is added ([ADR 0006](0006-fixed-area-tiled-detail.md)).

## Decision

- The code and the static site are hosted on GitHub Pages or Cloudflare Pages. Which one is not
  decided yet.
- The tile data is kept in object storage such as Cloudflare R2, not in the repository.
- Attribution for every data source is shown on screen and in the README.
- Secrets such as API keys are never committed.

## Consequences

The site needs the tile data's base URL as a build setting, and the storage needs CORS settings
that allow the site's origin.

## Update 2026-10-06

No tile data is hosted by the project so far. The terrain and photographs are loaded directly
from GSI ([ADR 0026](0026-own-terrain-from-gsi-tiles.md)), and the buildings directly from
PLATEAU's distribution server, so object storage and its CORS settings are not needed for now.
The site host is still to be chosen ([ideas](../ideas.md)).

Update 2026-10-07: GSI's vector tiles, used for water ([ADR 0029](0029-water-from-gsi-data.md)),
are loaded directly from GSI too.
