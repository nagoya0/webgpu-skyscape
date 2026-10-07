# 11. Rain moves with the relative wind, not with gravity

- Status: Accepted; drops in the air dropped, and the views settled by
  [ADR 0020](0020-effects-by-view.md) (2026-10-07); the drops simulated on the CPU and tuned with
  the maintainer (2026-10-07)
- Date: 2026-10-03

## Context

When an aircraft flies through rain, the airflow from its own speed is much stronger than gravity.
Drops on the canopy are pushed backwards, not down.

## Decision

- **Drops on the canopy.** Drops move with the relative wind, outwards from the direction of
  travel, plus a little gravity, and nearby drops merge. When drawn, each drop refracts the scene
  behind it, and the area under it is slightly blurred. References: the ShaderToy shader
  "Heartfelt" (Martijn Steinrucken), with its flow direction changed from gravity to the wind
  direction, and the Codrops rain experiments (Lucas Bebber).
- **Simulated on the CPU, drawn on the GPU** (2026-10-07; the first plan was a compute shader).
  Each frame the drops are moved and merged on the CPU, then drawn as a height map that the last
  post-processing pass refracts the image through. There are a few hundred drops at most, few
  enough for the CPU, and merging, which needs neighbouring drops, is simple there. Measured
  deep in cloud at 1920 × 1080: about 400 drops, 0.33 ms of CPU, no GPU cost beyond the runs'
  spread. If many more drops are wanted, or the CPU's time runs short, the simulation moves to
  the GPU and the drawing stays.
- **Where the drops sit depends on the view** ([ADR 0020](0020-effects-by-view.md)). In the
  first-person view the drops cover the whole screen as a game-style shortcut, and flow outwards
  radially from the direction of travel; in the cockpit view the drops sit on the canopy glass.
- **No drops in the air.** Streaks of rain in the air, coming from the direction of travel, were
  part of the first plan; the maintainer decided against them on 2026-10-07.
- **The drops' course through a cloud**, as the maintainer described and then tuned it by eye
  (2026-10-07):
  - Drops land only well inside a cloud: when the aircraft is more than half way into it (see
    "in cloud" below), and more the deeper it is.
  - Drops land small; now and then a large one lands. Larger drops otherwise only grow by
    merging.
  - The smallest drops cling. Larger ones are blown outwards, faster the faster the aircraft
    flies and the larger they are, and gravity pulls them down a little.
  - A moving drop is drawn out behind into one continuous streak, rather than leaving small drops
    along its path.
  - Drops meander mildly, as if following grime on the glass, rather than running in straight
    radial lines.
  - Out of the cloud no new drops land and the ones left evaporate; in the cloud they evaporate
    at half that rate.
- **In cloud**: how deep in cloud the aircraft is comes from the clouds' density at the aircraft,
  computed each frame on the CPU from the same data as the GPU's clouds (cloud step C5), not from
  the path data ([ADR 0008](0008-precomputed-flight-path.md)) as first planned.
- On entering a cloud, the image first turns white and loses contrast.

## Consequences

- The drops need the aircraft's speed and the camera's attitude each frame, for the flow and for
  gravity on the screen.
- The cockpit view needs the drops in the canopy's surface coordinates instead of the screen's.

### Implementation details, not discussed

The values below were set while tuning; the maintainer judged the result by eye, not each value.
In `src/effects/drops.ts` and `src/effects/inCloud.ts`:

- How deep in cloud: 1 − exp(−extinction / 0.01 per metre), followed over 0.2 s.
- Landing: up to 210 drops a second, scaled from 0 at depth 0.5 to the full rate at 1. Radii in
  screen heights (the screen spans 2): 0.008 to 0.02 from a cubic distribution, 1.5 % between
  0.025 and 0.045; merged drops up to 0.09. At most 1,500 drops.
- Flow: drops up to radius 0.009 cling; the flow grows to full speed at radius 0.03; full speed
  is 4 screen heights a second at the screen's edge at 250 m/s. Gravity 0.6 screen heights a
  second.
- Streak: as long as the drop travels in 0.08 s, at most 40 radii, narrowing to a third.
- Meandering: a fixed pattern of two sines turns the path by up to about 7° and slows it by up
  to 20 %; each drop also wanders by a random walk (0.15 radians per √second, 1.5 s memory).
- Evaporation: radius 0.006 a second out of the cloud, half in it.
- Look: each outline bent by two random harmonics; refraction 0.15 of the slope in screen
  coordinates; a five-tap blur; the rim darkened by up to 30 %; a small glint towards the upper
  left. Drawn after the temporal anti-aliasing, so the drops are not smeared by its history.
