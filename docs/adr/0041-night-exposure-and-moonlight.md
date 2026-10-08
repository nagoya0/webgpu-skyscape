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

## Update 2026-10-08: the clouds in moonlight

The clouds showed black at night, lit by the sun only. They are now lit by one body, whichever
lights them more: the moon once the sun is 8° below the horizon, at the same full-moon
brightness, with their shadow maps following it, so the terrain gets the clouds' shadow in
moonlight too. Lighting by both bodies at once would double the clouds' cost. Frame times did not
change.

## Implementation details, not discussed

- `src/render/exposure.ts` holds the curve: a smoothstep between the two altitudes, applied as an
  exponent of the night factor of 100,000.
- The sun's altitude is taken at the frame's origin, against the ellipsoid's normal.

## Update 2026-10-08: a night without the moon

With the moon below the horizon the night showed only the stars. The night sky now has a faint
glow of its own, as airglow and the light of towns give it: about a suburban sky, 0.003 cd/m²
overhead and 0.015 cd/m² at the horizon, a little warm, and 0.02 lux on the ground. It is in
physical units under the same luminance scale, so it does not show by day and keeps its
proportion to the moonlight, under which it hardly shows. The maintainer compared it at one, two,
three and ten times and chose once: twice read better without the moon but lit the horizon too
much under a full moon. The clouds are not lit by it and show as silhouettes.

## Update 2026-10-08: city lights

- **From the map.** Points of light along the roads and on the buildings of GSI's vector tiles,
  the tiles already loaded for the water. Each terrain tile takes the lights of its own vector
  tile, so near tiles show small streets and buildings and far ones the main roads; far tiles
  space their lights more widely, each brighter.
- **Only in towns.** Mountain roads lit as lines of light looked wrong: from the air, street
  lamps and traffic show in towns (the maintainer). Roads are lit only inside the densely
  inhabited districts (人口集中地区) of the National Land Numerical Information, 2020 census, cut
  to 60 km around the course (`public/places/urban-areas.json`, built by
  `scripts/build-urban-areas.mjs`), brighter the denser the district. Buildings outside them
  keep a quarter of their light.
- **As points.** Each light is a small round point of a luminous intensity in candelas, dimmer
  with the square of the distance, under the same luminance scale, drawn additively before the
  aerial perspective so that haze dims far lights. They switch on as the sun sets (from 1° to 6°
  below the horizon) and are not drawn by day.
- **Look**, chosen by the maintainer: all intensities at 0.3 of the first values, so that fewer
  points saturate; each light's own brightness (up to 1.5 stops either way, larger when
  brighter), colour (warm, white or bluish LED for buildings) and a few metres of offset; and
  twinkling at its own pace, 0.3 to 1.5 times a second, ±40 % near and ±80 % 20 km away.
- **Left for later:** far towns show as thin lines of points on the horizon; a screen-space glow
  around bright lights is to come with the colour grading.
- Frame times: no change on the GPU; about 0.4 ms more on the CPU at night, building the lights
  as tiles load.

## Update 2026-10-08: the exposure follows the moon

Under a full moon the terrain looked too bright, and without the moon too dark: a full moon
lights the ground about twelve times more than the night sky alone. At night the exposure now
also follows the moon, as an eye or a camera adapts, part of the way: the night's illuminance on
the ground is estimated from the moon's altitude (0.25 lux for a full moon overhead) and the night
sky's 0.02 lux, and of its difference from a reference of 0.07 lux the exposure makes up half
where the night is darker and nine tenths where it is brighter (the maintainer chose these from
side-by-side views). The gap between a full moon and none on screen fell from about twelve
times to about five and a half. By day and at dusk nothing changes.

The night sky's glow at the horizon was lowered from 0.015 to 0.0075 cd/m² (two and a half
times the zenith, as under mild light pollution), which the maintainer found more natural without
the moon. Under a high moon the moonlit sky outshines the glow, so it changes little there.