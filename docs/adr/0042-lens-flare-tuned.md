# 42. The lens flare, tuned

- Status: Accepted
- Date: 2026-10-09

## Context

takram's lens flare runs on the whole HDR image before tone mapping: the sky, the terrain and
the sea with the sun's glint, the city lights and the clouds. It has a bloom, ghosts, a halo and
glare, all made from the parts of the image above a threshold. The demo used takram's defaults.

Tuning from screenshots taken headless at 1262 × 600 did not match what the maintainer saw in the
browser, so a temporary panel of sliders was put in the settings window to tune the flare there,
while flying; it was removed once the values were chosen.

## Decision

The values, chosen by the maintainer in the browser (2026-10-09); the others stay takram's:

| Part | takram | Now |
|---|---|---|
| Bloom intensity | 0.05 | 0.355 |
| Bloom spread (blend amount) | 0.85 | 0.583 |
| Ghost intensity | 1e-5 | 8.91e-5 |
| Halo arc spread | (none) | 0.1 rad |
| Glare length (size scale x) | 1.5 | 1.0 |

- The bloom is stronger but spreads less widely: at 0.85 the glints' bloom reached across the
  sky and whitened it.
- The halo's arc is smeared a little along its ring. takram's halo has no setting for it; a patch
  averages seven copies of the halo rotated about the screen's centre by up to the arc spread
  either way.

## Implementation details, not discussed

- The patch of `@takram/three-geospatial` also turns the ghosts' spread and the halo's radius and
  ring into uniforms, left at takram's values (they were tuned in the panel but not changed).
- The values are set on the lens flare node in `src/render/pipeline.ts`.
- GPU time at the backlit test view (2026-10-09 15:30, t=16.4) was 2.75 ms against 2.62 ms
  without the new values, within the noise; that comparison already had the patch's seven halo
  samples on both sides.