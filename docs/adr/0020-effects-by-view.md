# 20. Effects by view: the aircraft's in the first-person view, the pilot's in the cockpit view

- Status: Accepted
- Date: 2026-10-05

## Context

The first-person camera ([ADR 0009](0009-camera-separate-from-path.md)) shows the view from the
aircraft with nothing of the aircraft on screen. Head lag and the eye moving under load were
tried in it. With no cockpit on screen, a lagging camera only makes the aircraft look sluggish,
and the eye's movement is not visible at all: both only mean something relative to a cockpit in
front of the viewer. A cockpit view is planned for later; when is not decided.

## Decision

Effects are added by what causes them:

- **First-person view:** only what happens to the aircraft.
- **Cockpit view:** that, plus what happens to the pilot's body.

| Effect | Cause | First-person | Cockpit |
|---|---|---|---|
| Shake in turns | Airframe buffet | Yes | Yes |
| Shake in clouds | Turbulence moving the aircraft | Yes | Yes |
| Head lag, pitch only | Pilot's body | No | Yes |
| Eye moving down above 1 G and up below it | Pilot's body | No | Yes |
| Vignetting under G ([ADR 0008](0008-precomputed-flight-path.md)) | Pilot's body (grey-out) | No | Yes |
| Bloom, lens flare | Optics | Yes | Yes |
| Rain drops on the canopy ([ADR 0011](0011-rain-driven-by-relative-wind.md)) | See below | Yes, on the screen | Yes, on the glass |

Rain drops on the canopy are a deliberate game-style shortcut in the first-person view. The drops
sit on the whole screen and flow outwards radially, with a little gravity added. The screen is
not the canopy and the canopy is not flat, but this is accepted as a game effect. In the cockpit
view the drops sit on the canopy glass itself.

## Consequences

- The first-person camera's head lag and eye movement default to 0. The code stays for the
  cockpit view.
- ADR 0008 listed sinking and vignetting as first-person effects; they move to the cockpit view.
- ADR 0011's screen-sized drop buffer is the first-person version. The cockpit version needs the
  drops in the canopy's surface coordinates instead.
