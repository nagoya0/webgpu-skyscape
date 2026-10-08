# 41. Night: exposure by the sun's altitude, and moonlight

- Status: Accepted
- Date: 2026-10-08

## Context

The exposure before tone mapping was fixed at the day's value, so the night was black: takram's
sky is lit by the sun only, and the terrain had no light once the sun had set. Raising the final
exposure showed the stars, but the sky and the terrain banded badly: at night the scene's
luminance is about a hundred thousand times smaller than by day, too small for the half-float
images it passes through. Lighting the night also needed the moon, which takram supports but
leaves off: a moon light for the terrain, and moonlight scattered in the sky and the aerial
perspective, always at the full moon's brightness (its code notes the phase as a TODO).

A photograph of a moonlit landscape exposed in full looks like daytime; photographers show the
night a few stops darker, often bluer.

## Decision

- **Pre-exposure.** The scene's luminance is multiplied early, through takram's luminance scale,
  which a patch makes a uniform. All of takram's light passes through it (sky, sun, moon, stars,
  their light on the terrain and the clouds, the aerial perspective), so it acts as the camera's
  exposure while keeping values within half-float precision. The final exposure stays the day's.
- **By the sun's altitude** (the maintainer chose this over exposure from the image's own
  brightness, which would change at every cloud). From the day (the sun above +5°) to the night
  (below −12°) the factor rises on a log scale to make up the night's darkness, less 2.5 stops at
  night and part of that at dusk, as photographers do (the maintainer, 2026-10-08).
- **Moonlight**: the moon lights the terrain and is scattered in the sky and the aerial
  perspective, at takram's full-moon brightness whatever the phase (the maintainer: the phase
  does not matter).
- **Fewer stars**: takram boosts the stars a thousandfold; the demo uses 30, about what a city
  dweller sees, down to the third or fourth magnitude (the maintainer, 2026-10-08).

## Consequences

- Dusk darkens as the sun sets, and a moonlit night shows the terrain dimly with the stars.
  Frame times did not change (GPU about 2.3 ms at 1262 × 600 either way).
- Light added later outside takram, such as city lights, has to be multiplied by the same factor.
- Still to do: the clouds are lit by the sun only and show black at night; a faint light for a
  night without the moon; city lights.

## Implementation details, not discussed

- `src/render/exposure.ts` holds the curve: a smoothstep between the two altitudes, applied as an
  exponent of the night factor of 100,000.
- The sun's altitude is taken at the frame's origin, against the ellipsoid's normal.