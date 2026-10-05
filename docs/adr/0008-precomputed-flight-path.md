# 8. Play back a flight path computed in advance

- Status: Accepted
- Date: 2026-10-03

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
| Cloud density, sampled offline at the aircraft's position | Rain strength; entering and leaving clouds |
| Load factor (G) | Camera sinking under load; vignetting (cockpit view only, [ADR 0020](0020-effects-by-view.md)); shake in turns |

Playback:

- Position is interpolated with Catmull-Rom splines, attitude with slerp (squad if needed).
- Latitude, longitude and altitude are converted to ECEF, the coordinate system used by 3D Tiles
  and the atmosphere.
- Cloud density and G are interpolated linearly.

## Consequences

Cloud density is sampled offline, so the path data and the cloud settings have to come from the
same cloud configuration. Changing the clouds means sampling the path again.
