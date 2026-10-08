# 40. Publish on GitHub Pages

- Status: Accepted
- Date: 2026-10-08

## Context

The demo is static: one page, its scripts and about 9 MB of data. The terrain and the aerial
photographs come from the GSI's servers at run time, so the host only serves the demo itself.
No special HTTP headers are needed. The candidates were GitHub Pages and Cloudflare (Pages, or
Workers with static assets, which Cloudflare now recommends for new projects).

Before publishing, the load on the GSI and on viewers was measured over two laps from an empty
cache (2026-10-08): about 7,500 requests and 150 MB in the first lap (4,200 tiles and 3,200
answers of 404 for photographs that do not exist; about 50 MB in the first minute), and nothing
after it once missing aerial photographs were remembered: the tiles that
exist come from the browser's disk cache, as the GSI sends a Last-Modified date.

## Decision

- The demo is published on GitHub Pages (the maintainer, 2026-10-08): the repository and the
  header's link are already on GitHub, it needs no other account, and a personal demo stays well
  within its limits (1 GB per site, a soft limit of 100 GB a month).
- Publishing goes ahead with the GSI tiles loaded at run time, as the cache works (the maintainer,
  2026-10-08). The loading screen tells viewers, in Japanese, that the demo downloads 50 to 150 MB,
  so that they can avoid a mobile connection.

## Implementation details, not discussed

- `.github/workflows/pages.yml` builds and deploys on every push to `main`, after the unit tests.
- `vite.config.ts` sets `base: './'`, so the build works under `/webgpu-skyscape/` and anywhere
  else.