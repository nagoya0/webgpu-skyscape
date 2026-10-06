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
  cloud density. The cloud figure is untested: the clouds are drawn, but the path has no cloud
  density channel yet (cloud step C5 below).
- **The course** ([ADR 0028](adr/0028-area-sagami-bay-hakone-fuji.md)). For now the simple
  out-and-back from Sagami Bay towards Mount Fuji at 3,000 m. Later, as the maintainer would
  like: dropping below the cloud base and climbing back, and some fighter manoeuvres.
- **Water and forests** ([ADR 0028](adr/0028-area-sagami-bay-hakone-fuji.md)). Sagami Bay, Lake
  Ashi and the wooded mountains fill much of the image. Proposed for forests, by altitude: from
  about 1.5 km up, the photographs with shading from the elevation model only; lower, instanced
  trees placed from land cover data or the photographs' green areas; close to the ground, 3D
  trees near the course. Not decided.
  Water, first version (2026-10-06, `src/terrain/water.ts`): where the 10 m elevation model has
  no data (sea; GSI serves no file for a tile that is all sea), the terrain is drawn as water: a
  dark body colour, small moving waves that flatten with distance, the sky's luminance in the
  reflected direction weighted by Fresnel, and the sun's glint from the sun light's specular.
  About 2.7 ms of GPU in all with the sea filling half the view. Lakes (Lake Ashi, the Fuji
  lakes) have heights in the elevation model and are not water yet; clouds are not reflected.
- **The placeholder disc and the earth's curvature.** The flat disc lies on the origin's
  tangent plane, so beyond about 25 km it rises above the curving sea and hid it. It is left
  out in the Hakone area, where the terrain reaches towards the horizon.
- **Frame time** ([ADR 0025](adr/0025-target-hardware.md): about 7 ms per frame on the
  development machine). After batching the buildings ([ADR 0027](adr/0027-batched-building-tiles.md)),
  measured 2026-10-06 with `?measure`, 1902 × 984, paused over the buildings at t = 5 s:

  | Scene | GPU | JavaScript |
  |---|---|---|
  | Sky only | 1.1 ms | 0.3 ms |
  | + terrain | 1.8 ms | 1.1 ms |
  | + terrain + buildings | 3.5 ms | 3.3 ms |

  The clouds (step C1, full resolution) were measured the same day at the start of the path
  (t = 0, paused): GPU 1.8 ms without them, 4.3 ms with them, 4.9 ms with them at 1,500 m
  (`?altitude=1500`). So they add about 2.5 to 3 ms; together with the buildings this comes
  close to the budget. With step C2's temporal upscaling, measured at 1920 × 1080 at the same
  spot: 2.5 ms without clouds, 2.8 ms with them; 5.1 ms with them at full resolution
  (`?cloudfx=-TEMPORAL_UPSCALE`). The clouds now take about 0.3 ms. The price is visible grain
  at the cloud edges, since each pixel holds a single sample refreshed every 16 frames.
  Still to look at: JavaScript time while flying (new
  tiles are parsed in the same frames, so frames vary), and updating the tile traversal less
  often than every frame if JavaScript becomes the limit. How to read `?measure`: GPU time from
  timestamp queries; JavaScript time from a run without them, since they slow it; the "total"
  figure includes about 3 ms of waiting for the GPU's reply and overstates the cost.
- **Tile streaming at speed.** At 250 m/s the camera keeps requesting new tiles; a thousand or
  more can be queued while flying. Prefetching along the precomputed path
  ([ADR 0018](adr/0018-f16-at-cruise-speed.md)) is the planned answer.
- **Loading screen.** Allowed by the maintainer as an exception to
  [ADR 0019](adr/0019-no-ui-until-features-are-in.md), like the guidance screen, and to be
  redesigned with the UI. A temporary one (`src/ui/loading.ts`) holds the flight at its start
  until the tile queue has stayed empty for 1.5 s, or for 30 s at most.
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
- **A fork of three-geospatial.** Decided during the cloud stage, by how much of the library's
  internals the cloud port changes ([ADR 0016](adr/0016-patch-takram-for-newer-three.md)).
  Step C1 needed no changes to the library: the cloud code is our own WGSL and uses only the
  atmosphere's public functions.
- **Look of the image.** Tone mapping (AgX for now) and exposure (3 for now). The maintainer
  finds the image short of vividness (2026-10-06). Agreed order: first correct the sources,
  then grade the whole image at the end, once the scene is complete, so the grading is not
  redone as parts change. Done so far: the aerial photographs carry the day's haze under the
  demo's own aerial perspective, so they are corrected (`src/terrain/wgsl/photoGrade.wgsl`):
  haze removed 0.15, contrast 1.2, saturation 1.4, picked by the maintainer from four
  strengths. Still to look at: the uniform grey of the buildings, and at the end colour grading
  and the choice of tone mapping (AgX is muted by design).
- **The horizon in the Hakone area** (2026-10-06). A grey band above the horizon came from the
  clouds' haze reaching up to 8,000 m; the haze now stops at the top of the low clouds, as the
  maintainer chose ([clouds-parity.md](clouds-parity.md)). Dark specks along the horizon line
  were the end of the terrain short of the horizon; fixed by covering 2.5° around the origin
  (172 tiles, 240 MB of textures at 3,000 m). Asked whether to extend the terrain or hide its
  end in fog, as games often do: the terrain is extended, since distant tiles are coarse and
  cheap, the far mountains and coasts are worth seeing, and the physical aerial perspective
  already fades them; fog would cost the clear view for no saving. Beyond the terrain lies a
  sea-level sphere drawn as water (`src/terrain/seaSphere.ts`), in place of the flat disc. The photographs' colour differences (mosaics of different
  dates and seasons, such as an orange strip east of Mount Fuji, present before the correction)
  are left as they are, by the maintainer's decision.
