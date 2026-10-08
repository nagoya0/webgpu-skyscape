# Ideas

Things not decided yet. When an idea is settled it becomes an [ADR](adr/) and is removed from here.

## Open questions

- **The first-person camera.** Its behaviour is still to be specified
  ([ADR 0009](adr/0009-camera-separate-from-path.md)). The first version
  (`src/camera/cockpitCamera.ts`) uses a 70° field of view. No cockpit or aircraft is drawn yet.
  Head lag (pitch only) and the eye moving under load are effects on the pilot's body, so they
  belong to the cockpit view ([ADR 0020](adr/0020-effects-by-view.md)) and are off by default
  (`DEFAULT_COCKPIT_CAMERA` turns them on; first guesses 0.12 s and 1.5 cm per G). What the cockpit
  view should show is the body pressed into the seat when pulling up and lifting when pushing
  over. Both are tuned when the cockpit view is built.
  Shake, as the maintainer wants it: none in steady flight, even if that is less realistic; some
  in turns and more when passing through clouds. For now 0.04° per G above 1 and 0.3° at full
  cloud density. In clouds the shake now follows how deep in cloud the aircraft is (`src/effects/inCloud.ts`):
  0 in clear air, 1 − exp(−extinction / 0.01 per metre), so about 0.63 at 100 m of visibility and
  0.96 at 0.033 per metre, followed over 0.2 s since the density jumps at a cloud's edge. The size
  of the shake is still to be judged by eye in motion; in motion the maintainer found it fine
  (2026-10-07).
- **Attitudes: aircraft, airframe and camera.** The aircraft's attitude from the path carries no
  shake; the camera adds the shake and the body effects on top (`src/camera/cockpitCamera.ts`).
  For the HUD and the cockpit view this is to become three steps: the aircraft's attitude (for
  the instruments' values), the airframe's with its vibration added (shake in turns and in
  clouds; the cockpit model and the aircraft HUD move with it), and the camera's with the
  pilot's head added (lag, sinking under load). In the first-person view the last two are the
  same while the body effects are off. The HUD already takes the airframe's attitude and the
  camera's offset from it (`aircraftQuaternion`, `offsetQuaternion`); the split of the offset
  into vibration and head is to be done with the cockpit view.
- **The HUD** ([ADR 0034](adr/0034-hud.md)). Open: whether the screen layer gets a mini map.
  Checking the instruments through longer inverted flight waits with the fighter manoeuvres.
- **The course**: decided in [ADR 0035](adr/0035-the-course.md); the JSBSim path stage's notes
  below.
