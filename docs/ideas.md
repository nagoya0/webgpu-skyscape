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
  same while the body effects are off. To be done when the HUD or the cockpit view is built.
- **The HUD**, drawn after the post-processing, in two kinds (the maintainer, 2026-10-07):
  - Fixed to the screen: the time of day, a mini map (whether to show one is open).
  - The aircraft's HUD, as in a fighter's real head-up display: heading, pitch, altitude, speed
    and the like. It moves with the airframe's vibration. Everything a real HUD would show goes
    on this layer (the maintainer); the screen layer is only for what is not part of the
    aircraft, such as the time of day.
  - Reference for the aircraft's HUD: the HUD symbology of the DCS: F-16C Viper Early Access
    Guide (Eagle Dynamics), the F-16C Block 50 (the maintainer, 2026-10-07; ADR 0018 sets an
    F-16-class aircraft). Not all of it: elements are added one at a time as the maintainer
    chooses, drawn by this project from the guide's layout and meaning.
  - Text and lines in HUD green with a glow (the maintainer). The elements are added one at a
    time as the maintainer asks. Typeface: Share Tech Mono (the maintainer, from eight open
    typefaces), bundled in `public/fonts/`.
  - In place (2026-10-07, `src/hud/`): both layers drawn with Canvas 2D and laid over the image
    after the water drops; the aircraft layer is drawn in the airframe's frame and turned by the
    camera's shake, so it shakes with the scene and stays on it. `?huddebug` draws a test
    pattern, with a horizon from the airframe's attitude that stays on the real one.
- **The course** ([ADR 0028](adr/0028-area-sagami-bay-hakone-fuji.md)). For now the simple
  out-and-back from Sagami Bay towards Mount Fuji at 3,000 m, above the low clouds. Later, as the
  maintainer would like: dropping below the cloud base and climbing back, and some fighter
  manoeuvres.
- **Manoeuvres in the final route.** The maintainer wants more than level turns: full rolls and
  more complex flying. The placeholder's roll rate (90°/s) looks fine. Things this will affect:
  - Head lag: 0.12 s suits slow turns, but an F-16 can roll at over 200°/s, which would leave the
    view 20 to 30° behind. A real pilot's head turns with the aircraft, so roll may need less lag
    than pitch and yaw.
  - Sampling: at 10 Hz a fast roll turns 20 to 30° per sample. Raise the rate to 30 to 60 Hz, or
    use squad instead of slerp (ADR 0008 allows both).
  - JSBSim: altitude and heading holds cover straight flight and turns. Rolls and loops need
    timed control inputs or a small Python controller that flies towards target attitudes.
  - Altitude and G: a loop changes altitude by 1 to 2 km and pulls 4 to 7 G, which affects the
    altitude range, the cloud heights and the camera's sinking and shake.
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
    refinement test. Finer terrain (`?terraintexel=`) sharpens
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
- **Loading screen.** Allowed by the maintainer as an exception to
  [ADR 0019](adr/0019-no-ui-until-features-are-in.md), like the guidance screen, and to be
  redesigned with the UI. A temporary one (`src/ui/loading.ts`) holds the flight at its start
  until the tile queue has stayed empty for 1.5 s, or for 30 s at most.
- **Length of the demo.** Two to three minutes assumed so far; whether it loops. The placeholder
  course takes about 400 s per lap.
- **Static site host.** GitHub Pages or Cloudflare Pages
  ([ADR 0012](adr/0012-site-and-tile-data-hosted-apart.md)).
- **A fork of three-geospatial.** Decided during the cloud stage, by how much of the library's
  internals the cloud port changes ([ADR 0016](adr/0016-patch-takram-for-newer-three.md)).
  Steps C1 to C4 needed no changes to the library: the cloud code is our own WGSL and uses only
  the atmosphere's public functions.
- **Colour grading and tone mapping**, at the end, once the scene is complete
  ([ADR 0031](adr/0031-correct-the-sources-grade-at-the-end.md)). AgX and exposure 3 for now.

## Night

The demo should also work at night. Planned split, written for the Tokyo area and to be
reconsidered for the coast and mountains:

- **Early (small):** stars and the moon, which the atmosphere package already draws, and an
  exposure that adapts to the brightness of the scene. A night sky is around a millionth of the
  brightness of a day sky, so a fixed exposure shows it as black. Whether moonlight lights the
  ground is still to be checked.
- **Town lights:** NASA Black Marble night-light imagery (about 500 m resolution) on the ground
  for far views. In Tokyo: windows generated from PLATEAU building use attributes for near views,
  and pools of light from street lamps as additively blended quads, instanced, drawn in the HDR
  scene pass before the aerial perspective without writing depth. Real light sources for street
  lamps are not planned; from the air the quads should be enough.

## Temporary parts

Placeholders that later stages replace. Remove each with the stage that replaces it.

- `src/scene/placeholderGround.ts`: a flat 200 km disc with a 1 km grid, beyond the terrain in
  the Tokyo area only. The Hakone area has a sea-level sphere instead
  ([ADR 0030](adr/0030-terrain-to-the-horizon.md)).
- `src/flight/placeholderPath.ts`: a racetrack at 250 m/s, level flight only, set per area in
  `src/areas.ts` (Hakone: heading 293°, 120 s straights, 45° bank, 3,000 m). Replaced by the
  JSBSim path. Its output has the same form (ECEF positions, body-to-NED attitudes), so the
  playback and the camera stay.
- The origins in `src/areas.ts` (Hakone: 139.02° E, 35.23° N, north of Lake Ashi) are placed
  for the placeholder racetrack and may move when the course is fixed.
- `src/ui/loading.ts`: the temporary loading screen, redesigned with the UI.

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
  Fuji, flown higher ([ADR 0028](adr/0028-area-sagami-bay-hakone-fuji.md)).
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
  precomputed path, for the offline path tool, is left for the JSBSim stage.
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

Next, in this order (the maintainer put the ground's quality before the remaining cloud
features on 2026-10-06, and on 2026-10-07 put the rest of the terrain and of the clouds on hold
as room for improvement, listed in the README; changes for performance are still considered):

1. **Forests**: on hold (2026-10-07).
2. **JSBSim path** with manoeuvres, replacing the placeholder.
3. **Night.** Stars, moon and adaptive exposure fit between any stages.

Not yet placed: the HUD (two kinds, above), tile prefetching along the path, and a check of
temporal anti-aliasing at 250 m/s.

Later: the cockpit view, quality presets, colour grading, the UI, the README and video,
publishing.
