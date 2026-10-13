"""Tracks moved, rotated, split and merged by hand (CAP-01, CAP-02).

Each operation here makes new track features from old ones; the catalogue
records the result as one step in the plot's history, named in the words the
History view shows ("BLUE ONE moved 1.20 nmi 045.0°T"), with who did it and
what they asked for in its provenance record (SUB-19, SUB-24). Track edits are
destructive in the working plot (CAP-02): undo is replay to the step before
(SUB-21), never an inverse operation.

Geodesic throughout (SUB-03), never a change of latitude and longitude:

- A move takes every fix in the period the same range along the same true
  bearing, each along its own geodesic (the forward problem). Near a pole,
  or for a long move, the shape of the track changes slightly as a result,
  exactly as moving each fix that range and bearing on a chart would.
- A rotation keeps each fix's range from the pivot and turns its bearing from
  the pivot by the angle (the inverse problem, then the forward one).

A period limits either to the fixes whose times fall in it, ends included.
The fixes outside it stay where they are, so the joins jump: the track is not
made continuous, and the map shows the jump while the analyst drags.

Splitting at a time makes two tracks: the fixes before it, keeping the
track's id (so sensors and named sets that refer to it still do), and the
fixes from it on, under a new id. Merging joins tracks in time order under
the earliest's id; tracks that overlap in time are not merged, and the
message says where they overlap.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from debrief_kernel.formatting import (
    DEFAULT_SETTINGS,
    UNIT_LABELS,
    fixed,
    format_bearing,
    format_position,
    format_quantity,
    format_time,
)
from debrief_kernel.geodesy import Position, destination, range_bearing
from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models

# A part of a split track, as a LineString, needs at least two fixes.
FEWEST_FIXES = 2


class TrackError(ValueError):
    """A track operation that cannot be done as asked, said in plain words."""


def times_of(track: models.TrackFeature) -> list[int]:
    return [parse_utc(t) for t in track.properties.times]


def _when(ms: int) -> str:
    return format_time(ms, DEFAULT_SETTINGS)


def period_indices(track: models.TrackFeature, period: tuple[int, int] | None) -> list[int]:
    """The fixes a period takes in: those whose times fall in it, ends included.
    Every fix when there is no period. Refused, plainly, when it takes in none."""
    times = times_of(track)
    if period is None:
        return list(range(len(times)))
    start, end = period
    if start > end:
        raise TrackError("The period ends before it starts.")
    indices = [i for i, t in enumerate(times) if start <= t <= end]
    if not indices:
        raise TrackError(
            f"{track.properties.name} has no fixes from {_when(start)} to {_when(end)}, "
            "so nothing was changed."
        )
    return indices


def _with_positions(
    track: models.TrackFeature, positions: list[list[float]], courses: list[float] | None = None
) -> models.TrackFeature:
    props = track.properties
    update: dict = {}
    if courses is not None and props.courses is not None:
        update["courses"] = props.courses.model_copy(update={"values": courses})
    geometry = track.geometry.model_copy(update={"coordinates": positions})
    return track.model_copy(
        update={"geometry": geometry, "properties": props.model_copy(update=update)}
    )


def moved(
    track: models.TrackFeature, distance: Quantity, bearing: Quantity, indices: Sequence[int]
) -> models.TrackFeature | None:
    """The track with each fix at indices taken distance along bearing (true), each
    along its own geodesic. None if it would not move. Courses and speeds over
    ground are kept: every fix moves the same way, so the track's own motion
    between moved fixes is as it was."""
    if distance.to("m").value < 0:
        raise TrackError("A move's distance cannot be negative.")
    if distance.to("m").value == 0:
        return None
    positions = [list(p) for p in track.geometry.coordinates]
    for i in indices:
        lon, lat = positions[i]
        to = destination(Position(lon, lat), bearing, distance)
        positions[i] = [to.longitude, to.latitude]
    return _with_positions(track, positions)


def rotated(
    track: models.TrackFeature, pivot: Position, angle: Quantity, indices: Sequence[int]
) -> models.TrackFeature | None:
    """The track with each fix at indices turned about pivot by angle (positive is
    clockwise): its range from the pivot kept, its bearing from it turned. None if
    nothing turns.

    The course at each fix turned keeps its angle to the geodesic from the pivot,
    as a rigid turn does: near the pivot that is the angle itself; far from it, or
    near a pole, the meridians converge and the course turns by more or less (turned
    about a pole, a ship steering 090 still steers 090). So the courses stay the
    track's own direction of travel, as drawn."""
    turn = angle.to("deg").value
    if turn % 360.0 == 0:
        return None
    positions = [list(p) for p in track.geometry.coordinates]
    turns = {i: turn for i in indices}
    for i in indices:
        lon, lat = positions[i]
        fix = Position(lon, lat)
        distance, bearing = range_bearing(pivot, fix)
        if distance.value == 0:
            continue
        to = destination(pivot, Quantity(bearing.value + turn, "deg"), distance)
        positions[i] = [to.longitude, to.latitude]
        # The geodesic from the pivot arrives at the fix on the reverse of the bearing
        # back to the pivot: how much that turned is how much the course turns.
        back_before = range_bearing(fix, pivot)[1].value
        back_after = range_bearing(to, pivot)[1].value
        turns[i] = back_after - back_before
    courses = None
    series = track.properties.courses
    if series is not None:
        unit = str(series.unit)
        full = Quantity(360.0, "deg").to(unit).value
        courses = list(series.values)
        for i in indices:
            courses[i] = (courses[i] + Quantity(turns[i], "deg").to(unit).value) % full
    return _with_positions(track, positions, courses)


