"""Measures between tracks at an instant: what the Tote shows (CAP-06, CAP-07).

A measure is relative (between the primary and a secondary, such as range)
or own (of one track, such as its course). The core measures follow legacy
Debrief's Tote: range, bearing (true), relative bearing, angle on the bow and
bearing rate, and each track's course, speed and depth (decisions, 14 Oct
2026). Every measure group extends this core (CAP-07).

Angle on the bow is the primary's bearing from the secondary, less the
secondary's course: the secondary's aspect as the primary sees it, red to port
and green to starboard as relative bearing is. Bearing rate is how fast the
true bearing from the primary changes, from both tracks' courses and speeds at
that instant: each is moved a second either way along its course (geodesic),
and the bearing between them measured again. Positive is drawing right
(clockwise), negative drawing left, in degrees per minute (the angular-rate
kind).

A track's state at a time is worked out as the map places its marker at
current time: its position along the geodesic between the fixes either side,
in proportion to time (geodesy.TrackPath, the twin of the map's positionAt).
Course, speed and depth are the track's recorded values interpolated the same
way, course the shorter way round through 360°, except across a reversal (courses
either side opposite, within 0.5°), where it is the nearer fix's (decision, 14 Oct
2026); a track that recorded no
courses or speeds has them from its positions: the geodesic's direction at
that point, and the leg's length over its duration.

Values are in metres, degrees and metres per second; the views format them
with the analyst's settings (SUB-04).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from geographiclib.geodesic import Geodesic

from debrief_kernel.geodesy import WGS84, Position, TrackPath, range_bearing
from debrief_kernel.time import parse_utc
from debrief_kernel.units import (
    FACTORS,
    bearing_difference,
    kind_of,
    normalise_bearing,
    series_values,
)
from debrief_schemas.generated import debrief as schema

_POINT = Geodesic.LATITUDE | Geodesic.LONGITUDE | Geodesic.AZIMUTH


@dataclass(frozen=True, slots=True)
class MeasureDefinition:
    """One measure the Tote can show (schema MeasureDefinition)."""

    id: str
    title: str
    label: str
    subject: str  # relative or own
    quantity_kind: str
    display: str  # quantity, range, bearing, relative_bearing or depth
    unit: str  # the unit its values are worked out in
    explanation: str

    def to_json(self) -> dict[str, str]:
        return {
            "id": self.id,
            "title": self.title,
            "label": self.label,
            "subject": self.subject,
            "quantity_kind": self.quantity_kind,
            "display": self.display,
            "explanation": self.explanation,
        }


CORE_MEASURES: tuple[MeasureDefinition, ...] = (
    MeasureDefinition(
        "range",
        "Range from the primary",
        "Range",
        "relative",
        "length",
        "range",
        "m",
        "The geodesic distance from the primary to the track (WGS84).",
    ),
    MeasureDefinition(
        "bearing",
        "Bearing from the primary, true",
        "Brg",
        "relative",
        "angle",
        "bearing",
        "deg",
        "The direction from the primary to the track, true, along the geodesic.",
    ),
    MeasureDefinition(
        "relative_bearing",
        "Relative bearing: from the primary's head, red to port, green to starboard",
        "Rel",
        "relative",
        "angle",
        "relative_bearing",
        "deg",
        "The bearing less the primary's course: negative (red) to port, positive (green) to "
        "starboard.",
    ),
    MeasureDefinition(
        "aob",
        "Angle on the bow: the primary's bearing from the track's head, red to port, green to "
        "starboard",
        "AOB",
        "relative",
        "angle",
        "relative_bearing",
        "deg",
        "The bearing from the track to the primary less the track's course: the track's aspect "
        "as the primary sees it, negative (red) to port, positive (green) to starboard.",
    ),
    MeasureDefinition(
        "bearing_rate",
        "Bearing rate: how fast the bearing from the primary changes, right positive",
        "Brg rate",
        "relative",
        "angular_rate",
        "quantity",
        "deg/min",
        "The rate of change of the true bearing from the primary, from both tracks' courses and "
        "speeds: positive drawing right (clockwise), negative drawing left.",
    ),
    MeasureDefinition(
        "course",
        "Course",
        "Crse",
        "own",
        "angle",
        "bearing",
        "deg",
        "The course recorded at the fixes either side, interpolated the shorter way round; "
        "where they are opposite (within 0.5°), the nearer fix's course; else the direction "
        "of the track there.",
    ),
    MeasureDefinition(
        "speed",
        "Speed",
        "Spd",
        "own",
        "speed",
        "quantity",
        "m/s",
        "The speed recorded at the fixes either side, interpolated; else the leg's length over "
        "its duration.",
    ),
    MeasureDefinition(
        "depth",
        "Depth",
        "Depth",
        "own",
        "length",
        "depth",
        "m",
        "The depth recorded at the fixes either side, interpolated; none where none is recorded.",
    ),
)

MEASURES: dict[str, MeasureDefinition] = {m.id: m for m in CORE_MEASURES}

CORE_GROUP_ID = "core"

# Recorded courses either side this close to opposite are a reversal (decision, 14 Oct
# 2026): the course is not interpolated across it, but the nearer fix's.
REVERSAL_TOLERANCE_DEG = 0.5

# Closer than this, two tracks are in one place: the range is zero and there is no bearing
# (geodesy would give 180°, which reads as a real direction).
COINCIDENT_M = 0.001


@dataclass(frozen=True, slots=True)
class MeasureGroup:
    """A named set of measures tied to a mode of analysis (CAP-07). Every group extends
    core; a study's own groups (part B) add measures after core's."""

    id: str
    title: str
    measures: tuple[str, ...]
    description: str | None = None
    extends: str | None = None

    def to_json(self) -> dict[str, object]:
        out: dict[str, object] = {"id": self.id, "title": self.title}
        if self.description:
            out["description"] = self.description
        if self.extends:
            out["extends"] = self.extends
        out["measures"] = list(self.measures)
        return out


CORE_GROUP = MeasureGroup(
    CORE_GROUP_ID,
    "Core",
    tuple(m.id for m in CORE_MEASURES),
    "Relative geometry every mode of analysis shares, as legacy Debrief's Tote showed it.",
)


@dataclass(frozen=True, slots=True)
class TrackState:
    """Where a track is at an instant, and how it is moving."""

    position: Position
    course_deg: float | None
    speed_ms: float | None
    depth_m: float | None


class TrackMotion:
    """A track's position, course, speed and depth at any time within its span."""

    def __init__(
        self,
        times_ms: Sequence[int],
        positions: Sequence[Position],
        courses_deg: Sequence[float] | None = None,
        speeds_ms: Sequence[float] | None = None,
        depths_m: Sequence[float] | None = None,
    ):
        self.path = TrackPath(times_ms, positions)
        count = len(self.path.times_ms)
        for name, series in (
            ("courses", courses_deg),
            ("speeds", speeds_ms),
            ("depths", depths_m),
        ):
            if series is not None and len(series) != count:
                raise ValueError(f"{name} and times differ in length")
        self.courses = list(courses_deg) if courses_deg is not None else None
        self.speeds = list(speeds_ms) if speeds_ms is not None else None
        self.depths = list(depths_m) if depths_m is not None else None

    @classmethod
    def from_feature(cls, feature: schema.TrackFeature) -> TrackMotion:
        props = feature.properties
        times = [parse_utc(t) for t in props.times]
        positions = [Position(lon, lat) for lon, lat in feature.geometry.coordinates]
        return cls(
            times,
            positions,
            series_values(props.courses, "deg") if props.courses else None,
            series_values(props.speeds, "m/s") if props.speeds else None,
            _lengths(props.depths) if props.depths else None,
        )

    @property
    def start_ms(self) -> int:
        return self.path.start_ms

    @property
    def end_ms(self) -> int:
        return self.path.end_ms

    def state_at(self, time_ms: int) -> TrackState | None:
        """The track's state at a time, or None outside its span."""
        leg = self.path.leg_at(time_ms)
        if leg is None:
            return None
        index, fraction = leg
        last = len(self.path.times_ms) - 1
        if index >= last:  # at the last fix: its own values, the last leg's direction
            index, fraction = max(last - 1, 0), 1.0 if last else 0.0
        if last == 0:
            only = self.path.positions[0]
            return TrackState(
                only,
                normalise_bearing(self.courses[0]) if self.courses else None,
                self.speeds[0] if self.speeds else None,
                self.depths[0] if self.depths else None,
            )
        line = self.path.line(index)
        point = line.Position(fraction * line.s13, _POINT)
        position = Position(_wrap(point["lon2"]), point["lat2"])
        if fraction <= 0.0:
            position = self.path.positions[index]
        elif fraction >= 1.0:
            position = self.path.positions[index + 1]
        return TrackState(
            position,
            self._course(index, fraction, line, point),
            self._speed(index, fraction, line),
            _between(self.depths, index, fraction),
        )

    def _course(self, index: int, fraction: float, line, point) -> float | None:
        if self.courses is not None:
            a, b = self.courses[index], self.courses[index + 1]
            turn = bearing_difference(b, a)
            if abs(turn) >= 180.0 - REVERSAL_TOLERANCE_DEG:
                # A reversal: no shorter way round, and a course half way is one neither
                # fix had. The nearer fix's course; half way, the later one's.
                return normalise_bearing(a if fraction < 0.5 else b)
            return normalise_bearing(a + fraction * turn)
        if line.s13 <= 0.0:  # no movement on this leg: no direction to give
            return None
        return normalise_bearing(point["azi2"])

    def _speed(self, index: int, fraction: float, line) -> float | None:
        if self.speeds is not None:
            return _between(self.speeds, index, fraction)
        span_ms = self.path.times_ms[index + 1] - self.path.times_ms[index]
        if span_ms <= 0:
            return None
        return line.s13 / (span_ms / 1000.0)


