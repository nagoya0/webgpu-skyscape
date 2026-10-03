# 2. A demo of rendering quality, not a flight simulator

- Status: Accepted
- Date: 2026-10-03

## Context

The question this project answers is how well sky, clouds and the ground can be rendered within
the limits of a browser and WebGPU. The result is published on the web for anyone to view.

## Decision

The demo is a camera flying along a fixed path over a fixed area. It does not include:

- piloting: the viewer does not control the aircraft;
- flight dynamics computed in real time (the path is computed in advance,
  [ADR 0008](0008-precomputed-flight-path.md));
- a fallback to WebGL 2 ([ADR 0003](0003-webgpu-only.md));
- a detailed aircraft model. At most, a low-polygon aircraft for distant views.

## Consequences

Input handling, flight physics at run time and detailed aircraft modelling are not built. The
work goes into the sky, the clouds, the ground and the effects.
