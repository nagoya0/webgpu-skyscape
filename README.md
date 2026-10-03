# webgpu-skyscape

A demo that tests how well sky, clouds and the ground can be rendered in a web browser with
WebGPU. The camera flies along a precomputed path over a fixed area of Japan, built from open
data.

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

Libraries and data sources, with their licences and the required attributions, will be listed here
as they are added.
