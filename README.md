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
- More clouds than takram's defaults, to fly among, with a choice of amount
  ([ADR 0033](docs/adr/0033-more-clouds-to-fly-among.md)), and the clouds' density at the aircraft
  computed on the CPU each frame from the same data as the GPU's clouds.
- A placeholder flight path at 250 m/s, out from Sagami Bay towards Mount Fuji and back, and a
  first-person camera that shakes in turns and in clouds.
- Water drops on the screen in clouds: they land deep in a cloud, are blown outwards in streaks,
  merge, and evaporate after it ([ADR 0011](docs/adr/0011-rain-driven-by-relative-wind.md)).
- A HUD after the F-16C's: velocity, altitude and heading scales, roll indicator, attitude bars,
  boresight cross and flight path marker, shaking with the airframe; fixed to the screen, the
  scene's time and the municipality below ([ADR 0034](docs/adr/0034-hud.md)).
- Temporal anti-aliasing, lens flare and AgX tone mapping.

Planned: a flight path from JSBSim with manoeuvres, night scenes, colour grading, and a UI;
forests are still open. The order and the open questions are in [docs/ideas.md](docs/ideas.md).

## What this project adds

Beyond using the libraries listed under credits, this project does the following itself:

- **Clouds on WebGPU.** The released `@takram/three-clouds` (0.7.6) runs on Three.js's WebGL
  renderer. Its shaders are ported to WGSL and connected to the WebGPU renderer through TSL,
  including takram's temporal upscaling, cascaded cloud shadows and light shafts
  ([ADR 0013](docs/adr/0013-port-the-clouds-to-tsl.md),
  [ADR 0022](docs/adr/0022-heavy-shaders-in-wgsl.md)). The cloud shadows reach the terrain and
  buildings through the WebGPU renderer's shadow system, and non-finite values are dropped
  before they can spread through the temporal history.
- **takram's packages on a newer Three.js**, patched to run on 0.186
  ([ADR 0016](docs/adr/0016-patch-takram-for-newer-three.md)).
- **Terrain streamed from GSI tiles**: a quadtree refined by how large a photograph texel
  appears on screen, with no holes while tiles load, out to the horizon, and a sea-level sphere
  beyond it ([ADR 0026](docs/adr/0026-own-terrain-from-gsi-tiles.md),
  [ADR 0030](docs/adr/0030-terrain-to-the-horizon.md)).
- **Water from map data**: a water mask per tile from the elevation model's missing data and the
  water polygons of GSI's vector tiles (read by a small decoder in this project), drawn with waves,
  the sky's reflection and the sun's glint
  ([ADR 0029](docs/adr/0029-water-from-gsi-data.md)).
- **Aerial photographs as ground colour**: the haze in the photographs is removed so that it is
  not applied twice ([ADR 0031](docs/adr/0031-correct-the-sources-grade-at-the-end.md)), and the
  land reflects light diffusely, without the sheen a standard material keeps at grazing angles
  ([ADR 0032](docs/adr/0032-land-reflects-diffusely.md)).
- **A local frame for the scene**: positions are computed on the Earth and moved into a frame
  around the area, which keeps 32-bit floats precise
  ([ADR 0017](docs/adr/0017-local-world-frame.md)).
- **Camera effects**: shake that grows with load and inside clouds, the clouds' density at the
  aircraft computed on the CPU from the same data as the GPU's clouds; head lag and the eye moving
  under load, kept off for a later cockpit view
  ([ADR 0020](docs/adr/0020-effects-by-view.md)).
- **Water drops on the screen**: simulated on the CPU and drawn as a refracting height map after
  the anti-aliasing, after two rain-on-glass effects (Heartfelt and the Codrops rain experiments)
  ([ADR 0011](docs/adr/0011-rain-driven-by-relative-wind.md)).
- **A HUD** drawn with Canvas 2D into the image, its aircraft layer turned with the camera's shake
  so it stays on the scene, after the DCS F-16C guide's symbology; and the municipality below,
  looked up in national land data with romaji names ([ADR 0034](docs/adr/0034-hud.md)).
