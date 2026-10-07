"""JSBSim's F-16, set up in flight: shared by the path tool's scripts."""

import math

import jsbsim

FT = 0.3048
THROTTLE_P = 0.05
THROTTLE_I = 0.005
ROLL_PULL_UP = 8.0  # degrees of climb before a full roll


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
        # Heading in degrees from true north. When set, the bank is chosen to turn towards it, up
        # to max_bank.
        self.heading: float | None = None
        self.max_bank = 60.0
        self.height = fdm["position/h-sl-ft"] * FT  # metres
        self.speed = fdm["velocities/vt-fps"] * FT  # metres per second
        self.throttle = fdm["fcs/throttle-cmd-norm"]
        self.bank_integral = 0.0
        self.load_integral = 0.0
        # Steepest climb or descent towards the height, degrees.
        self.max_climb = 5.0
        # Degrees per second of a full roll in progress (positive to the right), or 0.
        self.roll_rate = 0.0
        self.rolled = 0.0
        self.pulling_up = False
        self.pull_up_time = 0.0

    def start_roll(self, rate: float) -> None:
        """Rolls once around at `rate` degrees per second, then holds the bank of before.

        As a pilot flies an aileron roll: the nose is first pulled up, as it drops while the
        aircraft is on its side and inverted.
        """
        self.roll_rate = rate
        self.rolled = 0.0
        self.pulling_up = True
        self.pull_up_time = 0.0

    def update(self, dt: float) -> None:
        fdm = self.fdm
        if self.roll_rate:
            self.rolled += fdm["velocities/p-rad_sec"] * 57.29578 * dt
            if abs(self.rolled) >= 360 - abs(self.roll_rate) * 0.15:
                self.roll_rate = 0.0
                self.bank_integral = 0.0
        if self.roll_rate and self.pulling_up:
            self.pull_up_time += dt
            if fdm["flight-path/gamma-deg"] < ROLL_PULL_UP and self.pull_up_time < 5:
                # Wings held level: hands-off, the F-16 drifts into a bank.
                self.hold_bank(0.0, dt)
                self.yaw()
                self.pitch_for_load(2.5, dt)
                self.throttle_for_speed(dt)
                return
            self.pulling_up = False
        if self.roll_rate:
            # A full roll: a steady roll rate, and the elevator holding 1 G in the body.
            fdm["fcs/aileron-cmd-norm"] = clamp(self.roll_rate / 180, -1, 1)
            self.yaw()
            self.pitch_for_load(1.0, dt)
            self.throttle_for_speed(dt)
            return
        # Heading: bank in proportion to the heading error, rolling out as the heading comes up.
        if self.heading is not None:
            heading_error = (self.heading - fdm["attitude/psi-deg"] + 180) % 360 - 180
            self.bank = clamp(8.0 * heading_error, -self.max_bank, self.max_bank)
        self.hold_bank(self.bank, dt)
        bank = fdm["attitude/phi-deg"]
        self.yaw()
        # Height: a climb angle towards the target, at most max_climb; from it the load factor,
        # including what the bank needs to hold the climb angle.
        height = fdm["position/h-sl-ft"] * FT
        climb_target = clamp(0.02 * (self.height - height), -self.max_climb, self.max_climb)
        climb = fdm["flight-path/gamma-deg"]
        cos_bank = max(math.cos(math.radians(bank)), 0.15)
        load = math.cos(math.radians(climb)) / cos_bank + 0.1 * (climb_target - climb)
        self.pitch_for_load(clamp(load, -2, 7), dt)
        self.throttle_for_speed(dt)

    def hold_bank(self, target: float, dt: float) -> None:
        """Roll rate towards the bank, at most 90 degrees per second, with an integral so that
        the bank settles on the target in a turn."""
        bank_error = (target - self.fdm["attitude/phi-deg"] + 180) % 360 - 180
        self.bank_integral = clamp(self.bank_integral + bank_error * dt, -30, 30)
        roll_rate = clamp(1.5 * bank_error + 0.5 * self.bank_integral, -90, 90)
        self.fdm["fcs/aileron-cmd-norm"] = clamp(roll_rate / 180, -1, 1)

    def yaw(self) -> None:
        # The model's yaw damper opposes any yaw rate with a gain of 100 above 46 m/s, so in a
        # steady turn it holds the rudder against the turn and leaves a sideslip that the rudder
        # command cannot remove. Its term is cancelled here: taken off the command that feeds the
        # damper's error and added back through the trim, which reaches the rudder directly. The
        # model's own feedback of the lateral load then keeps turns coordinated, within about 0.1
        # degrees of sideslip in a 60 degree bank.
        damper = self.fdm["fcs/yaw-rate-norm"]
        self.fdm["fcs/rudder-cmd-norm"] = -damper
        self.fdm["fcs/yaw-trim-cmd-norm"] = damper

    def pitch_for_load(self, load: float, dt: float) -> None:
        """The elevator follows a load factor, with an integral for what the fly-by-wire leaves."""
        error = load - self.fdm["accelerations/Nz"]
        self.load_integral = clamp(self.load_integral + error * dt, -5, 5)
        self.fdm["fcs/elevator-cmd-norm"] = clamp(-0.05 * error - 0.3 * self.load_integral, -1, 1)

    def throttle_for_speed(self, dt: float) -> None:
        """Throttle in proportion to the speed error, plus its integral; 1 is full afterburner."""
        error = self.speed - self.fdm["velocities/vt-fps"] * FT
        self.throttle = clamp(self.throttle + THROTTLE_I * error * dt, 0, 1)
        self.fdm["fcs/throttle-cmd-norm"] = clamp(self.throttle + THROTTLE_P * error, 0, 1)

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
