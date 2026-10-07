"""Flies JSBSim's F-16 around the demo's course and writes the flight path (ADR 0008, ADR 0035).

Run from the repository root:
    tools/flightpath/.venv/Scripts/python tools/flightpath/fly.py

Writes public/paths/course.json, read by the demo with ?path=course.

The course is a list of legs. Each leg sets some of the autopilot's targets when it starts and
ends when its condition is met: a waypoint reached, a heading reached, a roll finished or a time
passed. The lap ends where the aircraft passes the start again; the small difference left there
is spread over the lap's last seconds, so the path loops without a jump.
"""

import json
import math
from pathlib import Path

from aircraft import FT, Autopilot, body_to_ned, create_fdm

RATE = 120  # Hz, JSBSim's integration rate
OUTPUT_RATE = 30  # Hz, samples in the path
MAX_SECONDS = 600
BLEND_SECONDS = 10  # over which the loop's closing difference is spread
CRUISE = 250.0  # m/s (ADR 0018)

# Over Sagami Bay off Odawara, below the low clouds (from 750 m), heading west-north-west.
START = {"latitude": 35.210, "longitude": 139.2393, "height": 500.0, "speed": CRUISE, "heading": 285.0}

# Each leg: targets to set at its start, and how it ends. Waypoints are (latitude, longitude).
LEGS = [
    # 1. Over the bay below the clouds.
    {"set": {"heading": 285.0, "height": 500.0}, "seconds": 12},
    # 2. Climb through the clouds to 3,000 m. With the default clouds a cumulus stands from about
    # 1,000 to 2,200 m over the coast at Odawara; the longest straight line through it denser than
    # 0.005 per metre is about 1.2 km, at 1,300 to 1,500 m (found with ?debug). The climb levels at
    # 1,400 m along that line, then goes on up towards Lake Ashi.
    {"set": {"height": 1400.0, "max_climb": 15.0}, "to": (35.2165, 139.1579), "within": 300},
    {"to": (35.2165, 139.1281), "within": 300},
    {"set": {"height": 3000.0}, "climb_to": 2900.0, "towards": (35.215, 139.02)},
    # 3. A roll above the clouds.
    {"roll": 180.0},
    # 4. Over Hakone towards Mount Fuji, accelerating.
    {"set": {"speed": 320.0, "max_climb": 5.0}, "to": (35.315, 138.765)},
    # 5. A hard turn to the right beside Mount Fuji (summit 35.361, 138.727), slowing down.
    {"set": {"heading": 95.0, "max_bank": 80.0, "speed": CRUISE}, "heading_within": 3.0},
    # 6. Back north of Hakone, then down below the clouds towards Odawara and the bay.
    {"set": {"max_bank": 60.0, "speed": 320.0}, "to": (35.29, 139.07)},
    {"set": {"height": 500.0, "max_climb": 8.0}, "to": (35.268, 139.17)},
    {"set": {"speed": CRUISE}, "to": (35.237, 139.313)},
    # Over the bay, a turn to the right at 70 degrees of bank (radius about 2.3 km), placed so
    # that it ends on the start's line about 8 km before the start; then along it.
    {"set": {"heading": 200.0, "max_bank": 70.0}, "heading_within": 10.0},
    {"end_at_start": True},
]

M_PER_DEG_LAT = 110_950.0