- **Buildings in the Tokyo area**: PLATEAU's untextured models with procedural facades, drawn as
  one batched mesh ([ADR 0024](docs/adr/0024-untextured-buildings-with-procedural-facades.md),
  [ADR 0027](docs/adr/0027-batched-building-tiles.md)).

## Room for improvement (on hold)

The image is good enough for now; these would raise its quality further and are on hold.
Changes that make the demo faster are still welcome.

- **Terrain**: shading from the elevation model at its full resolution, so slopes in the shade
  show their folds; ambient occlusion in the valleys; a finer grid per tile, so ridges are not
  drawn as straight segments; the terrain's relief in the choice of tile detail.
- **Clouds**: the rest of takram's default features: turbulence, light bounced from the ground,
  and sun and sky light computed per sample. The full list is in
  [docs/clouds-parity.md](docs/clouds-parity.md).

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
| `buildings=0`, `terrain=0`, `clouds=0`, `flare=0`, `drops=0` | Leave out a part of the scene (`drops`: the water drops on the screen in clouds) |
| `dropsdebug` | Debugging: show the drops' height map in red |
| `hud=0` | Leave out the aircraft's HUD |
| `huddebug` | Debugging: draw a test pattern on both HUD layers |
| `groundshadow=0` | Leave out the cloud shadows on the terrain and buildings |
| `terraintexel=px` | Terrain detail: refine while a photograph texel covers more than this many pixels (default 1.5) |
| `photodehaze`, `photocontrast`, `photosat` | Correction of the aerial photographs (defaults 0.15, 1.2, 1.4) |
| `landspecular=0..1` | Specular reflection of the land: 0 diffuse only (default), 1 as a standard material |
| `terraindebug=1` to `5` | Debugging: tint terrain tiles by zoom level; show the photographs without lighting; show the water mask in red; draw the terrain plain grey; show the normals as colour |
| `cloudamount=few`, `normal`, `many` | How much cloud ([ADR 0033](docs/adr/0033-more-clouds-to-fly-among.md)); `normal` is the default |
| `coverage=0..1`, `cloudfx=` | Cloud coverage of all layers; cloud feature switches, such as `cloudfx=-POWDER` |
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
- Municipal boundaries for the HUD's "FLYING OVER" line:
  [National Land Numerical Information, Administrative Areas](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2024.html)
  (国土数値情報（行政区域データ）国土交通省, N03 2024, CC BY 4.0), cut to the course's
  surroundings, thinned and named in romaji by this project (`scripts/build-municipalities.mjs`,
  `public/places/municipalities.json`).

### Code and assets

| Project | Use | Licence |
|---|---|---|
| [three.js](https://threejs.org/) | Renderer | MIT |
| [@takram/three-atmosphere, @takram/three-geospatial](https://github.com/takram-design-engineering/three-geospatial) | Sky, aerial perspective, temporal anti-aliasing, lens flare | MIT |
| [@takram/three-clouds](https://github.com/takram-design-engineering/three-geospatial) | The cloud shaders in `src/clouds/wgsl/` are ported from it, and its noise and weather textures are in `public/clouds/` | MIT, Copyright (c) 2024 Shota Matsuda ([licence](public/clouds/LICENSE-takram.txt)) |
| [three-csm](https://github.com/StrandedKitty/three-csm/) | The cascaded shadow maps in `src/clouds/cascadedShadowMaps.ts`, through takram's version | MIT, Copyright (c) 2019 vtHawk |
| [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) | Loading PLATEAU's 3D Tiles | Apache-2.0 |
| [Draco](https://github.com/google/draco) | Decoding PLATEAU's compressed meshes (`public/draco/`) | Apache-2.0 |
| [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono) | The HUD's typeface (`public/fonts/`) | SIL Open Font License 1.1, Copyright (c) 2012 Carrois Type Design, Ralph du Carrois ([licence](public/fonts/OFL-ShareTechMono.txt)) |
| [fast-png](https://github.com/image-js/fast-png) | Decoding the clouds' weather map, so the CPU reads the same values as the GPU | MIT |
