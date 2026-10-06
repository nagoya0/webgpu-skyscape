# 11. Rain moves with the relative wind, not with gravity

- Status: Accepted; drops in the air dropped, and the views settled by
  [ADR 0020](0020-effects-by-view.md) (2026-10-07)
- Date: 2026-10-03

## Context

When an aircraft flies through rain, the airflow from its own speed is much stronger than gravity.
Drops on the canopy are pushed backwards, not down.

## Decision

- **Drops on the canopy.** A compute shader keeps a screen-sized buffer of drops (position, radius,
  velocity). Drops move with the relative wind projected into camera space plus a little gravity,
  and nearby drops merge. When drawn, each drop refracts the scene colour along its normal, and
  the area under it is slightly blurred. Reference: the ShaderToy shader "Heartfelt", with its flow
  direction changed from gravity to the wind direction.
- **Where the drops sit depends on the view** ([ADR 0020](0020-effects-by-view.md)). In the
  first-person view the buffer covers the whole screen as a game-style shortcut, and the drops
  flow outwards radially from the direction of travel; in the cockpit view the drops sit on the
  canopy glass.
- **No drops in the air.** Streaks of rain in the air, coming from the direction of travel, were
  part of the first plan; the maintainer decided against them on 2026-10-07.
- **The drops' course through a cloud**, as the maintainer described it (2026-10-07):
  - Passing through a cloud, drops land on the screen or the canopy, and keep landing at a
    steady rate while the aircraft is in the cloud.
  - The water flows outwards or backwards, faster the faster the aircraft flies.
  - Out of the cloud, no new drops land. After flying on for a while, the drops that are left
    disappear, as if they evaporate.
- **Whether the aircraft is in a cloud** comes from the cloud density channel of the path data
  ([ADR 0008](0008-precomputed-flight-path.md)).
- On entering a cloud, the image first turns white and loses contrast.

## Consequences

The rain pass needs the relative wind direction in camera space for every frame, which the path
playback has to provide.
