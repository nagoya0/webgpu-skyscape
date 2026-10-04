# 19. No UI until the features are in; settings come from the URL

- Status: Accepted
- Date: 2026-10-05

## Context

The third task added a time-of-day slider. The maintainer does not want prototype UI to become
the base of the final UI, and will design the UI once the features are in.

## Decision

- No on-screen controls until the features are in. The time-of-day slider is removed.
- Until then, settings are given as URL query parameters, read in one place
  (`src/params.ts`, which lists them). Malformed or out-of-range values fall back to the
  defaults.
- The guidance screen for browsers without WebGPU is not affected: it is required by
  [ADR 0003](0003-webgpu-only.md).

## Consequences

Comparing settings means editing the URL and reloading. The same URLs serve the headless checks
in [docs/upgrading.md](../upgrading.md), so a view can be reproduced exactly.
