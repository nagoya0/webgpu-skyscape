# 17. The scene is in a local tangent-plane frame, not in ECEF

- Status: Accepted
- Date: 2026-10-04

## Context

[ADR 0008](0008-precomputed-flight-path.md) converts the flight path from latitude, longitude
and altitude to ECEF, the earth-centred coordinates that 3D Tiles and the atmosphere use. ECEF
coordinates of points on the surface are around 6.4 million metres. GPU vertex positions are
32-bit floats, which at that size can only represent steps of about 0.5 m:

| Distance from the origin | Step of a 32-bit float |
|---|---|
| 1 km | about 0.06 mm |
| 10 km | about 1 mm |
| 25 km | about 2 mm |
| 6,400 km (ECEF on the surface) | about 0.5 m |

The camera will be a few tens of centimetres from the canopy, so geometry placed in ECEF would
visibly shake. ECEF also has no fixed "up": up points away from the earth's centre and differs
from place to place, while Three.js and most game code assume that y is up.

`@takram/three-atmosphere/webgpu` lets the scene use its own frame: its `matrixWorldToECEF`
uniform maps world coordinates to ECEF. Upstream's cruising-altitude example uses this, together
with a 3D Tiles plugin (`ReorientationPlugin`) that moves the tiles into the same frame.

Names for the parts of this approach: a frame whose axes touch the earth at one point is a local
tangent plane (LTP) frame, called ENU (east, north, up) or NED (north, east, down) by axis order.
Moving the origin close to the camera to keep coordinates small is called a floating origin or
origin rebasing in games, and relative-to-center (RTC) in 3D Tiles.

Another option is Three.js `renderer.highPrecision`, which computes positions relative to the
camera in 64-bit floats on the CPU, so the scene can stay in ECEF. It solves the precision
problem but not the direction of up.

## Decision

- The world origin is a fixed point on the ground in the demo area. World axes are north (x), up
  (y) and east (z), from `Ellipsoid.getNorthUpEastFrame`, the axis order the takram packages use
  for Three.js.
- Only the axes are flat. Terrain, buildings and the flight path are computed in ECEF and moved
  into this frame by a rotation and a translation, so the curvature of the earth is kept exactly.
  Treating latitude and longitude as flat x and z would be wrong by about 50 m in height at 25 km
  and is not done.
- The flight path is stored and interpolated in ECEF as ADR 0008 says, and converted to the local
  frame for rendering.
- 3D Tiles are reoriented into the same frame when they are added.

Implemented for the sky on 2026-10-04 (`src/atmosphere/atmosphere.ts`).

## Consequences

With the area from [ADR 0018](0018-f16-at-cruise-speed.md), the aircraft stays within about
25 km of the origin, where a 32-bit float has steps of about 2 mm. The origin can stay fixed for
the whole flight; moving it with the aircraft is not needed.
