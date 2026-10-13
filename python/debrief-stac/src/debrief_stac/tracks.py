"""Tracks moved, rotated, sheared, stretched, split and merged by hand (CAP-01,
CAP-02, CAP-21).

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

- A shear or a stretch holds one end of the period (the anchor) and works in
  the azimuthal equidistant frame about it (AnchorFrame): each fix is placed
  by its geodesic range and bearing from the anchor, so a geodesic through the
  anchor is a straight line through the frame's origin. A shear adds to each
  fix the dragged end's displacement in that frame times the fix's fraction f
  of the time from the anchor to the dragged end (0 at the anchor, 1 at the
  dragged end): a time-proportional translation, legacy Debrief's TMA shear.
  A stretch multiplies each fix's range from the anchor by one factor, keeping
  its bearing from it. A straight leg at a steady speed through the anchor
  stays one, exactly: sheared, with the new course and speed; stretched, on
  the same line with the new speed. Recorded courses and speeds are carried
  through the same change (see _carried), not worked out again from the
  positions, so the detail a track records survives and a straight leg's
  courses and speeds become exactly its new ones.

A period limits any of them to the fixes whose times fall in it, ends included.
The fixes outside it stay where they are, so the joins jump: the track is not
made continuous, and the map shows the jump while the analyst drags.

Splitting at a time makes two tracks: the fixes before it, keeping the
track's id (so sensors and named sets that refer to it still do), and the
fixes from it on, under a new id. Merging joins tracks in time order under
the earliest's id; tracks that overlap in time are not merged, and the
message says where they overlap.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Sequence
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


# --- Shearing and stretching (TMA, CAP-21) ---------------------------------------------

ANCHORS = ("start", "end")
# Seconds a fix's recorded velocity is followed for, to carry it through a shear or a
# stretch (see _carried): short against any leg, long against rounding.
VELOCITY_STEP_S = 10.0


class AnchorFrame:
    """The azimuthal equidistant frame about a position: each position as x east and y
    north, in metres, from its geodesic range and initial bearing from the anchor. A
    geodesic through the anchor is a straight line through the origin, and ranges from
    the anchor are exact; it is not used near the anchor's antipode."""

    def __init__(self, anchor: Position):
        self.anchor = anchor

    def xy(self, p: Position) -> tuple[float, float]:
        distance, bearing = range_bearing(self.anchor, p)
        r, b = distance.value, math.radians(bearing.value)
        return r * math.sin(b), r * math.cos(b)

    def position(self, xy: tuple[float, float]) -> Position:
        r = math.hypot(*xy)
        if r == 0:
            return self.anchor
        bearing = math.degrees(math.atan2(xy[0], xy[1]))
        return destination(self.anchor, Quantity(bearing, "deg"), Quantity(r, "m"))


@dataclass(frozen=True)
class Leg:
    """What a period makes good: the true bearing, at its first fix, of the geodesic from
    its first fix to its last; the range between them; and the seconds between their
    times. For a straight leg at a steady speed, its course and speed."""

    course: float
    metres: float
    seconds: float

    @property
    def speed(self) -> float:
        """Metres a second."""
        return self.metres / self.seconds


def _position(track: models.TrackFeature, i: int) -> Position:
    lon, lat = track.geometry.coordinates[i]
    return Position(lon, lat)


def ends(track: models.TrackFeature, indices: Sequence[int], anchor: str) -> tuple[int, int]:
    """The fix a shear or a stretch holds (the anchor: the period's first or last) and
    the fix at the other end, which is dragged. Refused when the period has fixes at
    only one time."""
    if anchor not in ANCHORS:
        raise TrackError("Say which end of the period is held: the start or the end.")
    times = times_of(track)
    first, last = indices[0], indices[-1]
    if times[first] == times[last]:
        raise TrackError(
            f"{track.properties.name} has fixes at only one time there, so it cannot be "
            "sheared or stretched: that needs fixes at two times."
        )
    return (first, last) if anchor == "start" else (last, first)


def leg_of(track: models.TrackFeature, indices: Sequence[int]) -> Leg:
    """What the fixes at indices make good, from the first to the last."""
    times = times_of(track)
    first, last = indices[0], indices[-1]
    distance, bearing = range_bearing(_position(track, first), _position(track, last))
    return Leg(bearing.value, distance.value, (times[last] - times[first]) / 1000)


