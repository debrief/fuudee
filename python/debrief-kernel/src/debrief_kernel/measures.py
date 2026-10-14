"""Measures between tracks at an instant: what the Tote shows (CAP-06, CAP-07).

A measure is relative (between the primary and a secondary, such as range)
or own (of one track, such as its course). The core measures follow legacy
Debrief's Tote: range, bearing (true), relative bearing, and each track's
course, speed and depth. Every measure group extends this core (CAP-07).

A track's state at a time is worked out as the map places its marker at
current time: its position along the geodesic between the fixes either side,
in proportion to time (geodesy.TrackPath, the twin of the map's positionAt).
Course, speed and depth are the track's recorded values interpolated the same
way, course the shorter way round through 360°; a track that recorded no
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

from debrief_kernel.geodesy import Position, TrackPath, range_bearing
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
    display: str  # quantity, bearing, relative_bearing or depth
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
        "quantity",
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
        "course",
        "Course",
        "Crse",
        "own",
        "angle",
        "bearing",
        "deg",
        "The course recorded at the fixes either side, interpolated the shorter way round; "
        "else the direction of the track there.",
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
            return normalise_bearing(a + fraction * bearing_difference(b, a))
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
    recorded, no course to measure a relative bearing from)."""
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
    if kind == "bearing":
        return brg.value
    if kind == "relative_bearing":
        if primary.course_deg is None:
            return None
        return relative_bearing(brg.value, primary.course_deg)
    raise KeyError(f"There is no measure {kind!r}.")


def relative_bearing(bearing_deg: float, heading_deg: float) -> float:
    """A bearing from a heading, in (-180, 180]: negative to port (red), positive to
    starboard (green), 180 dead astern."""
    return bearing_difference(bearing_deg, heading_deg)


def group_measures(group: MeasureGroup) -> list[MeasureDefinition]:
    """The definitions of a group's measures, in its order."""
    return [MEASURES[m] for m in group.measures]
