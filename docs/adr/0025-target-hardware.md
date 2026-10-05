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

- Timings measured on the development machine (an NVIDIA GPU of the Lovelace generation,
  probably faster than an RTX 2060) are read with a margin of at least two times.
- PLATEAU's textured buildings still do not fit: three wards filled 1.5 GB with coarse tiles
  alone ([ADR 0024](0024-untextured-buildings-with-procedural-facades.md)).
- The README's recommended environment ([ADR 0003](0003-webgpu-only.md)) is based on this class
  of hardware.
- Resolution and frame rate targets are not set yet; see [ideas](../ideas.md).