def shear_target(
    track: models.TrackFeature,
    indices: Sequence[int],
    anchor: str,
    course: Quantity,
    speed: Quantity,
) -> Position:
    """Where the dragged end goes for the period to make good this course and speed: from
    the period's first fix, the course is the geodesic's bearing there. Held at the end,
    the start is found by turning the bearing back from the anchor until the geodesic
    from the new start sets off on the course (Newton's method on that bearing: a few
    turns, as only the meridians' convergence separates the two). Refused when no
    start does, as near a pole, where a leg that long on that course cannot end at the
    held fix."""
    held, dragged = ends(track, indices, anchor)
    times = times_of(track)
    a = _position(track, held)
    metres = speed.to("m/s").value * abs(times[dragged] - times[held]) / 1000
    want = course.to("deg").value
    if metres == 0:
        return a
    if anchor == "start":
        return destination(a, Quantity(want, "deg"), Quantity(metres, "m"))
    length = Quantity(metres, "m")

    def error(back: float) -> tuple[float, Position]:
        start = destination(a, Quantity(back, "deg"), length)
        return (range_bearing(start, a)[1].value - want + 540.0) % 360.0 - 180.0, start

    back, step = want + 180.0, 1e-6
    for _ in range(50):
        e, start = error(back)
        if abs(e) < 1e-9:
            return start
        slope = (error(back + step)[0] - e) / step
        back -= e / slope if abs(slope) > 1e-3 else e
    raise TrackError(
        f"{track.properties.name} cannot make good {format_bearing(course)} at "
        f"{_speed_text(speed.to('m/s').value)} and end where it does: no leg that long sets off "
        "on that course to its last fix. Hold the start instead."
    )


def _velocity(track: models.TrackFeature, i: int) -> tuple[float, float]:
    """The fix's course (degrees true) and speed (metres a second): as recorded, or, for
    whichever is not, as the positions say, from the fix before to the fix after."""
    props = track.properties
    course = speed = None
    if props.courses is not None:
        course = Quantity(props.courses.values[i], str(props.courses.unit)).to("deg").value
    if props.speeds is not None:
        speed = Quantity(props.speeds.values[i], str(props.speeds.unit)).to("m/s").value
    if course is None or speed is None:
        times = times_of(track)
        a, b = max(0, i - 1), min(len(times) - 1, i + 1)
        distance, bearing = range_bearing(_position(track, a), _position(track, b))
        seconds = (times[b] - times[a]) / 1000
        if course is None:
            course = bearing.value
        if speed is None:
            speed = distance.value / seconds if seconds > 0 else 0.0
    return course, speed


Change = Callable[[tuple[float, float], float], tuple[float, float]]


def _carried(
    track: models.TrackFeature, indices: Sequence[int], frame: AnchorFrame, change: Change
) -> models.TrackFeature:
    """The track with each fix at indices changed in the anchor's frame (change takes a
    fix's place in the frame and its time, in milliseconds), and its recorded course
    and speed carried through the same change: the position the recorded velocity
    reaches VELOCITY_STEP_S later is changed as a fix at that time would be, and the
    new course and speed are from the changed fix to it. So a shear adds the leg's
    change of velocity to each fix's own, and a stretch scales each speed and keeps
    each course; on a straight, steady leg they become exactly the leg's new ones.
    Courses and speeds the track does not record stay unrecorded."""
    props = track.properties
    times = times_of(track)
    positions = [list(p) for p in track.geometry.coordinates]
    courses = list(props.courses.values) if props.courses is not None else None
    speeds = list(props.speeds.values) if props.speeds is not None else None
    for i in indices:
        p = _position(track, i)
        to = frame.position(change(frame.xy(p), times[i]))
        positions[i] = [to.longitude, to.latitude]
        if courses is None and speeds is None:
            continue
        course, speed = _velocity(track, i)
        ahead = destination(p, Quantity(course, "deg"), Quantity(speed * VELOCITY_STEP_S, "m"))
        ahead_to = frame.position(change(frame.xy(ahead), times[i] + VELOCITY_STEP_S * 1000))
        distance, bearing = range_bearing(to, ahead_to)
        if courses is not None and distance.value > 0:
            courses[i] = Quantity(bearing.value, "deg").to(str(props.courses.unit)).value
        if speeds is not None:
            speed_after = Quantity(distance.value / VELOCITY_STEP_S, "m/s")
            speeds[i] = speed_after.to(str(props.speeds.unit)).value
    after = _with_positions(track, positions, courses)
    if speeds is None:
        return after
    series = props.speeds.model_copy(update={"values": speeds})
    return after.model_copy(
        update={"properties": after.properties.model_copy(update={"speeds": series})}
    )


