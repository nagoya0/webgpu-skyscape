# 35. The course: a loop of five to six minutes from Sagami Bay to Mount Fuji and back

- Status: Accepted
- Date: 2026-10-07
- Amended: 2026-10-08 (the placeholder racetrack removed with the Tokyo area, [ADR 0036](0036-remove-the-tokyo-area.md))
- Replaces the placeholder course of [ADR 0028](0028-area-sagami-bay-hakone-fuji.md)

## Context

The flight path is computed with JSBSim ([ADR 0008](0008-precomputed-flight-path.md)); its
F-16 now flies headings, heights and turns under a small autopilot. The placeholder racetrack of
ADR 0028 was kept simple on purpose. The course had still to be chosen, together with the
demo's length and whether it loops (both open in the ideas file).

Facts that shaped the proposal: the low cloud layer starts at 750 m, so the aircraft can fly
below the clouds only over the sea and the plain around Odawara, as the Hakone mountains reach
about 1,400 m. From Sagami Bay off Odawara to Mount Fuji is about 46 km, about three minutes at
250 m/s. At the default scene time (16:30 JST in October) the sun is low in the west-south-west.

## Decision

- **The demo loops.** The path ends where it starts, so it can run without stopping.
- **About five to six minutes** for one lap: the whole way out and back.
- **The lap, in this order** (proposed by Claude, agreed by the maintainer):
  1. Over Sagami Bay below the clouds, at cruise speed from the start.
  2. A climb through the clouds to about 3,000 m.
  3. A roll after coming out above the clouds.
  4. Over Hakone towards Mount Fuji.
  5. A turn beside Mount Fuji with a high load factor.
  6. Back towards the sea, down below the clouds again.
- **Speed changes**: the lap includes accelerating and slowing down, as the maintainer asked;
  it starts at cruise speed.

## Consequences

- The maintainer accepted the first version on screen (2026-10-07), and it is the default path
  of the Hakone area.
- A computed path does not end exactly where it starts; the difference has to be closed so the
  loop does not jump.
- The course leaves the placeholder's strip, so tiles along the whole lap have to load in time;
  prefetching along the path becomes more useful.
- The cloud the climb goes through was found with the default cloud settings; with other cloud
  settings (`?cloudamount=`, `?coverage=`) the climb may miss it.

### Implementation details, not discussed

- The lap is 374 s: 500 m over the bay; up to 1,400 m and level through the cumulus for about
  5 s; on up to 2,900 m; a roll at 180°/s after a pull-up; 320 m/s towards Mount Fuji; a turn
  at 80° of bank (about 6.5 G) south-east of the summit; 320 m/s back north of Hakone; down to
  500 m, slowing to 250 m/s; a turn at 70° over the bay onto the start's line. The waypoints
  and targets are in `tools/flightpath/fly.py`.
- The lap's end misses its start by about 9 m and 4 m of height; the difference is spread over
  the last 10 s.
- The F-16 model's speed brake is not used: it hardly slows the aircraft and gives an angle of
  attack of -5° in level flight. The aircraft slows at idle and in hard turns.
- The placeholder racetrack stays for the Tokyo area, which has no course, and as
  `?path=racetrack`; its seam fault stays with it.