def _between(series: list[float] | None, index: int, fraction: float) -> float | None:
    if series is None:
        return None
    a, b = series[index], series[index + 1]
    return a + fraction * (b - a)


def _lengths(series: schema.LengthSeries) -> list[float]:
    unit = str(series.unit)
    factor = FACTORS[kind_of(unit)][unit]
    return [v * factor for v in series.values]


def _wrap(longitude: float) -> float:
    wrapped = math.fmod(longitude + 180.0, 360.0)
    if wrapped < 0:
        wrapped += 360.0
    return wrapped - 180.0


def measure(
    definition: MeasureDefinition, track: TrackState, primary: TrackState | None
) -> float | None:
    """One measure's value for a track at an instant, in definition.unit; None when it
    cannot be worked out (no primary at that time for a relative measure, no depth
    recorded, no course to measure a relative bearing from, no bearing between two tracks
    in one place)."""
    kind = definition.id
    if kind == "course":
        return track.course_deg
    if kind == "speed":
        return track.speed_ms
    if kind == "depth":
        return track.depth_m
    if primary is None:
        return None
    rng, brg = range_bearing(primary.position, track.position)
    if kind == "range":
        return rng.value
    if rng.value < COINCIDENT_M:  # one place: no direction from one to the other
        return None
    if kind == "bearing":
        return brg.value
    if kind == "relative_bearing":
        if primary.course_deg is None:
            return None
        return relative_bearing(brg.value, primary.course_deg)
    if kind == "aob":
        if track.course_deg is None:
            return None
        _, back = range_bearing(track.position, primary.position)
        return relative_bearing(back.value, track.course_deg)
    if kind == "bearing_rate":
        return bearing_rate(primary, track)
    raise KeyError(f"There is no measure {kind!r}.")


