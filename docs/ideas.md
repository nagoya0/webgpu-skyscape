# Ideas

Things not decided yet. When an idea is settled it becomes an [ADR](adr/) and is removed from here.

## Open questions

- **Depth format.** Logarithmic depth or reversed Z. Every screen-space pass depends on it
  ([ADR 0010](adr/0010-post-processing-pipeline.md)), so it is decided in the second task.
- **Clouds on WebGPU.** `@takram/three-clouds` does not support WebGPU yet
  ([ADR 0005](adr/0005-atmosphere-and-clouds-from-takram.md)). To be settled before the cloud
  stage.
- **The first-person camera.** Its behaviour is still to be specified
  ([ADR 0009](adr/0009-camera-separate-from-path.md)). The first version has a lag behind the
  aircraft's motion and a slight shake.
- **The area.** Chosen by the level of detail and textures available in PLATEAU
  ([ADR 0006](adr/0006-fixed-area-tiled-detail.md)).
- **Static site host.** GitHub Pages or Cloudflare Pages
  ([ADR 0012](adr/0012-site-and-tile-data-hosted-apart.md)).

## Plan

1. Minimal Vite, TypeScript and Three.js `WebGPURenderer` set-up, with the WebGPU check and the
   guidance screen.
2. Test and choose the depth format.
3. `@takram/three-atmosphere`: sky, sun and a time-of-day slider.
4. A temporary spline flight and the first-person camera.
5. Commit, then plan the next stages: clouds and temporal anti-aliasing, terrain and buildings,
   rain, the JSBSim flight path.
