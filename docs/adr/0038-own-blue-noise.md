# 38. Our own blue noise instead of takram's STBN

- Status: Accepted
- Date: 2026-10-08

## Context

The clouds' ray marching and takram's atmosphere jitter their samples with blue noise, which
temporal anti-aliasing then averages. Both used takram's spatiotemporal blue noise (STBN), a
128 x 128 x 64 file that takram loads from its GitHub repository at run time.

Neither takram's repository nor its package states where that file comes from or under which
licence. An issue on takram's repository (takram-design-engineering/three-geospatial#117, closed
without a reply) says it is cut from NVIDIA's Spatiotemporal Blue Noise SDK, whose licence allows
only non-commercial use for research or evaluation, and forbids use in open-source projects
under its commercial terms. That was not checked against NVIDIA's files: if it were not NVIDIA's,
the file's origin would still be unknown.

While checking for memory leaks the same file also showed that takram's node loads it again for
every material it is set up in, which leaked about 1 MB per terrain tile (fixed before this
decision by loading it once in the clouds).

## Decision

- The demo uses blue noise made by this project (the maintainer, 2026-10-08: if it can be made,
  that is better than a file of unknown origin), in the same layout, bundled at
  `public/noise/blue-noise.bin` under the project's MIT licence.
- takram's atmosphere loads it too, through a patch of the STBN address in
  `@takram/three-geospatial`, so no blue noise is loaded from GitHub.

## Consequences

- One external download fewer at run time; the file is 1 MB.
- The noise is an approximation of spatiotemporal blue noise: compared with takram's file, a
  little more of its power is at low frequencies (1.6 % against 0.4 % below a fifth of the
  highest frequency) and an average over 8 frames is a little less smooth (0.040 against 0.034
  standard deviation). The maintainer compared the image before and after, also in motion, and saw
  no difference (2026-10-08).

## Implementation details, not discussed

- `tools/bluenoise/make_blue_noise.py` (numpy): one 128 x 128 blue noise texture by the
  void-and-cluster method; frame k adds k times the golden ratio to every value, wrapping at 1.
- The patch points takram's default STBN address at `noise/blue-noise.bin`, relative to the page.