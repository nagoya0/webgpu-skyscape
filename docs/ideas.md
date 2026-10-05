# Ideas

Things not decided yet. When an idea is settled it becomes an [ADR](adr/) and is removed from here.

## Open questions

- **The first-person camera.** Its behaviour is still to be specified
  ([ADR 0009](adr/0009-camera-separate-from-path.md)). The first version
  (`src/camera/cockpitCamera.ts`) uses a 70° field of view. No cockpit or aircraft is drawn yet.
  Head lag (pitch only) and the eye moving under load are effects on the pilot's body, so they
  belong to the cockpit view ([ADR 0020](adr/0020-effects-by-view.md)) and are off by default
  (`?lag=` and `?sink=` turn them on; first guesses 0.12 s and 1.5 cm per G). What the cockpit
  view should show is the body pressed into the seat when pulling up and lifting when pushing
  over. Both are tuned when the cockpit view is built.
  Shake, as the maintainer wants it: none in steady flight, even if that is less realistic; some
  in turns and more when passing through clouds. For now 0.04° per G above 1 and 0.3° at full
  cloud density; the cloud figure is untested until clouds exist.
- **The area.** About 30 to 50 km across, detailed only along the flight path
  ([ADR 0018](adr/0018-f16-at-cruise-speed.md)). Where exactly is chosen by the level of detail
  and textures available in PLATEAU ([ADR 0006](adr/0006-fixed-area-tiled-detail.md)).
- **Length of the demo.** Two to three minutes assumed so far; whether it loops.
- **Manoeuvres in the final route.** The maintainer wants more than level turns: full rolls and
  more complex flying. The placeholder's roll rate (90°/s) and bank (70°) look fine. Things this
  will affect:
  - Head lag: 0.12 s suits slow turns, but an F-16 can roll at over 200°/s, which would leave the
    view 20 to 30° behind. A real pilot's head turns with the aircraft, so roll may need less lag
    than pitch and yaw.
  - Sampling: at 10 Hz a fast roll turns 20 to 30° per sample. Raise the rate to 30 to 60 Hz, or
    use squad instead of slerp (ADR 0008 allows both).
  - JSBSim: altitude and heading holds cover straight flight and turns. Rolls and loops need
    timed control inputs or a small Python controller that flies towards target attitudes.
  - Altitude and G: a loop changes altitude by 1 to 2 km and pulls 4 to 7 G, which affects the
    altitude range, the cloud heights and the camera's sinking and shake.
- **Flight altitude.** Low to medium, so that the aircraft can pass through cumulus clouds, whose
  bases are around 600 to 2,000 m.
- **Static site host.** GitHub Pages or Cloudflare Pages
  ([ADR 0012](adr/0012-site-and-tile-data-hosted-apart.md)).
- **A fork of three-geospatial.** Decided at the cloud stage, by how much of the library's
  internals the cloud port changes ([ADR 0016](adr/0016-patch-takram-for-newer-three.md)).
- **Look of the image.** Tone mapping (AgX for now) and exposure (3 for now). There is too little
  in the scene to judge post-processing yet; judge it by eye once clouds and terrain are in.

## Night

The demo should also work at night. Planned split:

- **Early (small):** stars and the moon, which the atmosphere package already draws, and an
  exposure that adapts to the brightness of the scene. A night sky is around a millionth of the
  brightness of a day sky, so a fixed exposure shows it as black. Whether moonlight lights the
  ground is still to be checked.
- **With terrain and buildings:**
  - City lights drawn as emissive materials, spread by bloom. Candidate data: windows generated
    from PLATEAU building use attributes, for near views; NASA Black Marble night-light imagery
    (about 500 m resolution) on the ground, for far views.
  - Pools of light from street lamps as additively blended quads on the ground, instanced. Drawn
    in the HDR scene pass before the aerial perspective, without writing depth, so distant lamps
    fade in the haze like everything else. Positions from PLATEAU city furniture where a city has
    street lamps in its data, otherwise spaced along roads.
  - Real light sources for street lamps are not planned; from the air the quads should be
    enough.

## Temporary parts

Placeholders that later stages replace. Remove each with the stage that replaces it.

- `src/scene/placeholderGround.ts`: a flat 200 km disc with a 1 km grid. Replaced by terrain.
- `src/flight/placeholderPath.ts`: a racetrack at 250 m/s and 1500 m, 70° bank turns, level
  flight only, 120.5 s per lap. Replaced by the JSBSim path. Its output has the same form
  (ECEF positions, body-to-NED attitudes), so the playback and the camera stay.
- The origin over Tokyo Bay in `src/main.ts`. Replaced by the chosen area.

## Plan

1. Minimal Vite, TypeScript and Three.js `WebGPURenderer` set-up, with the WebGPU check and the
   guidance screen.
2. Test and choose the depth format (done: [ADR 0015](adr/0015-reversed-z-depth.md)).
3. `@takram/three-atmosphere`: sky, sun and a time-of-day slider (done; the slider was later
   replaced by `?time=`, [ADR 0019](adr/0019-no-ui-until-features-are-in.md)).
4. A temporary flight and the first-person camera (done; checked by eye).
5. Plan the next stages (done, below).

Next stages, proposed 2026-10-05:

1. **Cloud trial, one to two days** (done: [ADR 0022](adr/0022-heavy-shaders-in-wgsl.md)). A simple ray-marched cloud written in WGSL and connected
   with `wgslFn`. Checks: does it fit the render pipeline; does it work with reversed-Z depth,
   temporal anti-aliasing and the atmosphere tables; how mechanical is moving takram's GLSL to
   WGSL. The result decides the shader-language policy for all later shaders (an ADR), and the
   estimate for the cloud stage.
2. **Area and terrain.** Choose the area from PLATEAU's coverage; build tiled terrain and aerial
   photographs with levels of detail ([ADR 0006](adr/0006-fixed-area-tiled-detail.md)); decide
   the tile storage and the site host. Check temporal anti-aliasing at 250 m/s and measure on an
   integrated GPU, leaving GPU time for the clouds.
3. **Buildings.** PLATEAU 3D Tiles in the local frame, detailed along the path.
4. **Clouds**, in this demo's scope ([ADR 0013](adr/0013-port-the-clouds-to-tsl.md)). The cloud
   shape data (weather map, layer settings) lives in files that both the GPU and the offline
   path tool read, so the path's cloud density channel matches what is drawn
   ([ADR 0008](adr/0008-precomputed-flight-path.md)).
5. **Rain** ([ADR 0011](adr/0011-rain-driven-by-relative-wind.md),
   [ADR 0020](adr/0020-effects-by-view.md)).
6. **JSBSim path** with manoeuvres, replacing the placeholder.
7. **Night.** Stars, moon and adaptive exposure fit between any stages; city lights and street
   lamp quads after the buildings.

Later: the cockpit view, quality presets, the UI, the README and video, publishing.