def relative_bearing(bearing_deg: float, heading_deg: float) -> float:
    """A bearing from a heading, in (-180, 180]: negative to port (red), positive to
    starboard (green), 180 dead astern."""
    return bearing_difference(bearing_deg, heading_deg)


# How far either side of the instant each track is moved to measure bearing rate.
_RATE_STEP_S = 1.0


def _moved(state: TrackState, seconds: float) -> Position:
    """Where a track would be after so many seconds (before, if negative) on its course and
    speed at the instant, along the geodesic."""
    assert state.course_deg is not None and state.speed_ms is not None
    p = state.position
    out = WGS84.Direct(p.latitude, p.longitude, state.course_deg, state.speed_ms * seconds, _POINT)
    return Position(_wrap(out["lon2"]), out["lat2"])


def bearing_rate(primary: TrackState, track: TrackState) -> float | None:
    """How fast the true bearing from the primary to the track changes, in degrees per
    minute, positive clockwise (drawing right); None without both tracks' courses and
    speeds, or with the two in one place."""
    states = (primary, track)
    if any(s.course_deg is None or s.speed_ms is None for s in states):
        return None
    step = _RATE_STEP_S
    _, before = range_bearing(_moved(primary, -step), _moved(track, -step))
    _, after = range_bearing(_moved(primary, step), _moved(track, step))
    return bearing_difference(after.value, before.value) / (2 * step) * 60.0


def group_measures(group: MeasureGroup) -> list[MeasureDefinition]:
    """The definitions of a group's measures, in its order."""
    return [MEASURES[m] for m in group.measures]
