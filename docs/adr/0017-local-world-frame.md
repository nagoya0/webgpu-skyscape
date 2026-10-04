# 17. The scene is in a local frame on the ground, not in ECEF

- Status: Proposed
- Date: 2026-10-04

## Context

[ADR 0008](0008-precomputed-flight-path.md) converts the flight path from latitude, longitude
and altitude to ECEF, the earth-centred coordinates that 3D Tiles and the atmosphere use. ECEF
coordinates are around 6.4 million metres. GPU vertex positions are 32-bit floats, which at that
size can only represent steps of about 0.5 m. The camera will be a few tens of centimetres from
the canopy, so geometry near the camera placed in ECEF would visibly shake.

`@takram/three-atmosphere/webgpu` supports moving the world instead: its `matrixWorldToECEF`
uniform maps the scene's world coordinates to ECEF, so the scene can be built around a local
origin. Upstream's cruising-altitude example does this, together with a 3D Tiles plugin
(`ReorientationPlugin`) that moves the tiles into the same local frame.

## Decision

- The world origin is a fixed point on the ground in the demo area. World axes are north (x), up
  (y) and east (z), from `Ellipsoid.getNorthUpEastFrame`.
- The flight path is still stored and interpolated in ECEF as ADR 0008 says, and converted to the
  local frame for rendering.
- 3D Tiles are reoriented into the same frame when they are added.

Implemented for the sky on 2026-10-04 (`src/atmosphere/atmosphere.ts`).

## Consequences

The origin stays fixed for the whole flight. If the area grows large enough that 32-bit
precision near the camera suffers far from the origin, the origin has to move with the aircraft,
as in upstream's example.
