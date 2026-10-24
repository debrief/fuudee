"""TMA bearing residuals and first guesses (CAP-21, NFR-04; product owner, 24 Oct 2026).

A TMA solution is a track; each cut it is rooted in has a residual: the bearing measured
less the bearing from where the cut was taken (its origin, as the map draws it) to where
the solution was at the cut's time, along the geodesic, within (-180, 180], as legacy
Debrief's Doublet.calculateBearingError. Where a cut is ambiguous and not yet resolved,
the bearing measured is whichever of its two is nearer the solution, chosen afresh as
the solution moves (product owner, 24 Oct 2026). The RMS error is the root mean square
of the residuals counted: every rooted cut with a residual, less those the analyst left
out.

Worked out for many cuts at once with debrief_kernel.geodesy_arrays, so a solution of
2,000 cuts takes milliseconds. The bearing view's TypeScript twin (vscode/webview/tma.ts)
does the same while a solution is dragged; both are held to
schemas/vectors/tma-residuals.json.

The first guess: by form, a range along the first cut's bearing from where it was
taken, a course and a speed (defaults: 10,000 yd, across the bearing, 8 kn); by two
clicks, each click taken onto its cut's line (the point on the line level with it),
the course and speed those from the first to the second.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from debrief_kernel import geodesy_arrays
from debrief_kernel.geodesy import Position, TrackPath, destination, range_bearing
from debrief_kernel.units import Quantity

# The first guess by form, unless the analyst says otherwise (product owner, 24 Oct 2026).
DEFAULT_RANGE = Quantity(10_000.0, "[yd_i]")
DEFAULT_SPEED = Quantity(8.0, "[kn_i]")
# Across the bearing: the course a quarter turn clockwise of it.
ACROSS_DEG = 90.0


@dataclass(frozen=True)
class CutBearing:
    """One rooted cut, as residuals need it: its time, where it was taken from (None
    outside its host's fixes), its bearings and which was kept."""

    time_ms: int
    origin: tuple[float, float] | None
    bearing: float
    ambiguous: float | None = None
    resolved: str | None = None  # "bearing" or "ambiguous_bearing"


@dataclass(frozen=True)
class Residual:
    calculated: float | None
    measured: float | None
    used: str | None  # which of the cut's bearings measured is
    nearer_side: bool  # an unresolved ambiguous cut: the bearing nearer the solution
    residual: float | None


def wrap(degrees: float) -> float:
    """An angle within (-180, 180]."""
    value = math.fmod(degrees, 360.0)
    if value <= -180.0:
        value += 360.0
    elif value > 180.0:
        value -= 360.0
    return value


def _choose(cut: CutBearing, calculated: float) -> tuple[float, str, bool, float]:
    """The bearing measured, which it is, whether it was chosen as the nearer, and its residual."""
    if cut.ambiguous is None or cut.resolved == "bearing":
        return cut.bearing, "bearing", False, wrap(cut.bearing - calculated)
    if cut.resolved == "ambiguous_bearing":
        return cut.ambiguous, "ambiguous_bearing", False, wrap(cut.ambiguous - calculated)
    first, second = wrap(cut.bearing - calculated), wrap(cut.ambiguous - calculated)
    if abs(second) < abs(first):
        return cut.ambiguous, "ambiguous_bearing", True, second
    return cut.bearing, "bearing", True, first


def residuals(cuts: Sequence[CutBearing], solution: TrackPath) -> list[Residual]:
    """Each cut's residual against the solution, in the cuts' order. A cut with no origin,
    or outside the solution's span, has none."""
    if not cuts:
        return []
    times = np.array([c.time_ms for c in cuts], dtype=np.int64)
    where = geodesy_arrays.positions_at(solution, times)
    has = np.array([c.origin is not None for c in cuts]) & ~np.isnan(where.longitude)
    calculated = np.full(len(cuts), np.nan)
    if has.any():
        origins = np.array([c.origin if c.origin is not None else (0.0, 0.0) for c in cuts])
        found = geodesy_arrays.range_bearing(
            origins[has, 0], origins[has, 1], where.longitude[has], where.latitude[has]
        )
        calculated[has] = found.bearing_deg
    out = []
    for cut, ok, calc in zip(cuts, has, calculated, strict=True):
        if not ok:
            out.append(Residual(None, None, None, False, None))
            continue
        measured, used, nearer, residual = _choose(cut, float(calc))
        out.append(Residual(float(calc), measured, used, nearer, residual))
    return out


def rms(values: Sequence[float | None]) -> float | None:
    """The root mean square of the residuals given (None for one that has none, not
    counted); None when none is counted."""
    counted = [v for v in values if v is not None]
    if not counted:
        return None
    return math.sqrt(sum(v * v for v in counted) / len(counted))


def across(bearing: float) -> float:
    """The default course of a first guess: across the line of sight, a quarter turn
    clockwise of the bearing."""
    return (bearing + ACROSS_DEG) % 360.0


def start_on_bearing(origin: Position, bearing: float, range_m: float) -> Position:
    """Where a first guess by form starts: range_m along the bearing from the origin."""
    return destination(origin, Quantity(bearing, "deg"), Quantity(range_m, "m"))


@dataclass(frozen=True)
class OnLine:
    position: Position
    bearing: float  # the bearing of the line taken onto
    used: str  # which of the cut's bearings it is
    range_m: float


def onto_line(
    origin: Position, bearing: float, ambiguous: float | None, resolved: str | None, click: Position
) -> OnLine | None:
    """A click taken onto a cut's line: the point along it level with the click (its
    range from the origin times the cosine of the angle between them). An ambiguous cut
    not yet resolved: the nearer of its two lines. None for a click behind the origin
    (more than a quarter turn off the line), which is on no line."""
    distance, towards = range_bearing(origin, click)
    choices = [(bearing, "bearing")]
    if ambiguous is not None:
        if resolved == "ambiguous_bearing":
            choices = [(ambiguous, "ambiguous_bearing")]
        elif resolved is None:
            choices.append((ambiguous, "ambiguous_bearing"))
    line, used = min(choices, key=lambda c: abs(wrap(towards.value - c[0])))
    along = distance.value * math.cos(math.radians(wrap(towards.value - line)))
    if along <= 0:
        return None
    return OnLine(start_on_bearing(origin, line, along), line, used, along)


def course_speed(a: Position, b: Position, seconds: float) -> tuple[float, float]:
    """The course (degrees true, the geodesic's at a) and speed (metres a second) from a to
    b in the time given."""
    distance, bearing = range_bearing(a, b)
    return bearing.value, distance.value / seconds if seconds > 0 else 0.0
