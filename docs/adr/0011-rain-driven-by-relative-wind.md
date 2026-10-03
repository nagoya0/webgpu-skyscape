# 11. Rain moves with the relative wind, not with gravity

- Status: Accepted
- Date: 2026-10-03

## Context

When an aircraft flies through rain, the airflow from its own speed is much stronger than gravity.
Drops on the canopy are pushed backwards, and drops in the air come towards the viewer from the
direction of travel, not from above.

## Decision

- **Drops on the canopy.** A compute shader keeps a screen-sized buffer of drops (position, radius,
  velocity). Drops move with the relative wind projected into camera space plus a little gravity,
  and nearby drops merge. When drawn, each drop refracts the scene colour along its normal, and
  the area under it is slightly blurred. Reference: the ShaderToy shader "Heartfelt", with its flow
  direction changed from gravity to the wind direction.
- **Drops in the air.** Particles stretched along the relative velocity. They appear as streaks
  coming radially from the vanishing point of the direction of travel.
- **Strength** comes from the cloud density channel of the path data
  ([ADR 0008](0008-precomputed-flight-path.md)).
- **Order of effects.** On entering a cloud, the image first turns white and loses contrast. The
  main moment to show is the few seconds just after leaving a cloud, when the remaining drops are
  blown off the canopy.

## Consequences

The rain pass needs the relative wind direction in camera space for every frame, which the path
playback has to provide.