def default_pivot(
    track: models.TrackFeature, indices: Sequence[int], current_ms: int | None
) -> Position:
    """Where a rotation turns about unless the analyst chooses: the fix in the period
    nearest current time, when current time is within the period's fixes; otherwise
    the period's first fix."""
    times = times_of(track)
    coordinates = track.geometry.coordinates
    choice = indices[0]
    if current_ms is not None and times[indices[0]] <= current_ms <= times[indices[-1]]:
        choice = min(indices, key=lambda i: (abs(times[i] - current_ms), i))
    lon, lat = coordinates[choice]
    return Position(lon, lat)


def describe_move(name: str, distance: Quantity, bearing: Quantity, part: bool) -> str:
    """What the History view calls a move: "BLUE ONE moved 1.20 nmi 045.0°T"."""
    what = f"{name} part" if part else name
    text = format_quantity(distance)
    if not any(c in "123456789" for c in text.split(" ")[0]):
        # Too small for the decimals shown: three figures in its own unit, never "0.00 nmi".
        text = f"{float(f'{distance.value:.3g}'):g} {UNIT_LABELS[distance.unit]}"
    return f"{what} moved {text} {format_bearing(bearing)}"


def describe_rotation(name: str, angle: Quantity, part: bool) -> str:
    """What the History view calls a rotation: "BLUE ONE rotated 12.0° clockwise"."""
    turn = angle.to("deg").value
    sense = "clockwise" if turn > 0 else "anticlockwise"
    what = f"{name} part" if part else name
    return f"{what} rotated {fixed(abs(turn), DEFAULT_SETTINGS.angle_decimals)}° {sense}"


def describe_period(period: tuple[int, int] | None) -> str | None:
    if period is None:
        return None
    return f"Only the fixes from {_when(period[0])} to {_when(period[1])}"


def describe_pivot(pivot: Position) -> str:
    return f"About {format_position(pivot)}"


# --- Splitting and merging -----------------------------------------------------------


def new_track_id(name: str, taken: set[str]) -> str:
    """An id for a new track, from its name, not used in the plot."""
    base = "track-" + (re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "unnamed")
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    return candidate


def _sliced(track: models.TrackFeature, part: slice, **update) -> models.TrackFeature:
    props = track.properties
    series = {
        name: getattr(props, name).model_copy(update={"values": getattr(props, name).values[part]})
        for name in ("speeds", "courses", "depths")
        if getattr(props, name) is not None
    }
    times = props.times[part]
    # Marked fixes go with their fixes: found by time, so each part keeps its own.
    kept = set(times)
    marks = [m for m in props.fix_marks or [] if m.time in kept] or None
    properties = props.model_copy(
        update={"times": times, "fix_marks": marks, **series, **update.pop("properties", {})}
    )
    geometry = track.geometry.model_copy(update={"coordinates": track.geometry.coordinates[part]})
    return track.model_copy(update={"geometry": geometry, "properties": properties, **update})


def split(
    track: models.TrackFeature, at_ms: int, names: tuple[str, str], second_id: str
) -> tuple[models.TrackFeature, models.TrackFeature]:
    """The track split at a time: the fixes before it, keeping the track's id, and
    the fixes from it on, under second_id. Each keeps the track's style, platform
    class, hiding and provenance. Each part needs at least two fixes."""
    first_name, second_name = (n.strip() for n in names)
    if not first_name or not second_name:
        raise TrackError("Give each part of the split track a name.")
    if first_name == second_name:
        raise TrackError("Give the two parts of the split track different names.")
    times = times_of(track)
    cut = next((i for i, t in enumerate(times) if t >= at_ms), len(times))
    name = track.properties.name
    before, after = cut, len(times) - cut
    if before < FEWEST_FIXES or after < FEWEST_FIXES:
        raise TrackError(
            f"{name} was not split at {_when(at_ms)}: it has {_fixes(before)} before then "
            f"and {_fixes(after)} from then on, and each part needs at least {FEWEST_FIXES}."
        )
    first = _sliced(track, slice(0, cut), properties={"name": first_name})
    second = _sliced(track, slice(cut, None), id=second_id, properties={"name": second_name})
    return first, second


