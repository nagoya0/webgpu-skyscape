# webgpu-skyscape

A demo that tests how well sky, clouds and the ground can be rendered in a web browser with
WebGPU. The camera flies along a precomputed path over central Tokyo, built from open data.

Work in progress. A demo video, tested browsers and GPU guidance will be added here.

## Requirements

A browser with WebGPU enabled. There is no WebGL fallback.

## Development

```sh
pnpm install
pnpm dev
```

## Design

Design decisions are recorded in [docs/adr/](docs/adr/). Open questions are in
[docs/ideas.md](docs/ideas.md).

## Licence and credits

The licence of this project's own code is not decided yet.

### Data

- Terrain and aerial photographs: [GSI tiles (地理院タイル)](https://maps.gsi.go.jp/development/ichiran.html),
  Geospatial Information Authority of Japan (出典：国土地理院). The elevation tiles
  (`dem5a_png`, `dem_png`) and the seamless photographs (`seamlessphoto`) are processed into
  terrain meshes and textures by this project.
- Buildings: [3D City Model (Project PLATEAU)](https://www.mlit.go.jp/plateau/), Ministry of
  Land, Infrastructure, Transport and Tourism (3D都市モデル（Project PLATEAU）国土交通省).

### Code and assets

| Project | Use | Licence |
|---|---|---|
| [three.js](https://threejs.org/) | Renderer | MIT |
| [@takram/three-atmosphere, @takram/three-geospatial](https://github.com/takram-design-engineering/three-geospatial) | Sky, aerial perspective, temporal anti-aliasing, lens flare | MIT |
| [@takram/three-clouds](https://github.com/takram-design-engineering/three-geospatial) | The cloud shaders in `src/clouds/wgsl/` are ported from it, and its noise and weather textures are in `public/clouds/` | MIT, Copyright (c) 2024 Shota Matsuda ([licence](public/clouds/LICENSE-takram.txt)) |
| [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) | Loading PLATEAU's 3D Tiles | Apache-2.0 |
| [Draco](https://github.com/google/draco) | Decoding PLATEAU's compressed meshes (`public/draco/`) | Apache-2.0 |