def offset_m(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[float, float]:
    """North and east metres from point 1 to point 2, on a local flat approximation."""
    north = (lat2 - lat1) * M_PER_DEG_LAT
    east = (lon2 - lon1) * M_PER_DEG_LAT * math.cos(math.radians((lat1 + lat2) / 2))
    return north, east


def main() -> None:
    fdm = create_fdm(**START, rate=RATE)
    autopilot = Autopilot(fdm)
    every = RATE // OUTPUT_RATE
    legs = list(LEGS)
    leg: dict | None = None
    leg_start = 0.0
    samples: list[dict] = []
    previous = None
    start_heading = math.radians(START["heading"])
    left_start = False

    for step in range(MAX_SECONDS * RATE + 1):
        t = step / RATE
        lat, lon = fdm["position/lat-geod-deg"], fdm["position/long-gc-deg"]
        height = fdm["position/h-sl-ft"] * FT

        # The current leg: finished?
        done = leg is None
        if leg is not None:
            if "seconds" in leg:
                done = t - leg_start >= leg["seconds"]
            elif "climb_to" in leg:
                done = height >= leg["climb_to"]
            elif "roll" in leg:
                done = autopilot.roll_rate == 0.0
            elif "heading_within" in leg:
                error = (autopilot.heading - fdm["attitude/psi-deg"] + 180) % 360 - 180
                done = abs(error) <= leg["heading_within"]
            elif "to" in leg:
                # Reached, or passed: the waypoint behind the aircraft and close.
                north, east = offset_m(lat, lon, *leg["to"])
                heading = math.radians(fdm["attitude/psi-deg"])
                ahead = north * math.cos(heading) + east * math.sin(heading)
                distance = math.hypot(north, east)
                done = distance < leg.get("within", 1500) or (ahead < 0 and distance < 5000)
            elif "end_at_start" in leg:
                # Along the start's heading, how far past the start the aircraft is.
                north, east = offset_m(START["latitude"], START["longitude"], lat, lon)
                along = north * math.cos(start_heading) + east * math.sin(start_heading)
                done = along >= 0 and left_start
        if done:
            if not legs:
                break
            leg = legs.pop(0)
            leg_start = t
            print(f"{t:6.1f} s  leg {len(LEGS) - len(legs)}: {leg}")
            for name, value in leg.get("set", {}).items():
                setattr(autopilot, name, value)
            if "roll" in leg:
                autopilot.start_roll(leg["roll"])
            if leg is not LEGS[0] and LEGS[LEGS.index(leg) - 1].get("roll"):
                print(f"         the roll turned {autopilot.rolled:.0f} degrees")
        if t > 60:
            left_start = True

        # Steering towards a waypoint, or onto the start's line: up to 45 degrees towards it,
        # in proportion to the distance off it.
        target = leg.get("to") or leg.get("towards")
        if target:
            north, east = offset_m(lat, lon, *target)
            autopilot.heading = math.degrees(math.atan2(east, north)) % 360
        elif "end_at_start" in leg:
            north, east = offset_m(START["latitude"], START["longitude"], lat, lon)
            right = -north * math.sin(start_heading) + east * math.cos(start_heading)
            autopilot.heading = (START["heading"] - max(-45.0, min(45.0, right * 0.02))) % 360
            autopilot.max_bank = 70.0

        if step % every == 0:
            q = body_to_ned(fdm)
            # Keep the quaternions on one side, so neighbours are close for interpolation.
            if previous and sum(a * b for a, b in zip(q, previous)) < 0:
                q = tuple(-c for c in q)
            previous = q
            samples.append(
                {
                    "latitude": fdm["position/lat-geod-deg"],
                    "longitude": fdm["position/long-gc-deg"],
                    "height": fdm["position/geod-alt-ft"] * FT,
                    "attitude": q,
                    "load": fdm["accelerations/Nz"],
                }
            )
        if step % (10 * RATE) == 0:
            print(
                f"{t:6.1f} s  h {height:6.0f} m  v {fdm['velocities/vt-fps'] * FT:5.1f} m/s"
                f"  heading {fdm['attitude/psi-deg']:5.1f}  bank {fdm['attitude/phi-deg']:6.1f}"
                f"  alpha {fdm['aero/alpha-deg']:5.2f}  load {fdm['accelerations/Nz']:4.2f} G"
                f"  ({lat:.4f}, {lon:.4f})"
            )
        autopilot.update(1 / RATE)
        fdm.run()
    else:
        raise SystemExit(f"the lap did not close within {MAX_SECONDS} s")

    close_loop(samples)
    write(samples)


def close_loop(samples: list[dict]) -> None:
    """Spreads the difference between the end and the start over the last BLEND_SECONDS.

    The last sample is where the aircraft passed the start again; it is dropped, as the first
    sample follows the one before it when the path loops.
    """
    end = samples.pop()
    first = samples[0]
    report = {
        "north m": offset_m(end["latitude"], end["longitude"], first["latitude"], first["longitude"])[0],
        "east m": offset_m(end["latitude"], end["longitude"], first["latitude"], first["longitude"])[1],
        "height m": first["height"] - end["height"],
        "attitude dot": abs(sum(a * b for a, b in zip(end["attitude"], first["attitude"]))),
        "load": first["load"] - end["load"],
    }
    print("closing the loop:", {k: round(v, 3) for k, v in report.items()})
    count = min(len(samples) - 1, BLEND_SECONDS * OUTPUT_RATE)
    sign = 1 if sum(a * b for a, b in zip(end["attitude"], first["attitude"])) >= 0 else -1
    for i in range(count):
        sample = samples[len(samples) - count + i]
        u = (i + 1) / (count + 1)
        w = u * u * (3 - 2 * u)  # smoothstep
        for key in ("latitude", "longitude", "height", "load"):
            sample[key] += w * (first[key] - end[key])
        # The attitude difference is small; blending the components and normalising is enough.
        q = [a + w * (sign * b - c) for a, b, c in zip(sample["attitude"], first["attitude"], end["attitude"])]
        n = math.sqrt(sum(c * c for c in q))
        sample["attitude"] = tuple(c / n for c in q)
    # Across the seam the quaternions may have opposite signs; playback's slerp takes the short
    # way either way.



def write(samples: list[dict]) -> None:
    output = Path(__file__).resolve().parents[2] / "public" / "paths" / "course.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "interval": 1 / OUTPUT_RATE,
        "loop": True,
        "latitude": [round(s["latitude"], 9) for s in samples],
        "longitude": [round(s["longitude"], 9) for s in samples],
        "height": [round(s["height"], 3) for s in samples],
        "attitude": [round(c, 6) for s in samples for c in s["attitude"]],
        "loadFactor": [round(s["load"], 3) for s in samples],
    }
    output.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    seconds = len(samples) / OUTPUT_RATE
    print(f"{output}: {len(samples)} samples, {seconds:.0f} s, {output.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