def _fixes(n: int) -> str:
    return "1 fix" if n == 1 else f"{n} fixes"


@dataclass(frozen=True)
class Overlap:
    first: str
    second: str
    start_ms: int
    end_ms: int


def overlaps(tracks: Sequence[models.TrackFeature]) -> list[Overlap]:
    """Every pair of tracks whose times overlap. Tracks that only meet (one ends when
    the next starts) do not overlap."""
    spans = sorted(
        ((times_of(t)[0], times_of(t)[-1], t.properties.name) for t in tracks),
        key=lambda s: (s[0], s[1]),
    )
    found = []
    for i, (_, end_a, name_a) in enumerate(spans):
        for start_b, end_b, name_b in spans[i + 1 :]:
            if start_b < end_a:
                found.append(Overlap(name_a, name_b, start_b, min(end_a, end_b)))
    return found


_PART = re.compile(r"^(.*\S) \((\d+)\)$")


def merged_name(names: Sequence[str]) -> str:
    """What merged tracks are called unless the analyst says: the earliest's name; or,
    for parts of one split track ("BLUE ONE (1)", "BLUE ONE (2)"), the track's own."""
    parts = [_PART.match(n) for n in names]
    bases = {m.group(1) for m in parts if m}
    if all(parts) and len(bases) == 1:
        return bases.pop()
    return names[0]


def merge(
    tracks: Sequence[models.TrackFeature], name: str | None = None
) -> tuple[models.TrackFeature, list[str]]:
    """Tracks joined into one, in time order, under the earliest's id, style and
    platform class, and its name unless one is given (see merged_name). Refused,
    saying where, if any overlap in time. Speeds, courses or depths are kept only if
    every track has them; the notes say which were not, and why."""
    if len(tracks) < 2:
        raise TrackError("Select two or more tracks to merge.")
    clashes = overlaps(tracks)
    if clashes:
        where = "; ".join(
            f"{c.first} and {c.second} from {_when(c.start_ms)} to {_when(c.end_ms)}"
            for c in clashes
        )
        raise TrackError(
            f"The tracks were not merged: they overlap in time ({where}). "
            "Split or move one so they no longer overlap, then merge them."
        )
    ordered = sorted(tracks, key=lambda t: (times_of(t)[0], times_of(t)[-1]))
    earliest = ordered[0]
    props = earliest.properties
    name = (name or "").strip() or merged_name([t.properties.name for t in ordered])
    notes: list[str] = []
    series: dict = {}
    for member, title in (("speeds", "Speeds"), ("courses", "Courses"), ("depths", "Depths")):
        present = [getattr(t.properties, member) for t in ordered]
        if all(s is None for s in present):
            continue
        if any(s is None for s in present):
            missing = [
                t.properties.name for t, s in zip(ordered, present, strict=True) if s is None
            ]
            notes.append(f"{title} not kept: {', '.join(missing)} had none")
            series[member] = None
            continue
        unit = str(present[0].unit)
        values = [
            Quantity(v, str(s.unit)).to(unit).value if str(s.unit) != unit else v
            for s in present
            for v in s.values
        ]
        series[member] = present[0].model_copy(update={"values": values})
    provenance = []
    seen = set()
    for t in ordered:
        for record in t.properties.provenance or []:
            if record.id not in seen:
                seen.add(record.id)
                provenance.append(record)
    style = next((t.properties.style for t in ordered if t.properties.style is not None), None)
    platform = next(
        (t.properties.platform_class for t in ordered if t.properties.platform_class), None
    )
    # Marked fixes come with their tracks. Where two tracks meet at one time, a mark is
    # the first fix's at that time: the later track's mark there is not kept, and said so.
    marks: dict[str, models.FixMark] = {}
    for t in ordered:
        for mark in t.properties.fix_marks or []:
            if mark.time in marks:
                notes.append(
                    f"The mark on {t.properties.name}'s fix at {_when(parse_utc(mark.time))} "
                    "not kept: the earlier track's fix then has a mark of its own"
                )
            else:
                marks[mark.time] = mark
    properties = props.model_copy(
        update={
            "name": name,
            "fix_marks": [marks[k] for k in sorted(marks)] or None,
            "times": [time for t in ordered for time in t.properties.times],
            "style": style,
            "platform_class": platform,
            "provenance": provenance or None,
            **series,
        }
    )
    geometry = earliest.geometry.model_copy(
        update={"coordinates": [list(p) for t in ordered for p in t.geometry.coordinates]}
    )
    return earliest.model_copy(update={"geometry": geometry, "properties": properties}), notes


__all__ = [
    "TrackError",
    "default_pivot",
    "describe_move",
    "describe_period",
    "describe_pivot",
    "describe_rotation",
    "merge",
    "merged_name",
    "moved",
    "new_track_id",
    "overlaps",
    "period_indices",
    "rotated",
    "split",
    "times_of",
]
