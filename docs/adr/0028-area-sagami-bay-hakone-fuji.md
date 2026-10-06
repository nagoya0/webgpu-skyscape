# 28. The area is Sagami Bay, Hakone and Mount Fuji, flown higher

- Status: Accepted
- Date: 2026-10-06
- Supersedes [ADR 0023](0023-area-central-tokyo.md); changes the area size and altitude of
  [ADR 0018](0018-f16-at-cruise-speed.md)

## Context

[ADR 0023](0023-area-central-tokyo.md) chose central Tokyo, where buildings show best from low
altitude. After the clouds and the atmosphere reached a high level, the maintainer judged the
city to be the weak part of the image (2026-10-06):

- PLATEAU's textured buildings do not fit the memory budget
  ([ADR 0024](0024-untextured-buildings-with-procedural-facades.md)), so the buildings have
  procedural facades. Flying low makes it easy to see that the facades are procedural, so the
  low altitude chosen to show the buildings works against them.
- Along the course, buildings change their level of detail, and some disappear and reappear.

Three directions were discussed: stay in Tokyo and fix the tile streaming; the coast and
mountains around Sagami Bay, Hakone and Mount Fuji; or the open sea only. The maintainer
preferred the coast and mountains, flown higher than in Tokyo, where the ground needs less
detail to look right.

A trial (`?area=hakone`, 2026-10-06) set the origin north of Lake Ashi, covered the terrain out
to about 1.5° with zoom-8 root tiles, left out the buildings and flew at 3,000 m. Mount Fuji
and the cumulus below read well with the GSI terrain and aerial photographs only. It loaded
about as many terrain tiles as Tokyo (164 to 180 tiles, 229 to 252 MB of textures), since a
higher camera needs less detail below it, and took about 2.9 ms of GPU and 1.4 ms of JavaScript
per frame at 1920 × 1080 on the development machine. The maintainer found it far better looking
than the city.

## Decision

- The area is the coast and mountains from Sagami Bay over Hakone to Mount Fuji
  (`src/areas.ts`, `?area=hakone`, now the default).
- The aircraft flies higher than in Tokyo: 3,000 m for now.
- The course for now: from the sea side towards Mount Fuji, a turn, back towards the sea, and
  again, repeated. It is kept simple on purpose, so that rendering problems are easy to look
  into. The placeholder racetrack flies it: heading 293°, straights of 120 s, 45° bank.
- Central Tokyo stays selectable with `?area=tokyo`, with the PLATEAU buildings.

## Consequences

- The area is larger than the 30 to 50 km of ADR 0018: the course spans about 43 km from end
  to end (30 km straights, turns of 6.4 km radius), and the terrain reaches towards the horizon,
  about 200 km away from 3,000 m. The aircraft stays within about 22 km of the origin, which the
  local frame ([ADR 0017](0017-local-world-frame.md)) handles.
- The PLATEAU buildings, the building batching and the facade shader
  ([ADR 0024](0024-untextured-buildings-with-procedural-facades.md),
  [ADR 0027](0027-batched-building-tiles.md)) apply to the Tokyo area only.
- Water (Sagami Bay, Lake Ashi) and forests cover much of the image, so how to draw them moves
  up in the order of work ([ideas](../ideas.md)).
- The cloud layers may need other heights once the course is set; Mount Fuji's summit is at
  3,776 m.