- **Fighter manoeuvres**: on hold (the maintainer, 2026-10-07): the course's roll and hard turn
  were judged enough for now; listed in the README as room for improvement. If taken up again:
  - Head lag: 0.12 s suits slow turns, but an F-16 can roll at over 200°/s, which would leave the
    view 20 to 30° behind. A real pilot's head turns with the aircraft, so roll may need less lag
    than pitch and yaw. (The head lag is off by default.)
  - Sampling: the path is sampled at 30 Hz, 6° per sample in the course's 180°/s roll. Raise the
    rate to 60 Hz, or use squad instead of slerp (ADR 0008 allows both).
  - JSBSim: the autopilot in `tools/flightpath/aircraft.py` flies holds, turns and a full roll;
    loops need a controller that flies towards target attitudes through the vertical.
  - Altitude and G: a loop changes altitude by 1 to 2 km and pulls 4 to 7 G, which affects the
    altitude range, the cloud heights and the camera's sinking and shake.
  - The HUD through longer inverted flight (the course's roll is inverted for about a second).
- **Forests** ([ADR 0028](adr/0028-area-sagami-bay-hakone-fuji.md)). The wooded mountains fill
  much of the image. Proposed, by altitude: from about 1.5 km up, the photographs with finer
  shading from the elevation model only; lower, instanced trees placed from land cover data or
  the photographs' green areas; close to the ground, 3D trees near the course. Not decided.
- **The mountains' terrain** (seen 2026-10-07). After the land became diffuse
  ([ADR 0032](adr/0032-land-reflects-diffusely.md)) the maintainer judged the terrain good
  enough. Only the skirts were changed; the other items below are on hold as room for
  improvement, listed in the README. Changes for performance are still welcome.
  - Some slopes look flat and coarse, next to detailed ones. The maintainer saw the texture
    change; checked 2026-10-07 on Mount Ashitaka (`?terraindebug=1` tints tiles by zoom level,
    `?terraindebug=2` shows the photographs unlit): both parts are drawn at the same zoom level,
    and the photographs are sharp down to zoom 18 in both. The difference is the season of the
    photographs in GSI's mosaic: the summit's are from winter, bare trees with long shadows from
    a low sun, which show every ridge; the slope's are from summer, an even green canopy with
    little shading in it. At 15:00 the slopes seen from the course face away from the sun and
    are lit evenly by the sky only: the winter photographs keep their own shadows, the summer
    ones go flat. At 09:00 the same slopes are in direct sun and the terrain's relief shows
    through the demo's shading. The water mask (`?terraindebug=3`) is not involved.
    Summer-photographed forest needs its relief from the demo's own shading, also in the shade.
    A second cause, found later the same day: the land reflected the sun specularly at grazing
    angles, and the sheen lay over the photographs as a whitish film. The land now reflects
    diffusely only ([ADR 0032](adr/0032-land-reflects-diffusely.md)), and at 15:00 the trees'
    texture shows on those slopes.
  - Ridges are drawn as straight segments by the 33 × 33 grid, 75 to 150 m between vertices at
    3,000 m.
  - Dark wedges showed where tiles of different levels meet on steep slopes, deeper than the
    30 m skirts. The skirts now hang as deep as the tile is wide, straight down at the tile
    rather than along the frame's y (the maintainer's choice: a long skirt costs nothing, as it
    stays hidden). The tile's radius and bounding sphere cover the surface only, so the long
    skirts do not change refinement or culling. The wedges were most likely the black lines below.
  - The black lines along tile edges that remained (found by the maintainer at t=110, clearest
    at `?altitude=1000&terraindebug=4`) were skirts seen from behind through the gaps: three
    flips the normal on the back faces of a double-sided material, so they faced down, away
    from the sun and the sky (`?terraindebug=5` showed them with downward normals). Land tiles
    now use the vertex normal as it is on both sides, and the lines are gone. Debugging views
    used: `?terraindebug=4` the terrain plain grey, `5` the normals as colour.
  - Small bright triangles at 17:00 on the slopes seem to be faces of the ridges turned to the
    low sun, made angular by the 33 × 33 grid; not checked with the views above.
  - On hold: normals from the elevation model at its full resolution, so sky light varies over
    a slope; ambient occlusion in the valleys; a 65 × 65 grid; the terrain's relief in the
    refinement test. Finer terrain (`texelPixels` in `DEFAULT_TERRAIN`) sharpens
    the sunlit slopes a little: 1.5 (default) 184 tiles and 257 MB of textures, 1.0 296 and
    414 MB, 0.75 416 and 582 MB.
- **Frame time** ([ADR 0025](adr/0025-target-hardware.md): about 7 ms per frame on the
  development machine). Hakone area at 1920 × 1080, 2026-10-06 and 07: about 2.7 to 2.9 ms of
  GPU and 1.4 to 1.9 ms of JavaScript with everything on. Of the clouds' share, the shadow maps
  take about 0.7 ms (the shadows on the ground 0.1 to 0.3 ms, `?groundshadow=0` leaves them out)
  and the light shafts about 0.35 ms. Single runs vary by up to 0.5 ms with the tiles loaded, so
  compare medians of several. How to read `?measure`: GPU time from timestamp queries;
  JavaScript time from a run without them, since they slow it; the "total" figure includes
  about 3 ms of waiting for the GPU's reply and overstates the cost. Still to look at: JavaScript
  time while flying, when new tiles are decoded in the same frames.
- **Tile streaming at speed.** At 250 m/s the camera keeps requesting new tiles. Flown at
  3,000 m the ground moves across the view about seven times slower than at 450 m, so this is
  easier than in Tokyo. Prefetching along the precomputed path
  ([ADR 0018](adr/0018-f16-at-cruise-speed.md)) remains the planned answer if it shows.
