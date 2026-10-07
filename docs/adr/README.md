# Architecture Decision Records

| No. | Decision | Status |
|---|---|---|
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md) | Accepted |
| 0002 | [A demo of rendering quality, not a flight simulator](0002-a-rendering-quality-demo.md) | Accepted |
| 0003 | [WebGPU only, with a guidance screen where it is missing](0003-webgpu-only.md) | Accepted |
| 0004 | [Three.js WebGPURenderer and TSL, built with Vite and TypeScript](0004-threejs-webgpu-vite-typescript.md) | Accepted; shader language partly superseded by 0022 |
| 0005 | [Atmosphere and clouds from takram's three-geospatial packages](0005-atmosphere-and-clouds-from-takram.md) | Accepted; clouds superseded by 0013 |
| 0006 | [A fixed area, made more detailed over time](0006-fixed-area-tiled-detail.md) | Accepted; area settled by 0023, then 0028; tiles from the sources by 0026 |
| 0007 | [Japanese open data for the ground; not Google Photorealistic 3D Tiles](0007-japanese-open-data.md) | Accepted |
| 0008 | [Play back a flight path computed in advance](0008-precomputed-flight-path.md) | Accepted |
| 0009 | [The camera is a module separate from the flight path](0009-camera-separate-from-path.md) | Accepted |
| 0010 | [Post-processing order, temporal anti-aliasing and quality presets](0010-post-processing-pipeline.md) | Accepted; integrated-GPU assumption superseded by 0025 |
| 0011 | [Rain moves with the relative wind, not with gravity](0011-rain-driven-by-relative-wind.md) | Accepted; drops in the air dropped, drops simulated on the CPU and tuned (2026-10-07) |
| 0012 | [The site and the tile data are hosted apart](0012-site-and-tile-data-hosted-apart.md) | Accepted; tile storage not needed so far (0026) |
| 0013 | [Port the volumetric clouds to TSL ourselves](0013-port-the-clouds-to-tsl.md) | Accepted; ported to WGSL instead (0022), aim set to takram parity, C1 to C4 done |
| 0014 | [Pin the versions of Three.js and the takram packages](0014-pin-three-and-takram-versions.md) | Accepted; version choice superseded by 0016 |
| 0015 | [Reversed-Z depth buffer](0015-reversed-z-depth.md) | Accepted |
| 0016 | [Patch the takram packages to run on Three.js 0.186](0016-patch-takram-for-newer-three.md) | Accepted |
| 0017 | [The scene is in a local tangent-plane frame, not in ECEF](0017-local-world-frame.md) | Accepted |
| 0018 | [The aircraft is an F-16-class fighter at cruise speed](0018-f16-at-cruise-speed.md) | Accepted; area size and altitude changed by 0028 |
| 0019 | [No UI until the features are in; settings come from the URL](0019-no-ui-until-features-are-in.md) | Accepted; settings partly removed by 0036 |
| 0020 | [Effects by view: the aircraft's in the first-person view, the pilot's in the cockpit view](0020-effects-by-view.md) | Accepted |
| 0021 | [Keep Three.js and takram; choose by what works now, not long-term upkeep](0021-keep-threejs-and-takram.md) | Accepted |
| 0022 | [Heavy shaders in WGSL, connected with TSL](0022-heavy-shaders-in-wgsl.md) | Accepted |
| 0023 | [The area is central Tokyo](0023-area-central-tokyo.md) | Superseded by 0028 |
| 0024 | [Untextured PLATEAU buildings with procedural facades](0024-untextured-buildings-with-procedural-facades.md) | Superseded by 0036 (the Tokyo area removed) |
| 0025 | [Target hardware: a mid-range gaming PC, not integrated GPUs](0025-target-hardware.md) | Accepted |
| 0026 | [Our own terrain from GSI tiles, streamed in real time](0026-own-terrain-from-gsi-tiles.md) | Accepted |
| 0027 | [Building tiles are drawn as one BatchedMesh](0027-batched-building-tiles.md) | Superseded by 0036 (the Tokyo area removed) |
| 0028 | [The area is Sagami Bay, Hakone and Mount Fuji, flown higher](0028-area-sagami-bay-hakone-fuji.md) | Accepted; the Tokyo area removed by 0036 |
| 0029 | [Water drawn where GSI's data shows sea, lakes and rivers](0029-water-from-gsi-data.md) | Accepted |
| 0030 | [The terrain reaches the horizon; a sea-level sphere lies beyond it](0030-terrain-to-the-horizon.md) | Accepted |
| 0031 | [Correct the sources first; grade the whole image at the end](0031-correct-the-sources-grade-at-the-end.md) | Accepted |
| 0032 | [Land reflects light diffusely (Lambertian)](0032-land-reflects-diffusely.md) | Accepted |
| 0033 | [More clouds to fly among, with a choice of amount](0033-more-clouds-to-fly-among.md) | Accepted |
| 0034 | [A HUD in two layers, after the F-16C's](0034-hud.md) | Accepted |
| 0035 | [The course: a loop of five to six minutes from Sagami Bay to Mount Fuji and back](0035-the-course.md) | Accepted |
| 0036 | [Remove the Tokyo area and its buildings](0036-remove-the-tokyo-area.md) | Accepted |
