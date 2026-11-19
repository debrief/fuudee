"""A suggested first guess for a TMA solution: batch least squares over the cuts (CAP-21
as amended; design note docs/notes/tma-suggested-first-guess.md).

A port of gitma2's batch least-squares solve (debrief/gitma2, src/tma2/references/lsq.py,
itself ported from gitma's lsq.ts): a coarse grid start, 12 ranges from 1 to 40 km along the
first bearing by 8 courses by 3 speeds, then Levenberg-Marquardt-damped Gauss-Newton on the
target's position and velocity at time zero, (x0, y0, vx, vy), on one course at one speed.
NumPy only (no numba), so the playground's Pyodide runs it too. The sums are vectorised
where gitma2 loops, so results agree with gitma2's to rounding, not bit for bit; the test
vector python/debrief-kernel/tests/data/gitma2-lsq.json holds the agreement.

Positions are east and north in metres on a plane about a reference point; times are
seconds; bearings are true, in radians, as gitma2 has them. The caller (debrief_stac.tma)
turns geodesic positions into this plane and the answer back into a first guess.

Range from bearings alone is only as good as the ownship's manoeuvres make it. The fit
says how well it is determined: the standard deviation of the range at the first cut,
from the fit's covariance (the residuals' variance times the inverse of JᵀJ). Where that
is large the guess is called undetermined and is not offered.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

Floats = NDArray[np.float64]

MAX_ITERATIONS = 50
LAMBDA0 = 1e-3
LAMBDA_MAX = 1e12
GRID_SPEEDS = (2.0, 5.0, 9.0)
GRID_COURSES = 8
GRID_RANGES = 12
# A guess is offered only where two standard deviations of range are within half the range.
DETERMINED_RELATIVE_SD = 0.25
# A residual this many typical errors from the fit is far off it: a run of such together is a
# drift (a manoeuvre, perhaps).
FAR_OFF = 3.0
# One on its own is named a wild bearing only this far off: at three, about one of 334 clean
# Gaussian errors crossed by chance and was named one (serial 4, 19 Nov 2026).
WILD = 4.0
# Bearings are seldom better than this: the floor of the typical error when judging far off.
TYPICAL_FLOOR = math.radians(0.1)


@dataclass(frozen=True)
class Fit:
    theta: tuple[float, float, float, float]  # x0, y0, vx, vy at time zero
    converged: bool
    iterations: int
    cost: float  # sum of squared residuals, radians²
    rms_rad: float
    count: int
    range_m: float  # from the first cut's origin to the target at its time
    range_sd_m: float  # inf where the fit says nothing of range
    along_m: float  # the target's distance along the first bearing at its time
    # The typical error, robust to a few wild bearings: 1.4826 × the median absolute
    # residual (the standard deviation, were the errors Gaussian), radians.
    typical_rad: float = 0.0
    far_off: tuple[int, ...] = ()  # indices of residuals more than FAR_OFF typical errors off
    wild: tuple[int, ...] = ()  # indices of residuals more than WILD typical errors off

    @property
    def course_rad(self) -> float:
        return math.atan2(self.theta[2], self.theta[3]) % (2 * math.pi)

    @property
    def speed_mps(self) -> float:
        return math.hypot(self.theta[2], self.theta[3])

    @property
    def determined(self) -> bool:
        return (
            math.isfinite(self.range_sd_m)
            and self.along_m > 0
            and self.range_sd_m <= DETERMINED_RELATIVE_SD * self.range_m
        )


def _wrapped(a: Floats) -> Floats:
    """Signed smallest angle in (-π, π] (gitma angleDiff)."""
    return np.arctan2(np.sin(a), np.cos(a))


def _bearings(t: Floats, ox: Floats, oy: Floats, th: Floats) -> tuple[Floats, Floats, Floats]:
    dx = th[0] + th[2] * t - ox
    dy = th[1] + th[3] * t - oy
    return np.arctan2(dx, dy), dx, dy


def cost(t: Floats, ox: Floats, oy: Floats, z: Floats, th: Floats) -> float:
    """Sum of squared wrapped bearing residuals."""
    h, _dx, _dy = _bearings(t, ox, oy, th)
    r = _wrapped(z - h)
    return float(r @ r)


def _jacobian(t: Floats, ox: Floats, oy: Floats, z: Floats, th: Floats) -> tuple[Floats, Floats]:
    """The bearing's derivatives by θ, one row a cut, and the residuals z - h."""
    h, dx, dy = _bearings(t, ox, oy, th)
    rho2 = dx * dx + dy * dy
    g0 = dy / rho2
    g1 = -dx / rho2
    return np.stack([g0, g1, t * g0, t * g1], axis=1), _wrapped(z - h)


