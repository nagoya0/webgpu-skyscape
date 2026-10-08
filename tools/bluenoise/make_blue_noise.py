"""Makes the blue noise used to jitter the clouds' and the atmosphere's ray marching
(public/noise/blue-noise.bin).

Run from the repository root:
    tools/bluenoise/.venv/Scripts/python tools/bluenoise/make_blue_noise.py [preview.png]

Spatially, one blue noise texture by the void-and-cluster method (Ulichney, "The void-and-cluster
method for dither array generation", 1993): pixels are ranked so that every threshold of the
ranks gives evenly spread points, with no clumps and no large gaps. Over time, frame k adds
k times the golden ratio to every pixel's value, wrapping at 1, so each pixel steps through
evenly spread values from frame to frame. This replaces takram's spatiotemporal blue noise, whose
origin and licence are not stated, in the same layout.

Output: SIZE x SIZE pixels, FRAMES frames, one unsigned byte each, x fastest, then y, then the
frame, as a 3D texture (src/clouds/clouds.ts). The texture repeats in x and y.
"""

import struct
import sys
import zlib
from pathlib import Path

import numpy as np

SIZE = 128
FRAMES = 64
SIGMA = 1.5  # pixels: the spread of the energy filter, Ulichney's value
INITIAL_FRACTION = 0.1  # of the pixels in the initial pattern
GOLDEN_RATIO_FRACTION = 0.6180339887498949
SEED = 1

OUTPUT = Path(__file__).resolve().parents[2] / "public" / "noise" / "blue-noise.bin"


def energy_kernel() -> np.ndarray:
    """A Gaussian on the torus, centred on pixel (0, 0)."""
    d = np.minimum(np.arange(SIZE), SIZE - np.arange(SIZE)).astype(np.float64)
    g = np.exp(-(d**2) / (2 * SIGMA**2))
    return np.outer(g, g)


def void_and_cluster(rng: np.random.Generator) -> np.ndarray:
    """Ranks 0 .. SIZE*SIZE-1 for every pixel."""
    kernel = energy_kernel()
    count = SIZE * SIZE

    def add(energy: np.ndarray, index: int, sign: float) -> None:
        y, x = divmod(index, SIZE)
        energy += sign * np.roll(kernel, (y, x), axis=(0, 1))

    def tightest_cluster(pattern: np.ndarray, energy: np.ndarray) -> int:
        return int(np.argmax(np.where(pattern, energy, -np.inf)))

    def largest_void(pattern: np.ndarray, energy: np.ndarray) -> int:
        return int(np.argmin(np.where(pattern, np.inf, energy)))

    # The initial pattern: random points, moved from the tightest cluster to the largest void
    # until that changes nothing.
    pattern = np.zeros(count, dtype=bool)
    pattern[rng.choice(count, int(count * INITIAL_FRACTION), replace=False)] = True
    energy = np.zeros((SIZE, SIZE))
    for index in np.flatnonzero(pattern):
        add(energy, index, 1)
    energy = energy.ravel()
    while True:
        cluster = tightest_cluster(pattern, energy)
        pattern[cluster] = False
        add(energy.reshape(SIZE, SIZE), cluster, -1)
        void = largest_void(pattern, energy)
        pattern[void] = True
        add(energy.reshape(SIZE, SIZE), void, 1)
        if void == cluster:
            break

    ranks = np.empty(count, dtype=np.int64)
    initial = pattern.copy()
    initial_energy = energy.copy()
    ones = int(initial.sum())

    # Phase 1: rank the initial points, removing the tightest cluster each time.
    for rank in range(ones - 1, -1, -1):
        cluster = tightest_cluster(pattern, energy)
        pattern[cluster] = False
        add(energy.reshape(SIZE, SIZE), cluster, -1)
        ranks[cluster] = rank

    # Phases 2 and 3: from the initial pattern, fill the largest void each time. Past half full
    # this is the same as removing the tightest cluster of the empty pixels, as the energies of
    # the full and the empty pixels add up to the same constant everywhere.
    pattern = initial
    energy = initial_energy
    for rank in range(ones, count):
        void = largest_void(pattern, energy)
        pattern[void] = True
        add(energy.reshape(SIZE, SIZE), void, 1)
        ranks[void] = rank

    return ranks.reshape(SIZE, SIZE)


def write_png(path: Path, image: np.ndarray) -> None:
    """A greyscale 8-bit PNG, without an imaging library."""
    height, width = image.shape
    rows = b"".join(b"\x00" + image[y].astype(np.uint8).tobytes() for y in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def main() -> None:
    rng = np.random.default_rng(SEED)
    ranks = void_and_cluster(rng)
    base = (ranks + 0.5) / (SIZE * SIZE)
    frames = np.stack([(base + k * GOLDEN_RATIO_FRACTION) % 1.0 for k in range(FRAMES)])
    data = np.minimum(np.floor(frames * 256), 255).astype(np.uint8)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(data.tobytes())
    print(f"wrote {OUTPUT} ({data.nbytes} bytes)")

    if len(sys.argv) > 1:
        # The first frame tiled 2 x 2, to see that it repeats without seams.
        write_png(Path(sys.argv[1]), np.tile(data[0], (2, 2)))
        print(f"wrote {sys.argv[1]}")


if __name__ == "__main__":
    main()
