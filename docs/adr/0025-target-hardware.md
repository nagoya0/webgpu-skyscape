# 25. Target hardware: a mid-range gaming PC, not integrated GPUs

- Status: Accepted
- Date: 2026-10-06
- Supersedes the integrated-GPU assumption in [ADR 0010](0010-post-processing-pipeline.md)

## Context

The project brief said to process ambient occlusion and clouds at half resolution and to build
quality presets "against the memory bandwidth of integrated GPUs", and
[ADR 0010](0010-post-processing-pipeline.md) recorded that. The maintainer decided not to aim at
integrated GPUs: matching low-end hardware would pull against the aim of the demo, which is to
find out how rich an image the browser can show ([ADR 0002](0002-a-rendering-quality-demo.md)).

## Decision

The demo targets a mid-range gaming PC, described by the maintainer as:

| | |
|---|---|
| OS | Windows 11 |
| CPU | Intel Core i7-10700K / AMD Ryzen 5 3600X |
| Memory | 16 GB |
| GPU | NVIDIA GeForce RTX 2060 (6 GB) / AMD Radeon RX 6600 XT (8 GB) |
| DirectX | 12 |

- The GPU memory budget follows the smaller card: about 2 to 2.5 GB for buildings, terrain,
  clouds and vegetation together, leaving the rest of 6 GB to the operating system and browser.
- Weaker hardware is not a target. Lower quality settings may be added later only if they do not
  hold back the highest setting.
- Half-resolution passes are used where the target hardware needs them, not by default.

## Consequences

- The development machine has an NVIDIA GeForce RTX 4070 (12 GB). From published game benchmarks,
  not our own measurements, it is roughly 2.3 to 2.5 times as fast as an RTX 2060 and 1.7 to
  1.9 times as fast as an RX 6600 XT. So 60 fps on the target (16.7 ms per frame) means about
  7 ms per frame on the development machine; 30 fps would allow about 14 ms.
- The development machine has twice the target's memory, so running out of memory will not show
  there. The memory budget has to be counted, from the tile cache sizes and similar figures,
  rather than noticed.
- PLATEAU's textured buildings still do not fit: three wards filled 1.5 GB with coarse tiles
  alone ([ADR 0024](0024-untextured-buildings-with-procedural-facades.md)).
- The README's recommended environment ([ADR 0003](0003-webgpu-only.md)) is based on this class
  of hardware.
- Resolution and frame rate targets are not set yet; see [ideas](../ideas.md).
