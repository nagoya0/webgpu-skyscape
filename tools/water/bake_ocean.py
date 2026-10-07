"""Bakes the sea's wave slopes into a looping 3D texture (public/water/ocean.bin).

Run from the repository root:
    tools/water/.venv/Scripts/python tools/water/bake_ocean.py

The waves are an FFT ocean (Tessendorf, "Simulating Ocean Water"): random amplitudes from a
Phillips spectrum for a steady wind, each wave moving at its deep-water speed, summed by an
inverse FFT. Done once here instead of every frame on the GPU; the demo only samples the result
(src/terrain/wgsl/waterNormal.wgsl).

Output: SIZE x SIZE texels over a square patch of PATCH metres, FRAMES frames over LOOP seconds,
as a 3D texture with x along north, y along east and z along time. Each texel holds the slopes
dh/dnorth and dh/deast as two unsigned bytes, mapping -RANGE..RANGE to 0..255. The patch and the
loop both repeat: the waves' frequencies are rounded to whole turns per loop.
"""

from pathlib import Path

import numpy as np

SIZE = 128
FRAMES = 64
PATCH = 100.0  # metres: the patch the spectrum is made for; the demo scales it
LOOP = 12.0  # seconds, at PATCH; the demo scales it with the square root of its patch size
WIND_SPEED = 7.0  # m/s
WIND_ANGLE = 0.3  # radians from north towards east
SMALLEST = 0.3  # metres: waves much shorter than this are damped
RMS_SLOPE = 0.1  # of the whole field, after scaling
RANGE = 0.4  # slopes stored from -RANGE to RANGE
SEED = 7
G = 9.81

OUTPUT = Path(__file__).resolve().parents[2] / "public" / "water" / "ocean.bin"


def main() -> None:
    rng = np.random.default_rng(SEED)
    # Wave numbers on the FFT grid (rad/m), along north (axis 0) and east (axis 1).
    k1 = 2 * np.pi * np.fft.fftfreq(SIZE, d=PATCH / SIZE)
    kn, ke = np.meshgrid(k1, k1, indexing="ij")
    k = np.hypot(kn, ke)
    k_safe = np.where(k == 0, 1.0, k)

    # Phillips spectrum: largest waves about WIND_SPEED^2 / g long; along the wind, little against.
    largest = WIND_SPEED**2 / G
    cos_wind = (kn * np.cos(WIND_ANGLE) + ke * np.sin(WIND_ANGLE)) / k_safe
    directional = cos_wind**2 * np.where(cos_wind < 0, 0.1, 1.0)
    phillips = np.exp(-1 / (k_safe * largest) ** 2) / k_safe**4 * directional
    phillips *= np.exp(-((k_safe * SMALLEST) ** 2))
    phillips[k == 0] = 0

    h0 = (rng.standard_normal((SIZE, SIZE)) + 1j * rng.standard_normal((SIZE, SIZE))) * np.sqrt(phillips / 2)
    # h0 at -k, for the conjugate term that keeps the height real.
    h0_minus = np.conj(np.roll(np.flip(h0), 1, axis=(0, 1)))

    # Deep-water frequencies, rounded to whole turns per loop so that the loop closes.
    turn = 2 * np.pi / LOOP
    omega = np.round(np.sqrt(G * k) / turn) * turn

    slopes = np.empty((FRAMES, SIZE, SIZE, 2))
    for frame in range(FRAMES):
        t = frame * LOOP / FRAMES
        h = h0 * np.exp(1j * omega * t) + h0_minus * np.exp(-1j * omega * t)
        slopes[frame, :, :, 0] = np.real(np.fft.ifft2(1j * kn * h))
        slopes[frame, :, :, 1] = np.real(np.fft.ifft2(1j * ke * h))

    rms = np.sqrt(np.mean(np.sum(slopes**2, axis=-1)))
    slopes *= RMS_SLOPE / rms
    clipped = np.mean(np.abs(slopes) > RANGE)
    encoded = np.clip(np.round((slopes / RANGE * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)

    # Data3DTexture order: x fastest, then y, then z; two bytes per texel. x is north, so axis 0
    # of each frame (north) must vary fastest: transpose to (frame, east, north, channel).
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(np.ascontiguousarray(encoded.transpose(0, 2, 1, 3)).tobytes())
    print(f"{OUTPUT}: {SIZE}x{SIZE}x{FRAMES}, {OUTPUT.stat().st_size / 1024:.0f} KB, {clipped:.4%} clipped")


if __name__ == "__main__":
    main()
