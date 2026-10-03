# 14. Pin the versions of Three.js and the takram packages

- Status: Accepted
- Date: 2026-10-03

## Context

TSL changes between Three.js releases, and the WebGPU entry point of `@takram/three-atmosphere`
is marked work in progress by its author.

This has already happened. Three.js r185 changed what `struct()` returns, and
`@takram/three-atmosphere` 0.19.1 throws an error while being imported on r185 and r186. Upstream
develops and tests against Three.js 0.184.0. A fix is in an open pull request
(takram-design-engineering/three-geospatial#118, checked on 2026-10-03).

## Decision

- Pin `three`, `@types/three` and every `@takram/*` package to exact versions in `package.json`,
  without `^`.
- Use Three.js 0.184.0, the version upstream uses, with `@takram/three-atmosphere` 0.19.1.
- Upgrade on purpose: read the release notes, upgrade Three.js and the takram packages together,
  and check the demo in a browser before committing.

## Consequences

Fixes and features in newer Three.js releases are not available until the takram packages
support them.
