# Cloud features: takram parity

The aim, set by the maintainer on 2026-10-06: reproduce as much of `@takram/three-clouds` 0.7.6 as
possible in the end, adding the main features first and checking the GPU cost before the rest
([ADR 0013](adr/0013-port-the-clouds-to-tsl.md)). The order is left to the implementer.

This table records which takram features are in, which are planned and which are on hold. Update
it whenever a cloud feature is added, changed or deferred.

Status: **done**, **partial** (in, with a difference noted), **planned** (with the step from
[ideas](ideas.md)), **on hold**, **not needed**.

Where takram has a `#ifdef` switch for a feature, the port keeps it as a preprocessor block
([ADR 0022](adr/0022-heavy-shaders-in-wgsl.md)) and lists it in `CLOUD_FEATURES` in
`src/clouds/clouds.ts`. Switches are set with `?cloudfx=` (for example `?cloudfx=-POWDER`).

| Switch | Ported | On by default |
|---|---|---|
| `SHAPE_DETAIL` | yes | yes |
| `POWDER` | yes | yes |
| `TURBULENCE` | no | |
| `ACCURATE_PHASE_FUNCTION` | no | |
| `ACCURATE_SUN_SKY_LIGHT` | no | |
| `GROUND_BOUNCE` | no | |
| `HAZE` | yes | yes |
| `SHADOW_LENGTH` | no | |
| `TEMPORAL_UPSCALE` | yes | yes |
| `TEMPORAL_PASS`, `TEMPORAL_JITTER` (shadow maps) | no | |
| `SHADOW` | no | |

## Shape and density

| takram feature | Status | Notes |
|---|---|---|
| Up to four layers, one per weather map channel | done | takram's three default layers: 750–1400 m, 1000–2200 m, 7500–8000 m |
| Local weather map | partial | Mapped to the ground plane (1 tile per 100 km) instead of takram's cube-sphere globe UV |
| Coverage, coverage filter width, weather exponent, shape-altering bias | done | |
| Shape noise (`shape.bin`, 128³) | done | |
| Shape detail noise (`shape_detail.bin`, 32³) | done | Always sampled; takram skips it by mip level |
| Turbulence (`turbulence.png`) | on hold | The texture is in `public/clouds/` |
| Density profile: linear and constant terms | done | |
| Density profile: exponential term | on hold | takram's default does not use it |
| Wind: weather, shape and detail velocities | partial | One wind vector, `?wind=E,N` in m/s, moves the weather map and the shape and detail noise together; takram has a velocity for each. Default 0, as takram. The offsets are computed from the time on the flight path, not accumulated per frame, so a given time always shows the same clouds |
| Evolution along the surface normal | done | As takram: the shape moves along the normal by 2 × 10⁴ m per weather tile of offset |
| Altitude correction for the ellipsoid | partial | One sphere touching the ellipsoid at the origin |

## Lighting

| takram feature | Status | Notes |
|---|---|---|
| Dual-lobe Henyey-Greenstein phase function | done | |
| Accurate phase function (Draine, `ACCURATE_PHASE_FUNCTION`) | on hold | Off in takram's default too |
| Multiple-scattering approximation (8 octaves) | done | |
| Optical depth to the sun, ray marched | done | 2 steps, as takram's high preset |
| Optical depth to the sun from beer shadow maps (BSM, cascaded) | planned (C4) | Long-range self-shadowing |
| Sky light with the sky gradient | done | |
| Powder effect (`POWDER`) | done | |
| Sun and sky light per height (interpolated between layer bottom and top) | done | As takram's clouds.vert: at the bottom and top of all layers straight above the camera |
| Accurate sun and sky light per sample (`ACCURATE_SUN_SKY_LIGHT`) | on hold | Costly; per-height interpolation first |
| Ground bounce (`GROUND_BOUNCE`) | on hold | |

## Marching

| takram feature | Status | Notes |
|---|---|---|
| Perspective step scaling, longer steps in empty space and far away | done | |
| Skipping between layers (`insideLayerIntervals`) | on hold | |
| Mip-level based detail reduction | on hold | |
| Maximum iterations | partial | 160; takram's high preset uses 500 |
| Spatiotemporal blue noise (STBN) for the jitter | done | `stbn` from `@takram/three-geospatial/webgpu`, indexed like takram's `getSTBN()`: cloud buffer pixel and frame modulo 64 |

## Temporal and resolution

| takram feature | Status | Notes |
|---|---|---|
| Separate cloud buffer (colour, opacity) | done | `src/clouds/cloudsNode.ts`; 32-bit floats, since the front distance goes beyond half floats |
| Front depth and velocity output | done | Velocity from last frame's view-projection in world space; takram reprojects the no-cloud case in view space for precision, which the local frame does not need |
| Temporal resolve with reprojection and variance clipping (`cloudsResolve.frag`) | done | Four neighbours, bilinear history, as takram's defaults (varianceGamma 2, temporalAlpha 0.1). Added: values that are not finite are dropped, since one NaN in the history spread until the screen went black (found 2026-10-06 when flying into a cloud) |
| Temporal upscaling from a lower resolution (`TEMPORAL_UPSCALE`) | done | Quarter resolution in each direction, filled in over 16 frames in takram's Bayer order. Off (`?cloudfx=-TEMPORAL_UPSCALE`), the clouds are marched at full resolution and blended into the history |
| Shadow length in the resolve (`SHADOW_LENGTH`) | planned (after C4) | With the light shafts |
| Quality presets | on hold | One target machine ([ADR 0025](adr/0025-target-hardware.md)) |

## Atmosphere and scene

| takram feature | Status | Notes |
|---|---|---|
| Aerial perspective on the clouds | done | `getIndirectLuminanceToPoint` from `@takram/three-atmosphere/webgpu` (takram's `GetSkyRadianceToPoint`) up to the clouds' front, applied in TSL after the WGSL march; without the shadow length |
| Haze below and between the clouds (`HAZE`) | done | takram's defaults; the shadow length is 0 until `SHADOW_LENGTH` is ported |
| Light shafts (`SHADOW_LENGTH`, epipolar shadow length in the atmosphere) | planned (after C4) | Needs the cloud shadow maps |
| Cloud shadows on the scene (terrain, buildings) | planned (C4) | May come with the building shadows |
| Shadow pass temporal resolve (`shadowResolve.frag`) | planned (C4) | |

## Not needed

| takram feature | Why |
|---|---|
| Debug views (`DEBUG_SHOW_*`) | Development aids for takram |
| Orthographic camera support (`PERSPECTIVE_CAMERA` off) | The demo uses a perspective camera only |
| React Three Fiber components | The demo does not use React |
| Procedural texture generators | The precomputed textures they produce are used directly |
