# Ideas

Things not decided yet. When an idea is settled it becomes an [ADR](adr/) and is removed from here.

## Open questions

- **The first-person camera.** Its behaviour is still to be specified
  ([ADR 0009](adr/0009-camera-separate-from-path.md)). The first version has a lag behind the
  aircraft's motion and a slight shake.
- **The area.** Chosen by the level of detail and textures available in PLATEAU
  ([ADR 0006](adr/0006-fixed-area-tiled-detail.md)).
- **Static site host.** GitHub Pages or Cloudflare Pages
  ([ADR 0012](adr/0012-site-and-tile-data-hosted-apart.md)).
- **A fork of three-geospatial.** Decided at the cloud stage, by how much of the library's
  internals the cloud port changes ([ADR 0016](adr/0016-patch-takram-for-newer-three.md)).
- **Look of the sky.** Tone mapping (AgX for now), exposure (3 for now), and whether night needs
  more than the physically based darkness. To be judged by eye in the browser.

## Temporary parts

Placeholders that later stages replace. Remove each with the stage that replaces it.

- `src/scene/placeholderGround.ts`: a flat 200 km disc. Replaced by terrain.
- `src/camera/dragLook.ts`: looking around by dragging. Replaced by the first-person camera.
- The viewpoint above Tokyo Bay in `src/main.ts`. Replaced by the chosen area.
- The time slider uses today's date in JST; only the time of day moves.

## Plan

1. Minimal Vite, TypeScript and Three.js `WebGPURenderer` set-up, with the WebGPU check and the
   guidance screen.
2. Test and choose the depth format (done: [ADR 0015](adr/0015-reversed-z-depth.md)).
3. `@takram/three-atmosphere`: sky, sun and a time-of-day slider (done; waiting for a check by
   eye).
4. A temporary spline flight and the first-person camera.
5. Commit, then plan the next stages: clouds and temporal anti-aliasing
   ([ADR 0013](adr/0013-port-the-clouds-to-tsl.md)), terrain and buildings, rain, the JSBSim
   flight path.
