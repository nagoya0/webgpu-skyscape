# 12. The site and the tile data are hosted apart

- Status: Accepted
- Date: 2026-10-03

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
