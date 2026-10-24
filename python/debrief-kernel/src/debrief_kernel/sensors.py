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
from bisect import bisect_left
from dataclasses import dataclass
from typing import Literal

import numpy as np

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
    j = _fixes_before(times, time_ms) - 1  # the last fix before the time
    if j < 0:  # at the first fix: all of it astern
        return _astern_of_first(host, position, offset_m)
    # The leg from the ship back to that fix, then whole legs by the track's along-track
    # distance (worked out once per track), bisected for the leg that holds the array.
    first = _leg_m(position, positions[j])
    if first >= offset_m:
        return _on_leg(host, position, time_ms, positions[j], times[j], offset_m)
    along = _along(host)
    target = along[j] - (offset_m - first)
    if target <= 0:
        return _astern_of_first(host, positions[0], -target)
    k = max(1, bisect_left(along, target, 1, j + 1))
    return _on_leg(host, positions[k], times[k], positions[k - 1], times[k - 1], along[k] - target)


def _on_leg(
    host: TrackPath, behind: Position, behind_ms: int, fix: Position, fix_ms: int, run: float
) -> Place:
    """run metres from behind towards fix, along the geodesic between them."""
    leg = WGS84.Inverse(behind.latitude, behind.longitude, fix.latitude, fix.longitude)
    length = leg["s12"]
    point = WGS84.Direct(behind.latitude, behind.longitude, leg["azi1"], run)
    at_ms = (
        behind_ms - (behind_ms - fix_ms) * (min(run, length) / length) if length > 0 else behind_ms
    )
    course = host.reported_course_at(round(at_ms))
    return Place(Position(point["lon2"], point["lat2"]), course)


def _astern_of_first(host: TrackPath, first: Position, run: float) -> Place:
    """Past the start of the track: run metres astern of its first fix, along its course."""
    course = host.reported_course_at(host.times_ms[0])
    if course is None:
        return Place(first, None)
    return Place(_astern(first, course, run), course)


def _leg_m(a: Position, b: Position) -> float:
    """A leg's length: on the local ellipsoid if short, else along the geodesic."""
    short = _short_leg_m(a, b)
    if short is not None:
        return short
    return WGS84.Inverse(a.latitude, a.longitude, b.latitude, b.longitude)["s12"]


def _along(host: TrackPath) -> list[float]:
    """Each fix's distance along the track from its first, metres: each leg measured as
    _leg_m measures it (from the later fix back), summed in order; worked out once per
    track and kept with it, so a worm on a track of 200,000 fixes, or one that sat still
    for hours, bisects it rather than walking every leg (round 3: 26 s for 600 cuts on a
    track three-quarters still). vscode/webview/sensors.ts alongOf does the same."""
    found = getattr(host, "_worm_along", None)
    if found is not None:
        return found
    raw = getattr(host.positions, "_raw", None)
    if raw is not None:
        xy = np.asarray(raw, dtype=float).reshape(-1, 2)[:, :2] if len(raw) else np.zeros((0, 2))
    else:
        xy = np.array([[p.longitude, p.latitude] for p in host.positions], dtype=float).reshape(
            -1, 2
        )
    lon, lat = xy[:, 0], xy[:, 1]
    legs = np.zeros(len(lon))
    if len(lon) > 1:
        a_lon, a_lat, b_lon, b_lat = lon[1:], lat[1:], lon[:-1], lat[:-1]
        d_lat = b_lat - a_lat
        d_lon = (b_lon - a_lon + 540.0) % 360.0 - 180.0
        short = (
            (np.abs(d_lat) < _SHORT_DEG) & (np.abs(d_lon) < _SHORT_DEG) & (np.abs(a_lat) <= 89.0)
        )
        phi = np.radians((a_lat + b_lat) / 2)
        w = 1 - _E2 * np.sin(phi) ** 2
        north = np.radians(d_lat) * _A * (1 - _E2) / (w * np.sqrt(w))
        east = np.radians(d_lon) * _A / np.sqrt(w) * np.cos(phi)
        lengths = np.hypot(east, north)
        for i in np.flatnonzero(~short):
            lengths[i] = WGS84.Inverse(a_lat[i], a_lon[i], b_lat[i], b_lon[i])["s12"]
        legs[1:] = lengths
    along = np.cumsum(legs).tolist()
    host._worm_along = along  # type: ignore[attr-defined]
    return along


_SHORT_DEG = 0.01  # about a kilometre: a leg this short is measured on the local ellipsoid
_A = 6378137.0
_E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563)


def _short_leg_m(a: Position, b: Position) -> float | None:
    """The length of a short leg (both ends within _SHORT_DEG, away from the poles) on the
    ellipsoid's local plane at its middle latitude, to a part in 10^7 of the geodesic; None
    for a longer leg. A recorded track may log a fix a second: its legs are measured this
    way, and the one that holds the array taken along its geodesic (as the TypeScript
    does, line for line)."""
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
    course: float | None = None,
) -> Place | None:
    """Where a cut is drawn from, and the course its sides are told by: the position
    recorded with it, wherever its host was (legacy's absolute origin, drawn as recorded,
    never moved with the track), its course the one pinned with it (a derived origin,
    kept when its track was split) or else the host's then if known; or else where its
    sensor was (array_place); None outside the host's span."""
    if origin is not None:
        if course is None and host is not None:
            course = host.reported_course_at(time_ms)
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
