"""Step 1 check: trims JSBSim's F-16 for level flight and flies it hands-off.

Run from the repository root:
    tools/flightpath/.venv/Scripts/python tools/flightpath/trim_check.py
"""

import jsbsim

FT = 0.3048
SPEED = 250.0  # m/s (ADR 0018)
HEIGHT = 3000.0  # m above sea level
LATITUDE = 35.23  # the Hakone origin (src/areas.ts)
LONGITUDE = 139.02
HEADING = 293.0  # degrees, the placeholder course's first leg
RATE = 120  # Hz, JSBSim's integration rate
SECONDS = 60


def main() -> None:
    fdm = jsbsim.FGFDMExec(None)
    fdm.set_debug_level(0)
    fdm.set_dt(1.0 / RATE)
    if not fdm.load_model("f16"):
        raise SystemExit("could not load the f16 model")

    fdm["ic/h-sl-ft"] = HEIGHT / FT
    fdm["ic/vt-fps"] = SPEED / FT
    fdm["ic/lat-geod-deg"] = LATITUDE
    fdm["ic/long-gc-deg"] = LONGITUDE
    fdm["ic/psi-true-deg"] = HEADING
    fdm["ic/gamma-deg"] = 0.0
    fdm["gear/gear-cmd-norm"] = 0.0
    fdm["propulsion/set-running"] = -1
    fdm.run_ic()
    fdm["gear/gear-cmd-norm"] = 0.0
    fdm.do_trim(1)  # full trim: steady level flight

    def report(label: str) -> None:
        print(
            f"{label:>8}  h {fdm['position/h-sl-ft'] * FT:7.1f} m"
            f"  v {fdm['velocities/vt-fps'] * FT:6.1f} m/s"
            f"  alpha {fdm['aero/alpha-deg']:5.2f}"
            f"  pitch {fdm['attitude/theta-deg']:5.2f}"
            f"  bank {fdm['attitude/phi-deg']:6.2f}"
            f"  heading {fdm['attitude/psi-deg']:6.2f}"
            f"  nz {fdm['accelerations/Nz']:5.2f}"
            f"  throttle {fdm['fcs/throttle-cmd-norm']:4.2f}"
            f"  elevator {fdm['fcs/elevator-cmd-norm']:5.2f}"
        )

    report("trim")
    for step in range(SECONDS * RATE):
        fdm.run()
        if (step + 1) % (10 * RATE) == 0:
            report(f"{(step + 1) // RATE} s")


if __name__ == "__main__":
    main()
