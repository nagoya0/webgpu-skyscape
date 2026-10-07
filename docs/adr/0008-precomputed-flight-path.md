# 8. Play back a flight path computed in advance

- Status: Accepted
- Date: 2026-10-03
- Amended: 2026-10-07 (the cloud density is not part of the path)

## Context

To compare rendering quality between versions and to measure frame rates, every run has to show
the same frames. A flight computed live would differ from run to run.

## Decision

The flight path is computed offline with JSBSim (the Python package, `pip install jsbsim`) from an
autopilot scenario, and the result is bundled with the demo as JSON or a binary `Float32Array`.
JSBSim itself is LGPL-2.1 and is not bundled.

Until the JSBSim path exists, a spline path stands in for it, with the bank angle of a
coordinated turn computed as φ = atan(v² / (gR)).

Channels in the path data:

| Channel | Used for |
|---|---|
| Time, latitude, longitude, altitude, attitude quaternion | Position and attitude |
| Load factor (G) | Camera sinking under load; vignetting (cockpit view only, [ADR 0020](0020-effects-by-view.md)); shake in turns |

Playback:

- Position is interpolated with Catmull-Rom splines, attitude with slerp (squad if needed).
- Latitude, longitude and altitude are converted to ECEF, the coordinate system used by 3D Tiles
  and the atmosphere.
- G is interpolated linearly.

The cloud density at the aircraft is not part of the path. It was planned as a channel sampled
offline; since cloud step C5 it is computed at playback from the clouds themselves, so it follows
the cloud settings in the URL, and the path does not have to be computed again when the clouds
change (agreed with the maintainer, 2026-10-07).

## Consequences

The path does not depend on the cloud settings.
