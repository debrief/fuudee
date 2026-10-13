"""Geodesic geometry on WGS84 (SUB-03).

All measurement is geodesic on the WGS84 ellipsoid, independent of the
display projection, using Karney's algorithms (geographiclib). Positions are
(longitude, latitude) in decimal degrees, matching GeoJSON order. Bearings are
true, clockwise from north, in [0, 360).
"""

from __future__ import annotations

import math
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass

from geographiclib.geodesic import Geodesic
from geographiclib.geodesicline import GeodesicLine

from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity, normalise_bearing
from debrief_schemas.generated import debrief as schema

WGS84 = Geodesic.WGS84
_INVERSE = Geodesic.DISTANCE | Geodesic.AZIMUTH


@dataclass(frozen=True, slots=True)
class Position:
    longitude: float
    latitude: float


def range_bearing(origin: Position, target: Position) -> tuple[Quantity, Quantity]:
    """Geodesic range in metres and initial true bearing in degrees from origin to target."""
    line = WGS84.Inverse(
        origin.latitude, origin.longitude, target.latitude, target.longitude, _INVERSE
    )
    return Quantity(line["s12"], "m"), Quantity(normalise_bearing(line["azi1"]), "deg")


def range_between(a: Position, b: Position) -> Quantity:
    return Quantity(_range_m(a, b), "m")


def _range_m(a: Position, b: Position) -> float:
    return WGS84.Inverse(a.latitude, a.longitude, b.latitude, b.longitude, Geodesic.DISTANCE)["s12"]


def destination(origin: Position, bearing: Quantity, distance: Quantity) -> Position:
    """The position reached by following a geodesic from origin."""
    result = WGS84.Direct(
        origin.latitude,
        origin.longitude,
        bearing.to("deg").value,
        distance.to("m").value,
        Geodesic.LATITUDE | Geodesic.LONGITUDE | Geodesic.LONG_UNROLL,
    )
    return Position(_wrap_longitude(result["lon2"]), result["lat2"])


def interpolate(
    a: Position, b: Position, fraction: float, line: GeodesicLine | None = None
) -> Position:
    """The point a given fraction of the way along the geodesic from a to b.

    ``line`` is the geodesic from a to b (``WGS84.InverseLine``) when the caller
    already has it, as TrackPath does: working it out is most of the cost.
    """
    if fraction <= 0.0:
        return a
    if fraction >= 1.0:
        return b
    if line is None:
        line = _line(a, b)
    point = line.Position(fraction * line.s13, Geodesic.LATITUDE | Geodesic.LONGITUDE)
    return Position(_wrap_longitude(point["lon2"]), point["lat2"])


def _line(a: Position, b: Position) -> GeodesicLine:
    return WGS84.InverseLine(a.latitude, a.longitude, b.latitude, b.longitude)


def geodesic_points(a: Position, b: Position, segments: int) -> list[Position]:
    """Points along the geodesic from a to b, for drawing it on a projected map (SUB-03)."""
    if segments < 1:
        raise ValueError("segments must be at least 1")
    line = WGS84.InverseLine(a.latitude, a.longitude, b.latitude, b.longitude)
    points = []
    for i in range(segments + 1):
        point = line.Position(
            line.s13 * i / segments, Geodesic.LATITUDE | Geodesic.LONGITUDE | Geodesic.LONG_UNROLL
        )
        points.append(Position(point["lon2"], point["lat2"]))
    return points


# Sides of the polygon that stands in for a circle or an ellipse in a plot file,
# so that other GeoJSON tools see the area (GeoJSON has no curves). Debrief
# draws circles and ellipses from their centre and size, not from this polygon.
CURVE_SIDES = 72


def circle_ring(centre: Position, radius: Quantity, sides: int = CURVE_SIDES) -> list[Position]:
    """A closed ring of positions at one geodesic range from centre, clockwise from north.

    The first position is due north of the centre and is repeated at the end,
    as a GeoJSON polygon ring requires.
    """
    if radius.to("m").value <= 0:
        raise ValueError("a circle's radius must be more than zero")
    return _ring(centre, lambda t: (t, radius.to("m").value), sides)


def ellipse_ring(
    centre: Position,
    semi_major: Quantity,
    semi_minor: Quantity,
    orientation: Quantity,
    sides: int = CURVE_SIDES,
) -> list[Position]:
    """A closed ring approximating an ellipse about centre.

    Its longer axis points along orientation (true, clockwise from north).
    Each position is at parametric angle t: (a cos t, b sin t) in the ellipse's
    own axes, found by following the geodesic from the centre at that point's
    bearing for that point's distance. As legacy Debrief drew them, so an
    imported ellipse keeps its shape. The first position is at the end of the
    longer axis, and is repeated at the end.
    """
    a, b = semi_major.to("m").value, semi_minor.to("m").value
    if not 0 < b <= a:
        raise ValueError(
            "an ellipse's semi-minor axis must be more than zero and at most its semi-major axis"
        )
    turn = orientation.to("deg").value

    def at(t_deg: float) -> tuple[float, float]:
        t = math.radians(t_deg)
        x, y = a * math.cos(t), b * math.sin(t)
        return (turn + math.degrees(math.atan2(y, x))) % 360.0, math.hypot(x, y)

    return _ring(centre, at, sides)