- **Read from the debug window** (2026-10-08, headless Chrome on the development machine,
  1262 × 600, t=110): frame 8.3 ms (the 120 Hz display's refresh), CPU (JS) about 2.5 ms, GPU
  about 1.9 ms, GPU memory (est.) about 360 MB, of which about 270 MB terrain photographs;
  145K triangles, 70 draw calls. At DPR 1.5 (2.25 times the pixels) GPU 2.8 ms and GPU memory
  about 500 MB, the difference being render targets that grow with the resolution. To look at:
  - The JavaScript takes longer than the GPU. Its parts are not measured; a profile first. A
    known candidate: the HUD's aircraft layer is uploaded at full size every frame.
  - Displays with a high pixel ratio (4K, DPR 2) multiply the GPU's work and memory; a cap on
    the render resolution, or a quality preset, may be needed.
  - Memory over several laps (checked 2026-10-08, three laps from an empty cache): GPU memory
    (est.) grew about 300 MB a lap, as takram's blue noise node loaded a new copy for each terrain
    tile's material; fixed by loading the noise once ([ADR 0038](adr/0038-own-blue-noise.md)),
    after which it stays at about 1,260 MB with 1,000 tiles. The JS heap after garbage collection
    still grows about 30 MB a lap, mostly three's node and binding data made for each tile's
    material. The maintainer accepts it (2026-10-08); removing it would mean one material shared
    by all tiles.
- **Another area: mountains such as Okutama** (the maintainer, 2026-10-08). A mountain area
  needs no buildings and reuses the Hakone work (terrain, photographs, a lake, clouds, a JSBSim
  course); forests would matter even more there. An idea, not planned. The area structure in
  `src/areas.ts` is kept for it ([ADR 0036](adr/0036-remove-the-tokyo-area.md)).
- **A fork of three-geospatial.** Decided during the cloud stage, by how much of the library's
  internals the cloud port changes ([ADR 0016](adr/0016-patch-takram-for-newer-three.md)).
  Steps C1 to C4 needed no changes to the library: the cloud code is our own WGSL and uses only
  the atmosphere's public functions.
- **Colour grading and tone mapping**: done ([ADR 0043](adr/0043-colour-grading.md)); AgX and an
  exposure of 3 before the pre-exposure.
  The haze's height profile was tried first (2026-10-09), as takram's default (aerosol thinning
  every 1,200 m) might suit a view from the ground better than one from 3,000 m: a boundary layer
  uniform to 1,500 m then thinning fast, with the ground's density or the same total, and half
  the haze. The maintainer saw little difference between them, so takram's default stays; the
  sky's blue is left to the grading.

## Night

Done ([ADR 0041](adr/0041-night-exposure-and-moonlight.md)): exposure by the sun's altitude,
moonlight, stars, the night sky's glow and city lights. Open:

- **A glow around far towns.** The lens flare's bloom was strengthened (ADR 0042), which softens
  the sun's glints by day, but it takes only what is brighter than its threshold, and far towns
  at night stay below it: they still show as thin lines of points on the horizon.

## Temporary parts

Placeholders that later stages replace. Remove each with the stage that replaces it.

- The Hakone origin in `src/areas.ts` (139.02° E, 35.23° N, north of Lake Ashi) was placed for
  the placeholder racetrack, now removed; the course stays within about 30 km of it.

## Plan

Done:

- Set-up with Vite, TypeScript and Three.js `WebGPURenderer`, the WebGPU check and the guidance
  screen ([ADR 0003](adr/0003-webgpu-only.md)); reversed-Z depth
  ([ADR 0015](adr/0015-reversed-z-depth.md)); the sky from `@takram/three-atmosphere`; a
  temporary flight and the first-person camera.
- Cloud trial in WGSL ([ADR 0022](adr/0022-heavy-shaders-in-wgsl.md)).
- Terrain and aerial photographs from GSI, streamed in real time
  ([ADR 0026](adr/0026-own-terrain-from-gsi-tiles.md)).
- Central Tokyo with PLATEAU buildings ([ADR 0023](adr/0023-area-central-tokyo.md),
  [ADR 0024](adr/0024-untextured-buildings-with-procedural-facades.md),
  [ADR 0027](adr/0027-batched-building-tiles.md)), then the move to Sagami Bay, Hakone and Mount
  Fuji, flown higher ([ADR 0028](adr/0028-area-sagami-bay-hakone-fuji.md)); the Tokyo area
  removed with its code ([ADR 0036](adr/0036-remove-the-tokyo-area.md), 2026-10-08).
- Clouds, steps C1 to C4 and light shafts ([ADR 0013](adr/0013-port-the-clouds-to-tsl.md),
  [clouds-parity.md](clouds-parity.md)).
- Water ([ADR 0029](adr/0029-water-from-gsi-data.md)), the terrain out to the horizon
  ([ADR 0030](adr/0030-terrain-to-the-horizon.md)), and the photographs' correction
  ([ADR 0031](adr/0031-correct-the-sources-grade-at-the-end.md)).
- Land reflecting diffusely ([ADR 0032](adr/0032-land-reflects-diffusely.md)), the terrain's skirts
  and the black lines along tile edges fixed, and more clouds to fly among with `?cloudamount=`
  ([ADR 0033](adr/0033-more-clouds-to-fly-among.md)) (2026-10-07).
- Effects in the first-person view ([ADR 0020](adr/0020-effects-by-view.md)): the shake in clouds
  now follows the clouds' density (2026-10-07), and the water drops below.
- Clouds, step C5 (2026-10-07): the clouds' density at the camera, computed on the CPU every
  frame from the same textures and layer settings as the GPU march (`src/clouds/cloudDensity.ts`),
  so it follows `?cloudamount=`, `?coverage=` and `?wind=`. About 1 to 15 µs per frame. Shown
  with `?debug`. Checked against the image at 1,500 m with more clouds: 0 where the view was
  clear, above 0 where it was inside a cloud. The weather map is now decoded with fast-png so the
  CPU and the GPU read the same values (the image did not change). A density channel in the
  precomputed path was dropped (ADR 0008).
- Water drops on the screen in the first-person view (2026-10-07, `src/effects/drops.ts`), tuned
  with the maintainer by eye. Drops land only deeper in cloud than 0.5, up to 210 a second, small
  (cubic distribution) with about 1.5 % large; the smallest cling, larger ones flow outwards
  faster with the aircraft's speed and their size, pulled down a little by gravity, meandering
  mildly along a fixed grime pattern on the glass; a moving drop is drawn out behind into one
  streak as long as it travels in 0.08 s; drops that touch merge; outlines are bent by random
  harmonics. They evaporate out of the cloud (small ones in about 1.3 s, the largest in about
  10 s) and at half that rate in it. Drawn after the anti-aliasing as a refracting height map.
  After Heartfelt (Martijn Steinrucken) and the Codrops rain experiments (Lucas Bebber).
  Simulated on the CPU, drawn on the GPU ([ADR 0011](adr/0011-rain-driven-by-relative-wind.md),
  agreed after measuring: about 400 drops deep in cloud, 0.33 ms of CPU, `window.__debug.dropsMs`).
- The HUD ([ADR 0034](adr/0034-hud.md), 2026-10-07): the aircraft's HUD after the DCS F-16C
  guide (velocity, altitude and heading scales, roll indicator, attitude bars, boresight cross,
  flight path marker) and, fixed to the screen, the scene's time and where the aircraft is.

Next, in this order (the maintainer put the ground's quality before the remaining cloud
features on 2026-10-06, and on 2026-10-07 put the rest of the terrain and of the clouds on hold
as room for improvement, listed in the README; changes for performance are still considered):

1. **Forests**: on hold (2026-10-07).
2. **JSBSim path** with manoeuvres, replacing the placeholder. Steps proposed and agreed
   (2026-10-07): (1) install JSBSim and trim the F-16; (2) play a straight flight in the demo;
   (3) a simple controller in Python for holds and turns, with the load factor; (4) choose the
   course with the maintainer, with the demo's length and whether it loops; (5) manoeuvres, at a
   higher sample rate, checking the HUD inverted and the head lag; (6) tile prefetching along the
   path. Steps 1 to 4 done (2026-10-07): `tools/flightpath/`; the course
   ([ADR 0035](adr/0035-the-course.md)) accepted by the maintainer on screen and made the default.
   Step 5 on hold (the maintainer, 2026-10-07: the course's flying is enough for now; see
   "Fighter manoeuvres" above). Left: step 6.
   - The course (`tools/flightpath/fly.py`): 374 s a lap. Start over the bay off Odawara at 500 m
     and 250 m/s; climb at up to 15° to 1,400 m, level through a cumulus for about 5 s (`?debug`
     lists the path's stretches in cloud), then on up towards Lake Ashi to 2,900 m; a roll at
     180°/s after a pull-up to 8° of climb; on at 320 m/s to the south-east of Mount Fuji; a turn
     to the right at 80° of bank (about 6.5 G, down to about 240 m/s); back at 320 m/s north of
     Hakone; down at up to 8° to 500 m, slowing to 250 m/s; a turn to the right at 70° over the bay that ends on the
     start's line about 8 km before the start. The lap closes within about 9 m and 4 m of height;
     the rest is spread over the last 10 s.
   - The F-16 model's speed brake hardly slows it (about 2.5 m/s² at idle with or without it) and
     gives an angle of attack of -5° in level flight, so it is not used; the aircraft slows at
     idle and in hard turns. Full afterburner takes it from 250 to 400 m/s in 30 s at 3,000 m.
   - Hands-off, the trimmed F-16 rolls off: a bank of 0.1° grows about 1.3 times every 2 s, and
     after 100 s it is rolling over. A small autopilot in `tools/flightpath/aircraft.py` holds
     heading (through the bank), bank, height (through the load factor) and speed, through the
     model's own fly-by-wire.
   - The model's yaw damper opposes any yaw rate, also the steady one of a turn, and left 2.4° of
     sideslip in a 60° bank that full rudder could not remove; the autopilot cancels its term.
     Turns are then coordinated within about 0.1°.
   - Results: a 60° bank pulls 2.0 G with 1.8° angle of attack and holds height within 16 m; an
     80° bank about 6 G (7 G at the start) with about 10°, losing about 110 m while rolling in,
     regained in about 20 s. The flight path marker sits that far below the boresight cross, as
     checked on screen. In straight flight at 250 m/s the angle of attack is only 0.2°.
   - The F-16 model's file says GPL, JSBSim is LGPL-2.1 or later. Checked with the maintainer
     (2026-10-08): neither is in the repository; the scripts load the model from the JSBSim
     installed with pip, and the computed path contains no part of the model, so publishing it
     brings no GPL obligation. The HUD and README name JSBSim and the model as the source only.
3. **Night**, started 2026-10-08 ([ADR 0041](adr/0041-night-exposure-and-moonlight.md)). Done: exposure
   by the sun's altitude through a pre-exposure, moonlight on the terrain and in the sky, fewer
   stars, moonlight on the clouds, the night sky's own faint glow for a night without the moon,
   and city lights. Left: a glow around far towns (see Night above). The dark dots along the clouds' edges at dusk were
   investigated and accepted (2026-10-08, [ADR 0013](adr/0013-port-the-clouds-to-tsl.md)).
4. **The UI** ([ADR 0037](adr/0037-ui.md)), started 2026-10-08 as the maintainer judged the
   features complete enough to prepare for publishing; the Tokyo area was removed first
   ([ADR 0036](adr/0036-remove-the-tokyo-area.md)). Done: the header, the settings window with
   its settings and credits tabs, the debug window, Current G on the HUD, the loading screen, the
   screen for when the demo cannot run, and removing development parameters no longer used.
5. **Publishing** (2026-10-08), done: the JSBSim model's licence checked (above); the project's
   own code under the MIT licence; the memory check over several laps and the blue noise leak
   fixed; takram's blue noise of unknown origin replaced by the project's own
   ([ADR 0038](adr/0038-own-blue-noise.md)) and the star data bundled
   ([ADR 0039](adr/0039-bundle-the-star-data.md)), so nothing is loaded from GitHub at run time;
   the load on the GSI measured and missing aerial photographs no longer requested again; a note
   on the download size on the loading screen; an audit of the repository and its history for
   private information (nothing to fix); the repository made public and the demo published on
   GitHub Pages ([ADR 0040](adr/0040-publish-on-github-pages.md)), with a favicon and the demo's
   address in the repository's About.

Not yet placed: a check of temporal anti-aliasing at 250 to 320 m/s (tile prefetching is step 6
of the JSBSim path).

Done 2026-10-08: in a cloud the drops stood out too clearly (the maintainer). The glass now mists
over in a cloud, so the drops show less: the image is spread and lifted towards its own soft average,
up to 60 %, following how deep in cloud the aircraft is (in about 1.5 s) and clearing in about
0.7 s after it, before the last drops evaporate (`src/effects/drops.ts`). Out of the cloud the drops
look as before.

Later: the cockpit view, quality presets. Done: the README's screenshots and video (2026-10-09).
