"""Step 1 check: trims JSBSim's F-16 for level flight and flies it hands-off.

Run from the repository root:
    tools/flightpath/.venv/Scripts/python tools/flightpath/trim_check.py
"""

from aircraft import FT, create_fdm

RATE = 120  # Hz, JSBSim's integration rate
SECONDS = 60


def main() -> None:
    # The Hakone origin (src/areas.ts) at 3,000 m and 250 m/s (ADR 0018), on the placeholder
    # course's first heading.
    fdm = create_fdm(35.23, 139.02, 3000.0, 250.0, 293.0, RATE)

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
