# webgpu-skyscape

A demo that tests how well sky, clouds and the ground can be rendered in a web browser with
WebGPU. The camera flies along a precomputed path from Sagami Bay over Hakone towards Mount Fuji,
built from open data.

Work in progress. A demo video and tested browsers will be added here.

## Status

In place:

- Sky, sun and aerial perspective from `@takram/three-atmosphere`, for any date and time of day.
- Terrain from GSI elevation tiles, covered with GSI aerial photographs corrected for the haze
  they carry ([ADR 0031](docs/adr/0031-correct-the-sources-grade-at-the-end.md)), streamed in
  real time out to the horizon ([ADR 0026](docs/adr/0026-own-terrain-from-gsi-tiles.md),
  [ADR 0030](docs/adr/0030-terrain-to-the-horizon.md)).
- The sea, lakes and rivers drawn as water with waves, the sky's reflection and the sun's glint
  ([ADR 0029](docs/adr/0029-water-from-gsi-data.md)).
- The area: Sagami Bay, Hakone and Mount Fuji, flown at 3,000 m
  ([ADR 0028](docs/adr/0028-area-sagami-bay-hakone-fuji.md)). The earlier area, central Tokyo
  with PLATEAU LOD2 buildings for eight wards and procedural facades
  ([ADR 0024](docs/adr/0024-untextured-buildings-with-procedural-facades.md)), stays selectable
  with `?area=tokyo`.
- Volumetric clouds ported from `@takram/three-clouds` to WGSL, with takram's temporal
  upscaling, aerial perspective, haze, cascaded cloud shadows on the clouds and the ground, and
  light shafts ([ADR 0013](docs/adr/0013-port-the-clouds-to-tsl.md)). Which of takram's
  features are in is listed in [docs/clouds-parity.md](docs/clouds-parity.md).
- A placeholder flight path at 250 m/s, out from Sagami Bay towards Mount Fuji and back, and a
  first-person camera.
- Temporal anti-aliasing, lens flare and AgX tone mapping.

Planned: finer mountain terrain and forests, the rest of the clouds, rain, a flight path from
JSBSim with manoeuvres, night scenes, colour grading, and a UI. The order and the open questions are in
[docs/ideas.md](docs/ideas.md).

## Requirements

A browser with WebGPU enabled. There is no WebGL fallback; other browsers get a page explaining
what is missing ([ADR 0003](docs/adr/0003-webgpu-only.md)).

The target is a mid-range gaming PC, such as a GeForce RTX 2060 or Radeon RX 6600 XT, at
1920 × 1080 and 60 frames per second. Integrated GPUs are not targeted
([ADR 0025](docs/adr/0025-target-hardware.md)). The GPU must support the `float32-filterable`
feature and a `maxColorAttachmentBytesPerSample` limit of at least 48.

## Development

```sh
pnpm install
pnpm dev            # development server
pnpm test           # unit tests (Vitest)
pnpm build          # type-check and build
```

`node scripts/check-page.mjs <url> <out.png>` opens a page in headless Chrome, saves a
screenshot and prints the page state. Further checks, and how to upgrade Three.js and the takram
packages, are in [docs/upgrading.md](docs/upgrading.md).

### URL parameters

There is no on-screen UI yet ([ADR 0019](docs/adr/0019-no-ui-until-features-are-in.md)).
Settings come from the URL query, for example `/?time=06:00&coverage=0.5`. The full list, with
defaults, is at the top of [src/params.ts](src/params.ts). The main ones:

| Parameter | Meaning |
|---|---|
| `area=hakone`, `area=tokyo` | Demo area: Sagami Bay, Hakone and Mount Fuji (default), or central Tokyo with buildings |
| `date=YYYY-MM-DD`, `time=HH:MM` | Date and time of day in JST |
| `t=seconds`, `paused` | Start time on the flight path; hold the flight there |
| `exposure`, `fov` | Exposure before tone mapping; vertical field of view |
| `altitude`, `speed`, `bank`, `rollrate` | Placeholder flight path |
| `buildings=0`, `terrain=0`, `clouds=0`, `flare=0` | Leave out a part of the scene |
| `groundshadow=0` | Leave out the cloud shadows on the terrain and buildings |
| `terraintexel=px` | Terrain detail: refine while a photograph texel covers more than this many pixels (default 1.5) |
| `photodehaze`, `photocontrast`, `photosat` | Correction of the aerial photographs (defaults 0.15, 1.2, 1.4) |
| `terraindebug=1`, `terraindebug=2` | Debugging: tint terrain tiles by zoom level; show the photographs without lighting |
| `coverage=0..1`, `cloudfx=` | Cloud coverage; cloud feature switches, such as `cloudfx=-POWDER` |
| `wind=E,N` | Wind moving the clouds, in m/s towards the east and the north, such as `wind=10,-5` |
| `measure` | After loading, time 180 frames and report CPU and GPU times in `window.__debug` |
| `debug` | Show debug text: flight time, height, load factor, frame time |

## Design

Design decisions are recorded in [docs/adr/](docs/adr/). Open questions and the plan are in
[docs/ideas.md](docs/ideas.md).

## Licence and credits

The licence of this project's own code is not decided yet.

### Data

- Terrain and aerial photographs: [GSI tiles (地理院タイル)](https://maps.gsi.go.jp/development/ichiran.html),
  Geospatial Information Authority of Japan (出典：国土地理院). The elevation tiles
  (`dem5a_png`, `dem_png`) and the seamless photographs (`seamlessphoto`) are processed into
  terrain meshes and textures, and the water areas of the vector tiles (`optimal_bvmap-v1`) into
  water masks, by this project.
- Buildings: [3D City Model (Project PLATEAU)](https://www.mlit.go.jp/plateau/), Ministry of
  Land, Infrastructure, Transport and Tourism (3D都市モデル（Project PLATEAU）国土交通省).

### Code and assets

| Project | Use | Licence |
|---|---|---|
| [three.js](https://threejs.org/) | Renderer | MIT |
| [@takram/three-atmosphere, @takram/three-geospatial](https://github.com/takram-design-engineering/three-geospatial) | Sky, aerial perspective, temporal anti-aliasing, lens flare | MIT |
| [@takram/three-clouds](https://github.com/takram-design-engineering/three-geospatial) | The cloud shaders in `src/clouds/wgsl/` are ported from it, and its noise and weather textures are in `public/clouds/` | MIT, Copyright (c) 2024 Shota Matsuda ([licence](public/clouds/LICENSE-takram.txt)) |
| [three-csm](https://github.com/StrandedKitty/three-csm/) | The cascaded shadow maps in `src/clouds/cascadedShadowMaps.ts`, through takram's version | MIT, Copyright (c) 2019 vtHawk |
| [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) | Loading PLATEAU's 3D Tiles | Apache-2.0 |
| [Draco](https://github.com/google/draco) | Decoding PLATEAU's compressed meshes (`public/draco/`) | Apache-2.0 |
