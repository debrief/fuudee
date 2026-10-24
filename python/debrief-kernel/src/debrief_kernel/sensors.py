"""Sensor cuts: where they are drawn from and to, and which side a bearing is on (CAP-22).

Ported from legacy Debrief's SensorContactWrapper. A cut is drawn from the host track's
position at the cut's time (as the map places tracks: along the geodesic between the
fixes either side, TrackPath.position_at), or from the position recorded with the cut,
along the geodesic at its bearing: to its range, or else past the edge of the view
(legacy drew it twice the plot area's larger side, at most five degrees of arc). Legacy
drew nothing outside the host track's span, and neither does Debrief.

A towed array cannot tell a bearing from its mirror image about the array, so such a cut
carries two: its bearing and its ambiguous bearing. Which side of the host's course a
bearing is on is legacy's relBearing: the bearing less the course, within ±180°, to port
when negative. As legacy's ditchBearing decides it, keeping port (or starboard) keeps the
bearing recorded first if it is on that side, and otherwise its twin: only the first
bearing's side is asked.

Python (here) and TypeScript (vscode/webview/sensors.ts) are held to
schemas/vectors/sensor-cuts.json.
"""

from __future__ import annotations

from typing import Literal

from debrief_kernel.geodesy import Position, TrackPath, destination
from debrief_kernel.units import Quantity

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


def cut_origin(
    host: TrackPath | None, time_ms: int, origin: Position | None = None
) -> Position | None:
    """Where a cut is drawn from: the position recorded with it, or the host's position at
    its time; None outside the host's span, where legacy drew nothing (a cut with its own
    position too, since legacy drew no cut its track was not visible for)."""
    if host is None or host.position_at(time_ms) is None:
        return None
    return origin if origin is not None else host.position_at(time_ms)


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
