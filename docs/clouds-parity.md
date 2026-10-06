# Cloud features: takram parity

The aim, set by the maintainer on 2026-10-06: reproduce as much of `@takram/three-clouds` 0.7.6 as
possible in the end, adding the main features first and checking the GPU cost before the rest
([ADR 0013](adr/0013-port-the-clouds-to-tsl.md)). The order is left to the implementer.

This table records which takram features are in, which are planned and which are on hold. Update
it whenever a cloud feature is added, changed or deferred.

Status: **done**, **partial** (in, with a difference noted), **planned** (with the step from
[ideas](ideas.md)), **on hold**, **not needed**.

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
| Wind: weather, shape and detail velocities | planned (C2) | The offsets exist but stay at 0 |
| Evolution along the surface normal | planned (C2) | |
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
| Sun and sky light per height (interpolated between layer bottom and top) | planned (C3) | Now one value for the frame, at the middle of the main layer above the camera |
| Accurate sun and sky light per sample (`ACCURATE_SUN_SKY_LIGHT`) | on hold | Costly; per-height interpolation first |
| Ground bounce (`GROUND_BOUNCE`) | on hold | |

## Marching

| takram feature | Status | Notes |
|---|---|---|
| Perspective step scaling, longer steps in empty space and far away | done | |
| Skipping between layers (`insideLayerIntervals`) | on hold | |
| Mip-level based detail reduction | on hold | |
| Maximum iterations | partial | 160; takram's high preset uses 500 |
| Spatiotemporal blue noise (STBN) for the jitter | planned (C2) | Now a hash; `@takram/three-geospatial/webgpu` has STBN |
| Temporal jitter (`TEMPORAL_JITTER`) | partial | Per-frame hash jitter |

## Temporal and resolution

| takram feature | Status | Notes |
|---|---|---|
| Separate cloud buffer (colour, transmittance) | planned (C2) | Now composited directly |
| Front depth and velocity output | planned (C2) | |
| Temporal resolve with reprojection and variance clipping (`cloudsResolve.frag`) | planned (C2) | |
| Temporal upscaling from a lower resolution (`TEMPORAL_UPSCALE`) | planned (C2) | |
| Quality presets | on hold | One target machine ([ADR 0025](adr/0025-target-hardware.md)) |

## Atmosphere and scene

| takram feature | Status | Notes |
|---|---|---|
| Aerial perspective on the clouds | planned (C3) | |
| Haze below and between the clouds (`HAZE`) | planned (C3) | |
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
