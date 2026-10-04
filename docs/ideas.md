# Ideas

Things not decided yet. When an idea is settled it becomes an [ADR](adr/) and is removed from here.

## Open questions

- **The first-person camera.** Its behaviour is still to be specified
  ([ADR 0009](adr/0009-camera-separate-from-path.md)). The first version
  (`src/camera/cockpitCamera.ts`) has first guesses to tune by eye: head lag 0.12 s, shake 0.06°,
  sinking 1.5 cm per G above 1, field of view 70°. No cockpit or aircraft is drawn yet.
- **The area.** About 30 to 50 km across, detailed only along the flight path
  ([ADR 0018](adr/0018-f16-at-cruise-speed.md)). Where exactly is chosen by the level of detail
  and textures available in PLATEAU ([ADR 0006](adr/0006-fixed-area-tiled-detail.md)).
- **Length of the demo.** Two to three minutes assumed so far; whether it loops.
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
- The time slider uses today's date in JST; only the time of day moves.

## Plan

1. Minimal Vite, TypeScript and Three.js `WebGPURenderer` set-up, with the WebGPU check and the
   guidance screen.
2. Test and choose the depth format (done: [ADR 0015](adr/0015-reversed-z-depth.md)).
3. `@takram/three-atmosphere`: sky, sun and a time-of-day slider (done).
4. A temporary flight and the first-person camera (done; waiting for a check by eye).
5. Commit, then plan the next stages: clouds and temporal anti-aliasing
   ([ADR 0013](adr/0013-port-the-clouds-to-tsl.md)), terrain and buildings, rain, the JSBSim
   flight path.
