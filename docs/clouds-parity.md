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

"takram's default" is takram's default quality preset (`qualityPresets.ts`, the same as its high
preset). Until 2026-10-06 this table did not say that `TURBULENCE`, `ACCURATE_SUN_SKY_LIGHT`,
`GROUND_BOUNCE` and `SHADOW_LENGTH` are on in takram's default; of these, `SHADOW_LENGTH` is now
ported, and the other three are the switches still missing for the default look.

| Switch | Ported | On by default here | takram's default |
|---|---|---|---|
| `SHAPE_DETAIL` | yes | yes | on |
| `POWDER` | yes | yes | on |
| `TURBULENCE` | no | | on |
| `ACCURATE_PHASE_FUNCTION` | no | | off |
| `ACCURATE_SUN_SKY_LIGHT` | no | | on |
| `GROUND_BOUNCE` | no | | on |
| `HAZE` | yes | yes | on |
| `SHADOW_LENGTH` (light shafts) | yes | yes | on |
| `TEMPORAL_UPSCALE` | yes | yes | on |
| `TEMPORAL_PASS`, `TEMPORAL_JITTER` (shadow maps) | yes | yes | on |
| `SHADOW` | not needed | | Marks takram's shared shader code as built for the shadow pass; here the shadow march is its own WGSL function |

## Shape and density

| takram feature | Status | Notes |
|---|---|---|
| Up to four layers, one per weather map channel | done | takram's three default layers: 750–1400 m, 1000–2200 m, 7500–8000 m |
| Local weather map | partial | Mapped to the ground plane (1 tile per 100 km) instead of takram's cube-sphere globe UV |
| Coverage, coverage filter width, weather exponent, shape-altering bias | done | |
| Shape noise (`shape.bin`, 128³) | done | |
| Shape detail noise (`shape_detail.bin`, 32³) | done | Always sampled; takram skips it by mip level |
| Turbulence (`turbulence.png`) | on hold | On in takram's default. The texture is in `public/clouds/` |
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
| Optical depth to the sun from beer shadow maps (BSM, cascaded) | done | Long-range self-shadowing beyond the marched sun ray, with takram's filter when the sun is low (8 samples, up to 6 texels) |
| Sky light with the sky gradient | done | |
| Powder effect (`POWDER`) | done | |
| Sun and sky light per height (interpolated between layer bottom and top) | done | As takram's clouds.vert: at the bottom and top of all layers straight above the camera |
| Accurate sun and sky light per sample (`ACCURATE_SUN_SKY_LIGHT`) | on hold | On in takram's default (off in its low and medium presets). Costly; per-height interpolation is in |
| Ground bounce (`GROUND_BOUNCE`) | on hold | On in takram's default (3 steps towards the ground) |

## Marching

| takram feature | Status | Notes |
|---|---|---|
| Perspective step scaling, longer steps in empty space and far away | done | |
| Skipping between layers (`insideLayerIntervals`) | on hold | |
| Mip-level based detail reduction | on hold | |
| Maximum iterations and distance | partial | 160 steps up to 80 km; takram's default is 500 steps up to 200 km |
| Spatiotemporal blue noise (STBN) for the jitter | done | `stbn` from `@takram/three-geospatial/webgpu`, indexed like takram's `getSTBN()`: cloud buffer pixel and frame modulo 64 |

## Temporal and resolution

| takram feature | Status | Notes |
|---|---|---|
| Separate cloud buffer (colour, opacity) | done | `src/clouds/cloudsNode.ts`; 32-bit floats, since the front distance goes beyond half floats |
| Front depth and velocity output | done | Velocity from last frame's view-projection in world space; takram reprojects the no-cloud case in view space for precision, which the local frame does not need |
| Temporal resolve with reprojection and variance clipping (`cloudsResolve.frag`) | done | Four neighbours, bilinear history, as takram's defaults (varianceGamma 2, temporalAlpha 0.1). Added: values that are not finite are dropped, since one NaN in the history spread until the screen went black (found 2026-10-06 when flying into a cloud) |
| Temporal upscaling from a lower resolution (`TEMPORAL_UPSCALE`) | done | Quarter resolution in each direction, filled in over 16 frames in takram's Bayer order. Off (`?cloudfx=-TEMPORAL_UPSCALE`), the clouds are marched at full resolution and blended into the history |
| Shadow length in the resolve (`SHADOW_LENGTH`) | done | Resolved with the colour, as takram |
| Quality presets | on hold | One target machine ([ADR 0025](adr/0025-target-hardware.md)) |

## Atmosphere and scene

| takram feature | Status | Notes |
|---|---|---|
| Aerial perspective on the clouds | done | `getIndirectLuminanceToPoint` from `@takram/three-atmosphere/webgpu` (takram's `GetSkyRadianceToPoint`) up to the clouds' front, applied in TSL after the WGSL march; without the shadow length |
| Haze below and between the clouds (`HAZE`) | partial | takram's defaults, with the shadow length. Difference (agreed with the maintainer, 2026-10-06): the haze reaches up to the top of the low, shadow-casting layers (2,200 m) instead of the top of all layers (8,000 m, the thin high layer). Flown above the low clouds, takram's ceiling put hundreds of kilometres of haze in front of a level view and drew a grey band above the horizon. Above the haze, the haze ray starts where it enters it, and the density is taken at that height rather than the camera's |
| Light shafts (`SHADOW_LENGTH`: the length of the view ray in cloud shadow) | partial | Marched through the shadow maps as takram's `marchShadowLength` (50 m steps growing by 1.01, up to 500 steps and 200 km), and passed to the scene's aerial perspective, the clouds' aerial perspective and the haze. Difference: `@takram/three-atmosphere/webgpu` takes the shadow as one stretch, (length, start), where takram's WebGL atmosphere takes a length only; the stretch is centred on the average position of the shadowed samples. About 0.35 ms of GPU at 1920 × 1080. The cloud pass now writes 48 bytes per pixel, so the device needs `maxColorAttachmentBytesPerSample` of 48 (`src/gpu/support.ts`) |
| Cascaded shadow maps (`CascadedShadowMaps`, `ShadowPass`, `shadow.frag`) | partial | `src/clouds/cascadedShadowMaps.ts`, `cloudShadows.ts`: takram's 3 cascades of 512 × 512, split lambda 0.6, structured volume sampling, 50 steps. Differences: the cascades sit side by side in one 32-bit texture instead of a half-float array texture; shadows reach 80 km (the clouds' march distance), where takram uses the camera's far plane, which is 10,000 km here and would spread the cascades too thin; no mip level per cascade |
| Cloud shadows on the scene (terrain, buildings) | partial | Through the sun light's custom shadow node (`light.shadow.shadowNode`), so only direct sunlight is dimmed. As takram's aerial perspective: no optical depth tail, 8-sample filter; the filter radius is fixed at 2 texels where takram scales it by the shadow texel's size on screen |
| Shadow pass temporal resolve (`shadowResolve.frag`) | done | Nine-sample variance clipping, takram's defaults (varianceGamma 1, temporalAlpha 0.01); non-finite values dropped |

## Not needed

| takram feature | Why |
|---|---|
| Debug views (`DEBUG_SHOW_*`) | Development aids for takram |
| Orthographic camera support (`PERSPECTIVE_CAMERA` off) | The demo uses a perspective camera only |
| React Three Fiber components | The demo does not use React |
| Procedural texture generators | The precomputed textures they produce are used directly |
