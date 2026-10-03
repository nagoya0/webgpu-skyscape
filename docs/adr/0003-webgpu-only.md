# 3. WebGPU only, with a guidance screen where it is missing

- Status: Accepted
- Date: 2026-10-03

## Context

The project tests what can be rendered with WebGPU
([ADR 0002](0002-a-rendering-quality-demo.md)). Leaving out a WebGL 2 fallback keeps that purpose
clear.

## Decision

The demo runs on WebGPU only. At start-up it checks:

1. that `navigator.gpu` exists;
2. that `requestAdapter()` returns an adapter (it can return `null` even when `navigator.gpu`
   exists);
3. that the adapter has the features and limits the renderer needs, such as
   `float32-filterable`.

If any check fails, the page shows a guidance screen instead of a black canvas. The screen says
what is missing and points to the README, which lists the tested browsers and the demo video.

## Consequences

Visitors without WebGPU see only the guidance screen, so the README needs a video or screenshots
at the top. The list of required features grows as stages are added, and each addition must be
added to the start-up check.
