"""Makes gitma2-lsq.json: cases for debrief_kernel.tma_fit, answered by gitma2's own solve.

Run in a checkout of debrief/gitma2 (its uv environment has numba and tma2):

    cd gitma2 && uv run python <fuudee>/python/debrief-kernel/tests/data/make_gitma2_lsq.py \
        > <fuudee>/python/debrief-kernel/tests/data/gitma2-lsq.json

Never edit the JSON by hand. Each case: an ownship (east, north metres) and a target on one
course at one speed, bearings every 30 s with Gaussian noise from a fixed seed; the
answer is tma2.references.lsq.solve_batch's (theta, converged, cost).
"""

import json
import math
import subprocess

import numpy as np
from tma2.references.lsq import MAX_ITERATIONS, solve_batch


def ownship(n: int, dt: float, zig: bool) -> tuple[np.ndarray, np.ndarray]:
    """6 m/s north; with zig, turning to 060° at half time."""
    x, y = np.zeros(n), np.zeros(n)
    for i in range(1, n):
        course = math.radians(60.0) if zig and i > n // 2 else 0.0
        x[i] = x[i - 1] + 6.0 * dt * math.sin(course)
        y[i] = y[i - 1] + 6.0 * dt * math.cos(course)
    return x, y


def case(name: str, seed: int, n: int, zig: bool, target, sd_deg: float) -> dict:
    dt = 30.0
    t = np.arange(n) * dt
    ox, oy = ownship(n, dt, zig)
    x0, y0, vx, vy = target
    tx, ty = x0 + vx * t, y0 + vy * t
    rng = np.random.default_rng(seed)
    z = np.mod(np.arctan2(tx - ox, ty - oy) + rng.normal(0, math.radians(sd_deg), n), 2 * math.pi)
    valid = np.ones(n, dtype=np.int32)
    found, th, conv, it, c = solve_batch(t, ox, oy, z, valid, n, MAX_ITERATIONS)
    return {
        "name": name,
        "t": t.tolist(),
        "ox": ox.tolist(),
        "oy": oy.tolist(),
        "z": z.tolist(),
        "truth": list(target),
        "gitma2": {
            "found": bool(found),
            "theta": [float(v) for v in th],
            "converged": bool(conv),
            "iterations": int(it),
            "cost": float(c),
        },
    }


commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
cases = [
    case("zig, noise-free", 1, 120, True, (8000.0, 12000.0, -4.0, 1.0), 0.0),
    case("zig, 1 degree", 2, 120, True, (8000.0, 12000.0, -4.0, 1.0), 1.0),
    case("zig, 2 degrees, far", 3, 160, True, (-15000.0, 20000.0, 3.0, -2.0), 2.0),
    case("no zig, 1 degree", 4, 120, False, (8000.0, 12000.0, -4.0, 1.0), 1.0),
]
print(
    json.dumps(
        {"source": "debrief/gitma2 src/tma2/references/lsq.py", "commit": commit, "cases": cases},
        indent=1,
    )
)
