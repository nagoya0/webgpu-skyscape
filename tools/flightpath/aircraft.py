"""JSBSim's F-16, set up in flight: shared by the path tool's scripts."""

import math

import jsbsim

FT = 0.3048


def create_fdm(
    latitude: float, longitude: float, height: float, speed: float, heading: float, rate: int
) -> jsbsim.FGFDMExec:
    """The F-16 trimmed for level flight.

    latitude and longitude in degrees, height in metres above the ellipsoid, speed in metres per
    second, heading in degrees from true north, rate the integration rate in Hz.
    """
    fdm = jsbsim.FGFDMExec(None)
    fdm.set_debug_level(0)
    fdm.set_dt(1.0 / rate)
    if not fdm.load_model("f16"):
        raise SystemExit("could not load the f16 model")
    fdm["ic/lat-geod-deg"] = latitude
    fdm["ic/long-gc-deg"] = longitude
    fdm["ic/h-sl-ft"] = height / FT
    fdm["ic/vt-fps"] = speed / FT
    fdm["ic/psi-true-deg"] = heading
    fdm["ic/gamma-deg"] = 0.0
    fdm["propulsion/set-running"] = -1
    fdm.run_ic()
    fdm["gear/gear-cmd-norm"] = 0.0
    fdm.do_trim(1)  # full trim: steady level flight
    return fdm


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


class Autopilot:
    """Holds a bank angle, a height and a speed through the F-16's own fly-by-wire.

    The model's aileron command is a roll rate (1 is about 180 degrees per second) and its
    elevator command a pitch rate and load; the outer loops here set them from the errors.
    """

    def __init__(self, fdm: jsbsim.FGFDMExec) -> None:
        self.fdm = fdm
        self.bank = 0.0  # degrees
        self.height = fdm["position/h-sl-ft"] * FT  # metres
        self.speed = fdm["velocities/vt-fps"] * FT  # metres per second
        self.throttle = fdm["fcs/throttle-cmd-norm"]

    def update(self, dt: float) -> None:
        fdm = self.fdm
        # Bank: roll rate towards the target, at most 90 degrees per second.
        bank_error = self.bank - fdm["attitude/phi-deg"]
        bank_error = (bank_error + 180) % 360 - 180
        roll_rate = clamp(1.5 * bank_error, -90, 90)
        fdm["fcs/aileron-cmd-norm"] = clamp(roll_rate / 180, -1, 1)
        # Height: a climb angle towards the target, at most 5 degrees, then pitch towards it.
        height = fdm["position/h-sl-ft"] * FT
        climb_target = clamp(0.02 * (self.height - height), -5, 5)
        climb = fdm["flight-path/gamma-deg"]
        fdm["fcs/elevator-cmd-norm"] = clamp(-0.05 * (climb_target - climb), -1, 1)
        # Speed: throttle, integrating the error.
        speed = fdm["velocities/vt-fps"] * FT
        self.throttle = clamp(self.throttle + 0.02 * (self.speed - speed) * dt, 0, 1)
        fdm["fcs/throttle-cmd-norm"] = self.throttle


def body_to_ned(fdm: jsbsim.FGFDMExec) -> tuple[float, float, float, float]:
    """The attitude as a body-to-NED quaternion (x, y, z, w): heading, then pitch, then roll."""
    phi = fdm["attitude/phi-rad"] / 2
    theta = fdm["attitude/theta-rad"] / 2
    psi = fdm["attitude/psi-rad"] / 2
    cr, sr = math.cos(phi), math.sin(phi)
    cp, sp = math.cos(theta), math.sin(theta)
    cy, sy = math.cos(psi), math.sin(psi)
    return (
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
        cr * cp * cy + sr * sp * sy,
    )
