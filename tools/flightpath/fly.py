"""Flies JSBSim's F-16 and writes the flight path for the demo (ADR 0008).

Run from the repository root:
    tools/flightpath/.venv/Scripts/python tools/flightpath/fly.py

For now one level flight under the autopilot, to check the playback (step 2 of the JSBSim
stage). Writes public/paths/straight.json, read by the demo with ?path=straight.
"""

import json
from pathlib import Path

from aircraft import FT, Autopilot, body_to_ned, create_fdm

RATE = 120  # Hz, JSBSim's integration rate
OUTPUT_RATE = 30  # Hz, samples in the path
SECONDS = 120
START = {
    "latitude": 35.23,  # the Hakone origin (src/areas.ts)
    "longitude": 139.02,
    "height": 3000.0,  # m above the ellipsoid
    "speed": 250.0,  # m/s (ADR 0018)
    "heading": 293.0,  # degrees, the placeholder course's first leg
}
OUTPUT = Path(__file__).resolve().parents[2] / "public" / "paths" / "straight.json"


def main() -> None:
    fdm = create_fdm(**START, rate=RATE)
    autopilot = Autopilot(fdm)
    every = RATE // OUTPUT_RATE
    latitude, longitude, height, attitude, load_factor = [], [], [], [], []
    previous = None
    for step in range(SECONDS * RATE + 1):
        if step % every == 0:
            latitude.append(round(fdm["position/lat-geod-deg"], 9))
            longitude.append(round(fdm["position/long-gc-deg"], 9))
            height.append(round(fdm["position/geod-alt-ft"] * FT, 3))
            q = body_to_ned(fdm)
            # Keep the quaternions on one side, so neighbours are close for interpolation.
            if previous and sum(a * b for a, b in zip(q, previous)) < 0:
                q = tuple(-c for c in q)
            previous = q
            attitude.extend(round(c, 6) for c in q)
            load_factor.append(round(fdm["accelerations/Nz"], 3))
        autopilot.update(1 / RATE)
        fdm.run()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "interval": 1 / OUTPUT_RATE,
        "loop": False,
        "latitude": latitude,
        "longitude": longitude,
        "height": height,
        "attitude": attitude,
        "loadFactor": load_factor,
    }
    OUTPUT.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(f"{OUTPUT}: {len(latitude)} samples, {OUTPUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
