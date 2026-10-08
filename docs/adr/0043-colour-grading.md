# 43. Colour grading

- Status: Accepted
- Date: 2026-10-09

## Context

ADR 0031 left the grading of the whole image to the end, once the scene was complete. The
maintainer wanted a more pleasant blue in the day's sky. Changing the haze's height profile made
little difference (ideas.md), so the blue was left to the grading.

## Decision

- **Screen based** (the maintainer): the same grade for every pixel, after the tone mapping and
  before the temporal anti-aliasing, with no mask for the sky; blues anywhere change alike.
- The controls: white balance (temperature and tint), contrast, saturation, vibrance, the hue
  and saturation of blues, and colours added to the shadows and the highlights. With the neutral
  settings the image is unchanged (checked against captures: the difference was within the
  capture-to-capture noise).
- **The values**, chosen by the maintainer in the browser with a temporary panel, since removed:
  contrast 1.3, blue hue shifted by 0.01 of a turn, blue saturation 1.1; the rest neutral.
- The post effects switch in the settings window (ADR 0037) turns the grading off with the others.
- The moonlight keeps the sun's colour, as takram computes it: a moonlit night looks like a dark
  day, as in a photograph. A bluer night, as the eye sees it, was offered and declined (the
  maintainer, 2026-10-09).

## Implementation details, not discussed

- `src/render/wgsl/colorGrade.wgsl` works on gamma-encoded values (2.2): white balance as channel
  gains, contrast about 0.5, saturation and vibrance against the luma, blues through HSV with a
  weight fading a sixth of a turn either side of blue, and the tints by the luma.
- No change in GPU time at the test view (2.42 ms against 2.49 ms without it, 1262 × 600).