# 18. The aircraft is an F-16-class fighter at cruise speed

- Status: Accepted; area size and altitude changed by [0028](0028-area-sagami-bay-hakone-fuji.md)
- Date: 2026-10-04

## Context

The demo flies straight, turns and passes through clouds
([ADR 0002](0002-a-rendering-quality-demo.md)). The aircraft's speed sets how large the area has
to be, how far the aircraft gets from the world origin
([ADR 0017](0017-local-world-frame.md)), and how long the camera stays inside a cloud.

## Decision

The aircraft is a fighter of the F-16 class flying at cruise speed. The figures below use about
250 m/s (around Mach 0.75, 480 knots) at low to medium altitude; published cruise speeds vary.

| | Value |
|---|---|
| Distance in 2 minutes | about 30 km |
| Distance in 3 minutes | about 45 km |
| Turn radius at 30° bank (1.15 G) | about 11 km |
| Turn radius at 60° bank (2 G) | about 3.7 km |
| Turn radius at 80° bank (5.8 G) | about 1.1 km |

Turn radius is R = v² / (g tan φ), from the coordinated-turn formula in ADR 0008.

A course with straight legs and turns fits in an area of about 30 to 50 km across.

## Consequences

- **Area.** Only a strip along the flight path is built in detail: PLATEAU buildings, fine
  terrain and aerial photographs. Outside it, coarser terrain and photographs are enough. This
  follows [ADR 0006](0006-fixed-area-tiled-detail.md): a fixed area, made more detailed over
  time. Because the path is computed in advance ([ADR 0008](0008-precomputed-flight-path.md)),
  tiles ahead of the aircraft can be loaded before it gets there.
- **Precision.** With the origin in the middle of the area, the aircraft stays within about 25 km
  of it, so the origin does not need to move.
- **Load factor.** Turns at 2 to 6 G make the load factor channel of the path data (camera
  sinking, vignetting) visible.
- **Clouds.** A cumulus 1 to 2 km across is crossed in 4 to 8 seconds.
- **Canopy.** The F-16 has a one-piece bubble canopy, which suits the canopy rain of
  [ADR 0011](0011-rain-driven-by-relative-wind.md).
- **JSBSim.** JSBSim ships an F-16 model (`aircraft/f16`). Its `Systems` folder has no autopilot,
  so heading and altitude holds may have to be written for the scenario. To be checked at the
  JSBSim stage.
- **Speed.** Temporal anti-aliasing shows ghosting more easily with fast motion, and tiles have
  to stream fast enough. Both are to be checked at the cloud and terrain stages.
