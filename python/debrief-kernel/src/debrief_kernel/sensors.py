"""Sensor cuts: where they are drawn from and to, and which side a bearing is on (CAP-22).

Ported from legacy Debrief's SensorContactWrapper. A cut is drawn from where its sensor
was at the cut's time (cut_place): the host track's position then (as the map places
tracks: along the geodesic between the fixes either side, TrackPath.position_at), or, for
a towed array with an offset, the array's position that far behind it (array_place,
legacy's ArrayOffsetHelper and WormInHoleOffset); or from the position recorded with the
cut. It runs along the geodesic at its bearing: to its range (a range of 0 is a point, as
legacy drew it), or else past the edge of the view (legacy drew it twice the plot area's
larger side, at most five degrees of arc). Legacy drew nothing outside the host track's
span, and neither does Debrief, except a cut with its own recorded position, which legacy
drew wherever its host was.

A towed array cannot tell a bearing from its mirror image about the array, so such a cut
carries two: its bearing and its ambiguous bearing. Which side of the host's course a
bearing is on is legacy's relBearing: the bearing less the course, within ±180°, to port
when negative. As legacy's ditchBearing decides it, keeping port (or starboard) keeps the
bearing recorded first if it is on that side, and otherwise its twin: only the first
bearing's side is asked. The course is legacy's too: the course recorded at the first fix
at or after the time (TrackPath.reported_course_at), where the track records courses; at
a turn it can differ from the direction the line between fixes takes. For an array with
an offset, the course where the array is.

Python (here) and TypeScript (vscode/webview/sensors.ts) are held to
schemas/vectors/sensor-cuts.json.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from debrief_kernel.geodesy import WGS84, Position, TrackPath, destination
from debrief_kernel.units import Quantity, normalise_bearing

# Legacy MAXIMUM_SENSOR_BEARING_RANGE: five degrees of arc, a cut without a range drawn
# no further. A degree of arc is sixty nautical miles: 300 nmi.
DEFAULT_LENGTH_CAP_M = 5 * 60 * 1852.0

Side = Literal["port", "starboard"]
Kept = Literal["bearing", "ambiguous_bearing"]
Keep = Literal["port", "starboard", "bearing", "ambiguous_bearing", "ambiguous"]
KEEPS: tuple[str, ...] = ("port", "starboard", "bearing", "ambiguous_bearing", "ambiguous")


def relative_bearing(course_deg: float, bearing_deg: float) -> float:
    """The bearing relative to the course, within ±180°: legacy relBearing."""
    relative = bearing_deg - course_deg
    while relative > 180:
        relative -= 360
    while relative < -180:
        relative += 360
    return relative


def side_of(course_deg: float, bearing_deg: float) -> Side:
    """Port when the bearing is to the left of the course (legacy isBearingToPort)."""
    return "port" if relative_bearing(course_deg, bearing_deg) < 0 else "starboard"


def default_length_m(view_width_m: float, view_height_m: float) -> float:
    """How far a cut without a range is drawn: twice the view's larger side, so it runs
    off the map, at most five degrees of arc (legacy getEnd)."""
    return min(2 * max(view_width_m, view_height_m), DEFAULT_LENGTH_CAP_M)


ArrayMode = Literal["worm_in_hole", "plain"]


@dataclass(frozen=True)
class Place:
    """Where a cut is taken from, and the course its port and starboard are told by
    (None where the course is not known: outside the host's span, or a track that never
    moved)."""

    position: Position
    course: float | None


def array_place(
    host: TrackPath, time_ms: int, offset_m: float = 0.0, mode: ArrayMode = "worm_in_hole"
) -> Place | None:
    """Where a sensor offset_m astern of the ship was at a time, and the course there;
    None outside the host's span. With no offset, the ship's own position.

    Worm in the hole (legacy WormInHoleOffset.getWormOffsetFor, legacy's default): from
    the ship's position, back along its own past track, leg by leg, until offset_m has
    been run; so the array lags through a turn. Each leg is the geodesic between fixes, as
    the map draws it (legacy took a straight line in degrees and a position by time on
    it). Where the track before the time is shorter than the offset, the rest is run
    astern of the first fix along its course, as legacy did. The course is the one
    recorded where the array is (reported_course_at at the time the ship was there).
    Plain (legacy getBacktraceTo): offset_m straight astern of the ship's position, along
    its course then."""
    position = host.position_at(time_ms)
    if position is None:
        return None
    if offset_m <= 0:
        return Place(position, host.reported_course_at(time_ms))
    if mode == "plain":
        course = host.reported_course_at(time_ms)
        if course is None:
            return Place(position, None)
        return Place(_astern(position, course, offset_m), course)
    times, positions = host.times_ms, host.positions
    remaining = offset_m
    behind, behind_ms = position, time_ms
    for j in range(_fixes_before(times, time_ms) - 1, -1, -1):
        fix = positions[j]
        short = _short_leg_m(behind, fix)
        if short is not None and short < remaining - _SHORT_MARGIN_M:
            remaining -= short
            behind, behind_ms = fix, times[j]
            continue
        leg = WGS84.Inverse(behind.latitude, behind.longitude, fix.latitude, fix.longitude)
        length = leg["s12"]
        if length >= remaining:
            point = WGS84.Direct(behind.latitude, behind.longitude, leg["azi1"], remaining)
            at_ms = behind_ms - (behind_ms - times[j]) * (remaining / length)
            course = host.reported_course_at(round(at_ms))
            return Place(Position(point["lon2"], point["lat2"]), course)
        remaining -= length
        behind, behind_ms = fix, times[j]
    course = host.reported_course_at(times[0])
    if course is None:
        return Place(behind, None)
    return Place(_astern(behind, course, remaining), course)


_SHORT_DEG = 0.01  # about a kilometre: a leg this short is measured on the local ellipsoid
_SHORT_MARGIN_M = 0.01
_A = 6378137.0
_E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563)


def _short_leg_m(a: Position, b: Position) -> float | None:
    """The length of a short leg (both ends within _SHORT_DEG, away from the poles) on the
    ellipsoid's local plane at its middle latitude, to a part in 10^7 of the geodesic; None
    for a longer leg. A worm walks back through every fix it passes, and a recorded track
    may log one a second: the walk skips such legs this way, and takes the geodesic of the
    one that holds the end (as the TypeScript does, line for line)."""
    d_lat = b.latitude - a.latitude
    d_lon = (b.longitude - a.longitude + 540.0) % 360.0 - 180.0
    if abs(d_lat) >= _SHORT_DEG or abs(d_lon) >= _SHORT_DEG or abs(a.latitude) > 89.0:
        return None
    phi = math.radians((a.latitude + b.latitude) / 2)
    w = 1 - _E2 * math.sin(phi) ** 2
    north = math.radians(d_lat) * _A * (1 - _E2) / (w * math.sqrt(w))
    east = math.radians(d_lon) * _A / math.sqrt(w) * math.cos(phi)
    return math.hypot(east, north)


def _fixes_before(times, time_ms: int) -> int:
    """How many fixes are before the time (strictly): legacy's back track."""
    low, high = 0, len(times)
    while low < high:
        middle = (low + high) >> 1
        if times[middle] < time_ms:
            low = middle + 1
        else:
            high = middle
    return low


def _astern(position: Position, course: float, metres: float) -> Position:
    return destination(
        position, Quantity(normalise_bearing(course + 180), "deg"), Quantity(metres, "m")
    )


def cut_place(
    host: TrackPath | None,
    time_ms: int,
    origin: Position | None = None,
    offset_m: float = 0.0,
    mode: ArrayMode = "worm_in_hole",
) -> Place | None:
    """Where a cut is drawn from, and the course its sides are told by: the position
    recorded with it, wherever its host was (legacy's absolute origin, drawn as recorded,
    never moved with the track), its course the host's then if known; or else where its
    sensor was (array_place); None outside the host's span."""
    if origin is not None:
        course = host.reported_course_at(time_ms) if host is not None else None
        return Place(origin, course)
    if host is None:
        return None
    return array_place(host, time_ms, offset_m, mode)


def cut_origin(
    host: TrackPath | None, time_ms: int, origin: Position | None = None
) -> Position | None:
    """Where a cut is drawn from (cut_place's position)."""
    place = cut_place(host, time_ms, origin)
    return place.position if place else None


def cut_end(origin: Position, bearing_deg: float, length_m: float) -> Position:
    """Where a cut's line ends: along the geodesic from its origin at its bearing."""
    return destination(origin, Quantity(bearing_deg, "deg"), Quantity(length_m, "m"))


def kept_for(
    keep: str, bearing_deg: float, ambiguous_deg: float | None, course_deg: float | None
) -> Kept | None:
    """Which of a cut's bearings keeping port, starboard, the first bearing or the
    ambiguous one keeps; None when there is nothing to choose between (no ambiguous
    bearing), or port or starboard is asked and the host's course is not known."""
    if ambiguous_deg is None or keep == "ambiguous":
        return None
    if keep in ("bearing", "ambiguous_bearing"):
        return keep  # type: ignore[return-value]
    if course_deg is None:
        return None
    first = side_of(course_deg, bearing_deg)
    return "bearing" if first == keep else "ambiguous_bearing"


def drawn_bearings(
    bearing_deg: float, ambiguous_deg: float | None, resolved: str | None
) -> list[tuple[Kept, float]]:
    """The lines a cut is drawn as: both bearings until it is resolved, then the one kept;
    its bearing alone where it was never ambiguous."""
    if ambiguous_deg is None:
        return [("bearing", bearing_deg)]
    if resolved == "bearing":
        return [("bearing", bearing_deg)]
    if resolved == "ambiguous_bearing":
        return [("ambiguous_bearing", ambiguous_deg)]
    return [("bearing", bearing_deg), ("ambiguous_bearing", ambiguous_deg)]
