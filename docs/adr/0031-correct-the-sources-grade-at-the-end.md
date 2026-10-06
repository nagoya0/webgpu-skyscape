# 31. Correct the sources first; grade the whole image at the end

- Status: Accepted
- Date: 2026-10-07

## Context

The maintainer found the image short of vividness (2026-10-06) and asked whether to grade the
colours in post-processing at the end, or to raise the aerial photographs' vividness and
contrast.

The GSI aerial photographs are taken from high up and carry the haze of the day: lifted, low in
contrast and saturation. The demo adds its own aerial perspective on top, so without a
correction the haze is applied twice. Grading after tone mapping changes the sky, the clouds and
the ground together, and has to be redone whenever one of them changes.

## Decision

- Each source is corrected first; the whole image is graded at the end, once the scene is
  complete, together with the choice of tone mapping (AgX for now, which is muted by design).
- The aerial photographs are corrected (`src/terrain/wgsl/photoGrade.wgsl`): haze removed 0.15,
  contrast 1.2 and saturation 1.4, picked by the maintainer from four strengths. The values can be
  changed with `?photodehaze=`, `?photocontrast=` and `?photosat=`.
- Colour differences between the photographs, which are mosaics of different dates and seasons
  (such as an orange strip east of Mount Fuji, already there before the correction), are left
  as they are. The maintainer judged that forcing them to match is not worth it.

## Consequences

The correction applies to the photographs only; the sky, the clouds and the water are not
changed by it.