def grid_start(t: Floats, ox: Floats, oy: Floats, z: Floats) -> Floats:
    """The lowest-cost state of the coarse grid, along the first bearing (gitma gridStart)."""
    best, best_cost = np.zeros(4), math.inf
    t0, b0 = t[0], z[0]
    for ri in range(GRID_RANGES):
        r = 1000.0 * math.pow(40.0, ri / (GRID_RANGES - 1))
        px = ox[0] + r * math.sin(b0)
        py = oy[0] + r * math.cos(b0)
        for ci in range(GRID_COURSES):
            course = ci * 2 * math.pi / GRID_COURSES
            for speed in GRID_SPEEDS:
                vx, vy = speed * math.sin(course), speed * math.cos(course)
                th = np.array([px - vx * t0, py - vy * t0, vx, vy])
                c = cost(t, ox, oy, z, th)
                if c < best_cost:
                    best, best_cost = th, c
    return best


def levenberg_marquardt(
    t: Floats, ox: Floats, oy: Floats, z: Floats, start: Floats, max_iterations: int
) -> tuple[Floats, bool, int, float]:
    """Damped Gauss-Newton from start: (theta, converged, iterations, cost), as gitma2's."""
    th = start.copy()
    c = cost(t, ox, oy, z, th)
    lam = LAMBDA0
    for it in range(1, max_iterations + 1):
        j, r = _jacobian(t, ox, oy, z, th)
        jtj, jtr = j.T @ j, j.T @ r
        accepted = False
        while lam <= LAMBDA_MAX:
            damped = jtj.copy()
            damped[np.diag_indices(4)] *= 1.0 + lam
            try:
                step = np.linalg.solve(damped, jtr)
            except np.linalg.LinAlgError:
                step = None
            if step is not None and np.all(np.isfinite(step)):
                nxt = th + step
                cn = cost(t, ox, oy, z, nxt)
                if cn <= c:
                    done = (c - cn <= 1e-12 * c) or (cn < 1e-24)
                    th, c = nxt, cn
                    lam = max(lam / 10.0, 1e-12)
                    accepted = True
                    if done:
                        return th, True, it, c
                    break
            lam *= 10.0
        if not accepted:
            return th, True, it, c
    return th, False, max_iterations, c


def runs(indices: tuple[int, ...]) -> list[tuple[int, int]]:
    """Consecutive indices as (first, last) runs."""
    out: list[tuple[int, int]] = []
    for i in indices:
        if out and i == out[-1][1] + 1:
            out[-1] = (out[-1][0], i)
        else:
            out.append((i, i))
    return out


def fit(t: Floats, ox: Floats, oy: Floats, z: Floats) -> Fit | None:
    """Batch least squares over the cuts given, in time order (at least five, so that the
    four unknowns leave a residual variance). None where there are too few."""
    t, ox, oy, z = (np.asarray(a, dtype=np.float64) for a in (t, ox, oy, z))
    n = len(t)
    if n < 5:
        return None
    start = grid_start(t, ox, oy, z)
    th, converged, iterations, c = levenberg_marquardt(t, ox, oy, z, start, MAX_ITERATIONS)
    j, residuals = _jacobian(t, ox, oy, z, th)
    typical = 1.4826 * float(np.median(np.abs(residuals)))
    scale = max(typical, TYPICAL_FLOOR)
    far_off = tuple(int(i) for i in np.flatnonzero(np.abs(residuals) > FAR_OFF * scale))
    wild = tuple(int(i) for i in np.flatnonzero(np.abs(residuals) > WILD * scale))
    variance = c / (n - 4)
    # The target at the first cut's time, from its origin, and the spread of its range.
    p = np.array([th[0] + th[2] * t[0] - ox[0], th[1] + th[3] * t[0] - oy[0]])
    range_m = float(np.hypot(*p))
    los = p / range_m if range_m > 0 else np.zeros(2)
    a = np.array([[1.0, 0.0, t[0], 0.0], [0.0, 1.0, 0.0, t[0]]])
    try:
        cov = variance * np.linalg.inv(j.T @ j)
        range_var = float(los @ a @ cov @ a.T @ los)
        range_sd = math.sqrt(range_var) if range_var >= 0 else math.inf
    except np.linalg.LinAlgError:
        range_sd = math.inf
    if not math.isfinite(range_sd) or not np.all(np.isfinite(th)):
        range_sd = math.inf
    along = float(p[0] * math.sin(z[0]) + p[1] * math.cos(z[0]))
    return Fit(
        theta=(float(th[0]), float(th[1]), float(th[2]), float(th[3])),
        converged=converged,
        iterations=iterations,
        cost=c,
        rms_rad=math.sqrt(c / n),
        count=n,
        range_m=range_m,
        range_sd_m=range_sd,
        along_m=along,
        typical_rad=typical,
        far_off=far_off,
        wild=wild,
    )