- **Priority after the clouds.** The maintainer finds the clouds good enough for now and the
  ground lagging behind (2026-10-06), so ground quality comes before the remaining cloud
  features. With the area moved to Sagami Bay, Hakone and Mount Fuji
  ([ADR 0028](adr/0028-area-sagami-bay-hakone-fuji.md)), the candidates are water surfaces,
  forests, the photographs (colour, resolution) and terrain shading. Order not decided yet.

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

- `src/scene/placeholderGround.ts`: a flat 200 km disc with a 1 km grid. The terrain
  ([ADR 0026](adr/0026-own-terrain-from-gsi-tiles.md)) now covers the area; the disc, 37 m
  below it, only fills in beyond the terrain's root tiles and can go once the terrain reaches
  the horizon.
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
- Area: central Tokyo first ([ADR 0023](adr/0023-area-central-tokyo.md)), then Sagami Bay,
  Hakone and Mount Fuji, flown higher ([ADR 0028](adr/0028-area-sagami-bay-hakone-fuji.md)).
- Terrain and aerial photographs from GSI, streamed in real time
  ([ADR 0026](adr/0026-own-terrain-from-gsi-tiles.md)). No tile storage of our own is needed.
- Buildings from PLATEAU, untextured with procedural facades, drawn as one batch
  ([ADR 0024](adr/0024-untextured-buildings-with-procedural-facades.md),
  [ADR 0027](adr/0027-batched-building-tiles.md)).
- Clouds, step C1 (below).

Next stages, in the order agreed on 2026-10-05:

1. **Clouds** ([ADR 0013](adr/0013-port-the-clouds-to-tsl.md); which takram features are in:
   [clouds-parity.md](clouds-parity.md)). Steps agreed with the maintainer on 2026-10-06:
   - C1. takram's layers as spherical shells following the earth's curvature; the shape and
     detail noise textures and the weather map; sun and sky light from the atmosphere; the
     multiple-scattering approximation. Done 2026-10-06 (`src/clouds/`), as a full-resolution
     stage after the aerial perspective. takram's three default layers (750–1400 m,
     1000–2200 m, 7500–8000 m), coverage 0.3 (`?coverage=`).
   - C2. A separate cloud pass (colour, transmittance, front distance), temporal accumulation
     (port of `cloudsResolve.frag`), rendering at reduced resolution, blue noise, wind. The
     passes, the resolve and the blue noise are in (2026-10-06): takram's temporal upscaling,
     a quarter of the resolution in each direction filled in over 16 frames, rather than the
     half resolution first planned here. Wind (`?wind=`) and evolution followed the same day,
     which completes C2. The maintainer judged the grain of the temporal upscaling acceptable at
     60 fps (2026-10-06), so takram's method stays as it is.
   - C3. Aerial perspective on the clouds, haze below and between them, and sun and sky light
     by height. Done 2026-10-06; the GPU time is within the measurement noise (about 0.1 ms).
   - C4. Cloud shadows. Done 2026-10-06 ahead of the building shadows, as the maintainer chose:
     takram's cascaded shadow maps, used for the clouds' long-range self-shadowing and for
     shadows on the terrain and buildings through the sun light's shadow node, where building
     shadows can be combined later. About 0.7 ms of GPU at 1920 × 1080. Of that, the shadows on
     the ground take about 0.1 to 0.3 ms (`?groundshadow=0` leaves them out; medians of three
     runs over the buildings: 2.6 ms without clouds, 3.3 ms with clouds but no ground shadows,
     3.5 ms with both). Single runs vary by up to 0.5 ms with the tiles loaded, so compare
     medians of several.
   - C5. Cloud density on the CPU for the path's cloud channel and the shake in clouds; on hold.
     The idea so far: the cloud shape data (weather map, layer settings) lives in files that
     both the GPU and the offline path tool read, so the path's cloud density channel matches
     what is drawn ([ADR 0008](adr/0008-precomputed-flight-path.md)).

   After the main steps and a check of the GPU cost, the takram features still missing are
   added. The ones on in takram's default come first: light shafts (`SHADOW_LENGTH`, required
   by the maintainer; done 2026-10-06), turbulence, ground bounce and accurate sun and sky light
   ([clouds-parity.md](clouds-parity.md)).
2. **Rain** ([ADR 0011](adr/0011-rain-driven-by-relative-wind.md),
   [ADR 0020](adr/0020-effects-by-view.md)).
3. **JSBSim path** with manoeuvres, replacing the placeholder.
4. **Night.** Stars, moon and adaptive exposure fit between any stages; town lights to be
   reconsidered for the new area.

Ground quality now comes before the remaining cloud features and the stages above (see
"Priority after the clouds"): water, forests, the photographs and terrain shading. Also not
yet placed: tile prefetching along the path, and a check of temporal anti-aliasing at 250 m/s.

Later: the cockpit view, quality presets, the UI, the README and video, publishing.