def sheared(
    track: models.TrackFeature, indices: Sequence[int], anchor: str, to: Position
) -> models.TrackFeature | None:
    """The track sheared: the anchor held, the period's other end dragged to `to`, and
    each fix at indices moved by that displacement (in the anchor's frame) times its
    fraction of the time from the anchor to the dragged end. None if the end does not
    move."""
    held, dragged = ends(track, indices, anchor)
    times = times_of(track)
    frame = AnchorFrame(_position(track, held))
    ex, ey = frame.xy(_position(track, dragged))
    tx, ty = frame.xy(to)
    dx, dy = tx - ex, ty - ey
    if math.hypot(dx, dy) < 1e-6:
        return None
    t0, span = times[held], times[dragged] - times[held]

    def change(xy: tuple[float, float], t: float) -> tuple[float, float]:
        f = (t - t0) / span
        return xy[0] + f * dx, xy[1] + f * dy

    return _carried(track, indices, frame, change)


def stretched(
    track: models.TrackFeature, indices: Sequence[int], anchor: str, factor: float
) -> models.TrackFeature | None:
    """The track stretched: the anchor held, and each fix at indices taken along its
    bearing from the anchor to factor times its range from it. Speeds are multiplied
    by the factor; courses kept. None if the factor is 1."""
    if factor <= 0:
        raise TrackError("A stretch needs a speed of more than nothing.")
    held, _ = ends(track, indices, anchor)
    if abs(factor - 1) < 1e-12:
        return None
    frame = AnchorFrame(_position(track, held))
    return _carried(track, indices, frame, lambda xy, _t: (xy[0] * factor, xy[1] * factor))


def _speed_text(metres_per_second: float) -> str:
    return format_quantity(Quantity(metres_per_second, "m/s").to(DEFAULT_SETTINGS.speed_unit))


def _course_speed(leg: Leg) -> str:
    return f"{format_bearing(Quantity(leg.course, 'deg'))} {_speed_text(leg.speed)}"


def describe_shear(name: str, leg: Leg, part: bool) -> str:
    """What the History view calls a shear: "BLUE ONE sheared: 087.2°T 12.4 kn", the
    course and speed the period now makes good."""
    what = f"{name} part" if part else name
    return f"{what} sheared: {_course_speed(leg)}"


def describe_stretch(name: str, leg: Leg, part: bool) -> str:
    """What the History view calls a stretch: "BLUE ONE stretched: 12.4 kn"."""
    what = f"{name} part" if part else name
    return f"{what} stretched: {_speed_text(leg.speed)}"


def describe_anchor(anchor: str, at_ms: int) -> str:
    """A shear's or a stretch's second note: "Held at the start, 09:30:00Z"."""
    return f"Held at the {anchor}, {_when(at_ms)}"


def describe_was(leg: Leg, speed_only: bool) -> str:
    """What the period made good before: "Was 090.0°T 10.0 kn", or "Was 10.0 kn"."""
    return f"Was {_speed_text(leg.speed) if speed_only else _course_speed(leg)}"


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
    properties = props.model_copy(
        update={"times": props.times[part], **series, **update.pop("properties", {})}
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
    properties = props.model_copy(
        update={
            "name": name,
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
    "ANCHORS",
    "AnchorFrame",
    "Leg",
    "TrackError",
    "default_pivot",
    "describe_anchor",
    "describe_move",
    "describe_period",
    "describe_pivot",
    "describe_rotation",
    "describe_shear",
    "describe_stretch",
    "describe_was",
    "ends",
    "leg_of",
    "merge",
    "merged_name",
    "moved",
    "new_track_id",
    "overlaps",
    "period_indices",
    "rotated",
    "shear_target",
    "sheared",
    "split",
    "stretched",
    "times_of",
]
