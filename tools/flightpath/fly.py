"""Flies JSBSim's F-16 under the autopilot and writes the flight path for the demo (ADR 0008).

Run from the repository root:
    tools/flightpath/.venv/Scripts/python tools/flightpath/fly.py

For now one test flight with turns, to check the autopilot and the playback (step 3 of the JSBSim
stage). Writes public/paths/turns.json, read by the demo with ?path=turns.
"""

import json
from pathlib import Path

from aircraft import FT, Autopilot, body_to_ned, create_fdm

RATE = 120  # Hz, JSBSim's integration rate
OUTPUT_RATE = 30  # Hz, samples in the path
SECONDS = 100
START = {
    "latitude": 35.23,  # the Hakone origin (src/areas.ts)
    "longitude": 139.02,
    "height": 3000.0,  # m above the ellipsoid
    "speed": 250.0,  # m/s (ADR 0018)
    "heading": 293.0,  # degrees, the placeholder course's first leg
}
# From these times in seconds, the autopilot's targets: heading and the bank allowed to reach it
# (degrees), and height (metres above the ellipsoid).
PLAN = [
    (0, {"heading": 293.0, "max_bank": 60.0}),
    (10, {"heading": 203.0, "max_bank": 60.0}),  # 90 degrees left, 2 G
    (40, {"heading": 293.0, "max_bank": 80.0}),  # 90 degrees right, about 6 G
    (60, {"heading": 323.0, "max_bank": 30.0}),  # a gentle turn
    (75, {"height": 3300.0}),  # a climb of 300 m
]
OUTPUT = Path(__file__).resolve().parents[2] / "public" / "paths" / "turns.json"


def main() -> None:
    fdm = create_fdm(**START, rate=RATE)
    autopilot = Autopilot(fdm)
    every = RATE // OUTPUT_RATE
    plan = list(PLAN)
    latitude, longitude, height, attitude, load_factor = [], [], [], [], []
    previous = None
    for step in range(SECONDS * RATE + 1):
        while plan and step >= plan[0][0] * RATE:
            for name, value in plan.pop(0)[1].items():
                setattr(autopilot, name, value)
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
        if step % (5 * RATE) == 0:
            print(
                f"{step / RATE:5.0f} s  h {fdm['position/h-sl-ft'] * FT:7.1f} m"
                f"  v {fdm['velocities/vt-fps'] * FT:6.1f} m/s"
                f"  heading {fdm['attitude/psi-deg']:6.1f}  bank {fdm['attitude/phi-deg']:6.1f}"
                f"  alpha {fdm['aero/alpha-deg']:5.2f}  beta {fdm['aero/beta-deg']:5.2f}"
                f"  load {fdm['accelerations/Nz']:4.2f} G"
            )
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
