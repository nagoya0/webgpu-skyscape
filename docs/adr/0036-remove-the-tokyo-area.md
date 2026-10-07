# 36. Remove the Tokyo area and its buildings

- Status: Accepted
- Date: 2026-10-08
- Supersedes [ADR 0024](0024-untextured-buildings-with-procedural-facades.md) and
  [ADR 0027](0027-batched-building-tiles.md); ends the Tokyo area kept by
  [ADR 0028](0028-area-sagami-bay-hakone-fuji.md)

## Context

Since [ADR 0028](0028-area-sagami-bay-hakone-fuji.md) the demo flies over Sagami Bay, Hakone and
Mount Fuji, and central Tokyo with the PLATEAU buildings stayed selectable with `?area=tokyo`.
The course is now flown with JSBSim ([ADR 0035](0035-the-course.md)), and the maintainer judged
the features complete enough to start the UI and prepare the demo for publishing.

The maintainer's view (2026-10-08): central Tokyo, where PLATEAU's buildings are dense, is hard
to raise to the quality of the rest. ADR 0028 recorded why: the buildings carry procedural
facades because PLATEAU's textures do not fit in memory, low flight shows that they are
procedural, and buildings change their detail and disappear and reappear along the course. A
mountain area such as Okutama would suit the demo better, as it needs no buildings.

## Decision

Proposed by Claude, not objected to by the maintainer:

- **The Tokyo area is removed with its code**: the PLATEAU buildings and their loading, the
  procedural facades, the batched drawing, the flat placeholder ground used beyond Tokyo's
  terrain, and the placeholder racetrack flown there and with `?path=racetrack`.
- **The area structure stays** (`src/areas.ts`: origin, terrain extent, default path, magnetic
  declination), now with the one area, so that another area can be added later. A mountain area
  such as Okutama is noted as an idea, not planned.
- **No area setting** in the coming UI while there is one area (the maintainer).

## Consequences

- The URL parameters `area`, `buildings`, `textures`, `draw`, `tileerror`, `speed`, `altitude`,
  `bank` and `rollrate` are gone.
- The `3d-tiles-renderer` package and the Draco decoder (`public/draco/`) are no longer needed and
  are removed; so is the PLATEAU credit.
- The placeholder racetrack's seam fault goes with it.
- `experiments/cloud-trial`, the trial behind [ADR 0022](0022-heavy-shaders-in-wgsl.md), used the
  racetrack and the placeholder ground and is removed; it stays in the history.
- ADRs about Tokyo and its buildings ([0023](0023-area-central-tokyo.md),
  [0024](0024-untextured-buildings-with-procedural-facades.md),
  [0027](0027-batched-building-tiles.md)) stay as the record of what was tried.
