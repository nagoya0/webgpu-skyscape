# 33. More clouds to fly among, with a choice of amount

- Status: Accepted
- Date: 2026-10-07
- Amended: 2026-10-08 (the amount changes while the demo runs; named in the UI, [ADR 0037](0037-ui.md))

## Context

The maintainer found the cloud layers too separate: flown at 3,000 m, takram's default layers
showed a flat sea of low clouds (tops at 2,200 m), empty sky up to a thin high layer at 7,500 m,
and the course never passed through a cloud. Flying through clouds is one of the demo's main
moments, so they wanted more clouds, if the cost allowed.

takram's clouds aim at views from near the ground. Dividing clouds by height is sound (low,
middle and high clouds), but real cumulus tops vary and some grow into the middle levels, and
takram's defaults have no middle layer.

Variants were compared at four points of the course, with the GPU time at 1920 × 1080 (median of
three runs): takram's layers 3.34 ms at t=110; the chosen layers within the runs' spread of
0.1 to 0.2 ms.

## Decision

- **Layers** (`cloudLayers()` in `src/clouds/clouds.ts`):
  - The second low layer reaches 4,000 m instead of 2,200 m, so cloud tops vary and some rise
    above the course.
  - A middle layer at 3,500 to 5,000 m, on the weather map's fourth channel.
  - The thin high layer stays as takram's.
- **Amount** (`?cloudamount=`): the weather map is raised to a power in the low and middle
  layers, which thins them out. `few` cubes it, `normal` (the default, chosen by the maintainer)
  squares it, `many` leaves it as takram's. `?coverage=` still changes all layers together.
  Since 2026-10-08 both can change while the demo runs, in the settings window: the amount as
  雲の大きさ (small, normal, large), the coverage as 雲の量 ([ADR 0037](0037-ui.md)).
- **The haze** keeps its top at 2,200 m, the top of takram's low layers, as agreed on 2026-10-06
  ([clouds-parity.md](../clouds-parity.md)); it no longer follows the top of the shadow-casting
  layers.

## Consequences

- The clouds differ from takram's defaults on purpose; [clouds-parity.md](../clouds-parity.md)
  lists the difference.
- In the four views compared, the course at 3,000 m passed beside the tall clouds, not through
  them; where it flies through is for the course to decide.
- The cloud shadow maps now cover 750 to 5,000 m.

### Implementation details, not discussed

- The middle layer's density is half the low layers' (0.1 against 0.2); its other settings are
  the low layers'.