def _ring(centre: Position, at, sides: int) -> list[Position]:
    if sides < 3:
        raise ValueError("a ring needs at least three sides")
    ring = []
    for i in range(sides):
        bearing, distance = at(360.0 * i / sides)
        result = WGS84.Direct(
            centre.latitude,
            centre.longitude,
            bearing,
            distance,
            Geodesic.LATITUDE | Geodesic.LONGITUDE,
        )
        ring.append(Position(result["lon2"], result["lat2"]))
    ring.append(ring[0])
    return ring


def _wrap_longitude(longitude: float) -> float:
    wrapped = math.fmod(longitude + 180.0, 360.0)
    if wrapped < 0:
        wrapped += 360.0
    return wrapped - 180.0


class TrackPath:
    """A track's positions over time, interpolated along geodesics between fixes."""

    def __init__(self, times_ms: Sequence[int], positions: Sequence[Position]):
        if len(times_ms) != len(positions):
            raise ValueError("times and positions differ in length")
        if not times_ms:
            raise ValueError("a track needs at least one position")
        if any(a > b for a, b in zip(times_ms, times_ms[1:], strict=False)):
            raise ValueError("times are not in order")
        self.times_ms = list(times_ms)
        self.positions = list(positions)
        # The geodesic between each pair of fixes, worked out once: closest approach
        # asks for many positions along the same few legs.
        self._lines: dict[int, GeodesicLine] = {}

    @classmethod
    def from_feature(cls, feature: schema.TrackFeature) -> TrackPath:
        times = [parse_utc(t) for t in feature.properties.times]
        positions = [Position(lon, lat) for lon, lat in feature.geometry.coordinates]
        return cls(times, positions)

    @property
    def start_ms(self) -> int:
        return self.times_ms[0]

    @property
    def end_ms(self) -> int:
        return self.times_ms[-1]

    def position_at(self, time_ms: int) -> Position | None:
        """Position at a time, or None outside the track's time span."""
        if time_ms < self.start_ms or time_ms > self.end_ms:
            return None
        index = bisect_right(self.times_ms, time_ms) - 1
        if index >= len(self.times_ms) - 1:
            return self.positions[-1]
        t0, t1 = self.times_ms[index], self.times_ms[index + 1]
        if t1 == t0:
            return self.positions[index + 1]
        a, b = self.positions[index], self.positions[index + 1]
        line = self._lines.get(index)
        if line is None:
            line = self._lines[index] = _line(a, b)
        return interpolate(a, b, (time_ms - t0) / (t1 - t0), line)


@dataclass(frozen=True, slots=True)
class ClosestApproach:
    time_ms: int
    range: Quantity
    position_a: Position
    position_b: Position


_GOLDEN = (math.sqrt(5.0) - 1.0) / 2.0


def closest_approach(
    a: TrackPath, b: TrackPath, start_ms: int | None = None, end_ms: int | None = None
) -> ClosestApproach | None:
    """Closest point of approach between two tracks over their common time span.

    Between consecutive fixes of either track both platforms move along
    geodesics at constant rate, so range varies smoothly. Each such interval
    is searched by golden-section minimisation to millisecond resolution.
    Returns None if the tracks never overlap in time.
    """
    lo = max(a.start_ms, b.start_ms, start_ms if start_ms is not None else -math.inf)
    hi = min(a.end_ms, b.end_ms, end_ms if end_ms is not None else math.inf)
    if lo > hi:
        return None
    lo, hi = int(lo), int(hi)
    breaks = sorted({lo, hi, *(t for t in a.times_ms + b.times_ms if lo < t < hi)})

    ranges: dict[int, float] = {}

    def range_at(t: int) -> float:
        if t not in ranges:
            ranges[t] = _range_m(a.position_at(t), b.position_at(t))
        return ranges[t]

    best_t, best_r = lo, range_at(lo)
    for t0, t1 in zip(breaks, breaks[1:], strict=False):
        t, r = _minimise(range_at, t0, t1)
        if r < best_r:
            best_t, best_r = t, r
    if range_at(hi) < best_r:
        best_t, best_r = hi, range_at(hi)
    return ClosestApproach(
        best_t, Quantity(best_r, "m"), a.position_at(best_t), b.position_at(best_t)
    )


def _minimise(f, lo: int, hi: int) -> tuple[int, float]:
    """Golden-section search for a minimum on integer milliseconds in [lo, hi]."""
    a, b = float(lo), float(hi)
    c, d = b - _GOLDEN * (b - a), a + _GOLDEN * (b - a)
    fc, fd = f(round(c)), f(round(d))
    while b - a > 2.0:
        if fc <= fd:
            b, d, fd = d, c, fc
            c = b - _GOLDEN * (b - a)
            fc = f(round(c))
        else:
            a, c, fc = c, d, fd
            d = a + _GOLDEN * (b - a)
            fd = f(round(d))
    candidates = {lo, hi, *range(int(math.floor(a)), int(math.ceil(b)) + 1)}
    best = min((t for t in candidates if lo <= t <= hi), key=f)
    return best, f(best)
