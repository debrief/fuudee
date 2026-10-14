"""Editing a track plotted by dead reckoning (CAP-01; decision, product owner, 14 Oct 2026).

On a track plotted by dead reckoning (DR) the truth is its **origin**, the position of
its first fix, and each fix's **course and speed**: every other position is worked out
from them, each fix from the one before by that fix's course and speed over the time
between, along the geodesic (tracks.dead_reckoned_positions). So an edit changes the
origin, or courses and speeds, and the positions are worked out again; they are never
moved on their own. A fix's course and speed are the leg from it to the next fix.

- A move of the whole track (or of a period that starts at the first fix) moves the
  origin: every fix follows, courses and speeds kept.
- A move of a period that starts later changes the leg into its first fix (the course
  and speed of the fix before) so that fix lands where it was moved: it and every fix
  after it follow. A single fix dragged is the same: the leg into it changes so dead
  reckoning puts it where it was dropped, and every later fix shifts with it; the first
  fix dragged moves the origin.
- A rotation adds its angle to the courses of the fixes in the period, ends included
  (each the leg from that fix on). When the period starts at the first fix the origin
  is turned about the pivot too, so the whole track turns about the pivot, as over the
  ground; a period that starts later turns about its own first fix, which dead
  reckoning places from the fix before, unchanged.
- A stretch multiplies the speeds of the fixes in the period by its factor.
- A shear adds one velocity (a set and drift) to the course and speed of every fix in
  the period, found so the dragged end lands where it was dragged: on a straight leg
  at a steady speed every course and speed becomes the leg's new one, and a period that
  turns keeps its turns, as a navigator's DR corrected for a tidal stream does.
- Held at the end, a shear or a stretch keeps the period's last fix where it is: the
  start is moved (the origin, or the leg into it) and the change found so the last fix
  stays.
- Smoothing averages the courses (as directions) and speeds over the window, as it
  does over the ground, and not the positions.
- Jumps: positions on a DR track jump only where a logged speed is wild, so the jumps
  offered are fixes whose logged speed is far faster than the track's, the leg from
  them running somewhere the platform could not have gone (see find_dr_jumps).
  Removing one joins the legs either side of it: the fix before's course and speed
  carry on to the fix after.

In each case the fixes after the period follow on: there is no jump where the period
meets the rest, as there is over the ground. The positions as logged, and the courses
and speeds as logged, are never changed by an edit; they are what plotting the track
over the ground again puts back.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field

from debrief_kernel.formatting import (
    DEFAULT_SETTINGS,
    fixed,
    format_bearing,
    format_position,
    format_quantity,
    format_time,
)
from debrief_kernel.geodesy import WGS84, Position, range_bearing
from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models
from debrief_stac import fixes
from debrief_stac.tracks import (
    TrackError,
    ends,
    plotting_mode,
    times_of,
)

# How close a solved end must come to where it was dragged, in metres.
SOLVED_M = 1e-4
_ITERATIONS = 40
_DIRECT = WGS84.LATITUDE | WGS84.LONGITUDE | WGS84.LONG_UNROLL


def reckoned(track: models.TrackFeature) -> bool:
    """Whether edits to the track change its origin, courses and speeds: plotted by dead
    reckoning, with both courses and speeds recorded (a legacy .dpf DR leg without them
    is edited by its positions, as over the ground)."""
    props = track.properties
    return plotting_mode(track) == "dr" and props.courses is not None and props.speeds is not None


def dr_name(name: str) -> str:
    """A DR track as the History view names it: "RED ONE (DR)"."""
    return f"{name} (DR)"


def _wrap(lon: float) -> float:
    wrapped = math.fmod(lon + 180.0, 360.0)
    if wrapped < 0:
        wrapped += 360.0
    return wrapped - 180.0


def _direct(p: Sequence[float], course: float, metres: float) -> list[float]:
    if metres == 0:
        return [p[0], p[1]]
    r = WGS84.Direct(p[1], p[0], course, metres, _DIRECT)
    return [_wrap(r["lon2"]), r["lat2"]]


def _inverse(a: Sequence[float], b: Sequence[float]) -> tuple[float, float]:
    """Range (m) and initial bearing (degrees true, [0, 360)) from a to b."""
    distance, bearing = range_bearing(Position(a[0], a[1]), Position(b[0], b[1]))
    return distance.value, bearing.value


@dataclass
class Reckoning:
    """A DR track's truth: its origin, its fixes' times (ms), and each fix's course
    (degrees true) and speed (metres a second); changed records which fixes' courses and
    speeds an edit changed, so the others keep their recorded values exactly."""

    origin: list[float]
    times: list[int]
    courses: list[float]
    speeds: list[float]
    changed: set[int] = field(default_factory=set)

    @classmethod
    def of(cls, track: models.TrackFeature) -> Reckoning:
        props = track.properties
        if props.courses is None or props.speeds is None:
            raise TrackError(
                f"{props.name} does not record both courses and speeds, so it cannot be "
                "plotted by dead reckoning."
            )
        cu, su = str(props.courses.unit), str(props.speeds.unit)
        return cls(
            origin=list(track.geometry.coordinates[0]),
            times=times_of(track),
            courses=[Quantity(v, cu).to("deg").value % 360.0 for v in props.courses.values],
            speeds=[Quantity(v, su).to("m/s").value for v in props.speeds.values],
        )

    def positions(self, upto: int | None = None) -> list[list[float]]:
        """The fixes worked out from the origin, up to and including fix upto."""
        last = len(self.times) - 1 if upto is None else upto
        out = [list(self.origin)]
        for i in range(1, last + 1):
            seconds = (self.times[i] - self.times[i - 1]) / 1000
            out.append(_direct(out[-1], self.courses[i - 1], self.speeds[i - 1] * seconds))
        return out

    def set(self, i: int, course: float, speed: float) -> None:
        self.courses[i] = course % 360.0
        self.speeds[i] = speed
        self.changed.add(i)

    def track(self, track: models.TrackFeature) -> models.TrackFeature:
        """The track with these courses, speeds and origin, its positions worked out."""
        props = track.properties
        cu, su = str(props.courses.unit), str(props.speeds.unit)
        courses = list(props.courses.values)
        speeds = list(props.speeds.values)
        for i in self.changed:
            courses[i] = Quantity(self.courses[i], "deg").to(cu).value
            speeds[i] = Quantity(self.speeds[i], "m/s").to(su).value
        properties = props.model_copy(
            update={
                "courses": props.courses.model_copy(update={"values": courses}),
                "speeds": props.speeds.model_copy(update={"values": speeds}),
            }
        )
        geometry = track.geometry.model_copy(update={"coordinates": self.positions()})
        return track.model_copy(update={"geometry": geometry, "properties": properties})


@dataclass(frozen=True)
class LegChange:
    """The leg into a fix, changed so dead reckoning puts the fix somewhere else: the fix,
    and the course (degrees true) and speed (metres a second) of the fix before, as it was
    and as it now is. None of them for the first fix, whose moving moves the origin."""

    index: int
    course: float
    speed: float
    was_course: float
    was_speed: float


def _leg_into(
    r: Reckoning, name: str, index: int, before: Sequence[float], to: Sequence[float]
) -> LegChange:
    """Change the course and speed of the fix before index so dead reckoning from it
    (at `before`) reaches `to` at fix index's time. Refused for two fixes at one time."""
    seconds = (r.times[index] - r.times[index - 1]) / 1000
    if seconds <= 0:
        raise TrackError(
            f"{name}'s fix at {_when(r.times[index])} is at the same time as the fix before "
            "it, so dead reckoning cannot put it anywhere else: move the fix before it."
        )
    metres, bearing = _inverse(before, to)
    was_course, was_speed = r.courses[index - 1], r.speeds[index - 1]
    r.set(index - 1, bearing if metres > 0 else was_course, metres / seconds)
    return LegChange(index, r.courses[index - 1], r.speeds[index - 1], was_course, was_speed)


def _when(ms: int) -> str:
    return format_time(ms, DEFAULT_SETTINGS)


def _move_start(
    r: Reckoning, name: str, start: int, to: Sequence[float], here: list[list[float]]
) -> LegChange | None:
    """Put fix start at `to`: the origin, or the leg into it."""
    if start == 0:
        r.origin = [to[0], to[1]]
        return None
    return _leg_into(r, name, start, here[start - 1], to)


# --- The operations -----------------------------------------------------------------


def dr_moved(
    track: models.TrackFeature, distance: Quantity, bearing: Quantity, indices: Sequence[int]
) -> tuple[models.TrackFeature, LegChange | None] | None:
    """A move of the fixes at indices: of the origin when they start at the first fix;
    otherwise of the leg into the first of them. None if it would not move."""
    metres = distance.to("m").value
    if metres < 0:
        raise TrackError("A move's distance cannot be negative.")
    if metres == 0:
        return None
    r = Reckoning.of(track)
    here = [list(p) for p in track.geometry.coordinates]
    start = indices[0]
    to = _direct(here[start], bearing.to("deg").value, metres)
    leg = _move_start(r, track.properties.name, start, to, here)
    return r.track(track), leg


def dr_fix_moved(
    track: models.TrackFeature, index: int, to: Position
) -> tuple[models.TrackFeature, LegChange | None] | None:
    """One fix dragged to `to`: the leg into it changed so dead reckoning puts it there
    (the origin moved, for the first fix); every later fix follows. None if it would
    not move."""
    here = [list(p) for p in track.geometry.coordinates]
    if _inverse(here[index], [to.longitude, to.latitude])[0] < 1e-6:
        return None
    r = Reckoning.of(track)
    leg = _move_start(r, track.properties.name, index, [to.longitude, to.latitude], here)
    return r.track(track), leg


def dr_pivot(track: models.TrackFeature, indices: Sequence[int], pivot: Position) -> Position:
    """What a rotation of the fixes at indices turns about on a DR track: the pivot when
    they start at the first fix (the origin turns about it); otherwise their own first fix,
    which dead reckoning places from the fix before, unchanged."""
    if indices[0] == 0:
        return pivot
    return Position(*track.geometry.coordinates[indices[0]])


def dr_rotated(
    track: models.TrackFeature, pivot: Position, angle: Quantity, indices: Sequence[int]
) -> models.TrackFeature | None:
    """The courses of the fixes at indices turned by angle (clockwise positive); the
    origin turned about the pivot when they start at the first fix. None if nothing
    turns."""
    turn = angle.to("deg").value
    if turn % 360.0 == 0:
        return None
    r = Reckoning.of(track)
    for i in indices:
        r.set(i, r.courses[i] + turn, r.speeds[i])
    if indices[0] == 0:
        metres, bearing = _inverse([pivot.longitude, pivot.latitude], r.origin)
        if metres > 0:
            r.origin = _direct([pivot.longitude, pivot.latitude], bearing + turn, metres)
    return r.track(track)


def _velocity(course: float, speed: float) -> tuple[float, float]:
    radians = math.radians(course)
    return speed * math.sin(radians), speed * math.cos(radians)


def _solve_set(
    r: Reckoning, indices: Sequence[int], last: int, target: Sequence[float]
) -> tuple[float, float]:
    """Add one velocity (east, north; metres a second) to the course and speed of every
    fix at indices, found so dead reckoning puts fix last at target; returns it. Each
    turn of the solution corrects the velocity by what the end missed over the time,
    as the positions depend on it almost exactly linearly."""
    base = {i: _velocity(r.courses[i], r.speeds[i]) for i in indices}
    kept = {i: r.courses[i] for i in indices}
    seconds = (r.times[last] - r.times[indices[0]]) / 1000
    east = north = 0.0
    for _ in range(_ITERATIONS):
        for i in indices:
            ve, vn = base[i][0] + east, base[i][1] + north
            speed = math.hypot(ve, vn)
            course = math.degrees(math.atan2(ve, vn)) if speed > 0 else kept[i]
            r.set(i, course, speed)
        end = r.positions(last)[last]
        metres, bearing = _inverse(end, target)
        if metres < SOLVED_M:
            break
        de, dn = _velocity(bearing, metres)
        east, north = east + de / seconds, north + dn / seconds
    return east, north


def _place_start_for_end(
    r: Reckoning, name: str, start: int, last: int, held: Sequence[float], here: list[list[float]]
) -> None:
    """Move fix start (the origin, or by the leg into it) so dead reckoning puts fix last
    at held, as it was: holding a period's end on a DR track."""
    at = list(here[start])
    for _ in range(_ITERATIONS):
        _move_start(r, name, start, at, here)
        end = r.positions(last)[last]
        metres, bearing = _inverse(end, held)
        if metres < SOLVED_M:
            return
        at = _direct(at, bearing, metres)


def dr_sheared(
    track: models.TrackFeature, indices: Sequence[int], anchor: str, to: Position
) -> tuple[models.TrackFeature, tuple[float, float]] | None:
    """A shear on a DR track: the period's dragged end to `to`, by one velocity added to
    the course and speed of every fix in it (a set and drift); held at the end, the start
    is put at `to` and the velocity found so the end stays. Returns the track and the
    velocity added (east, north; metres a second). None if the end does not move."""
    held, dragged = ends(track, indices, anchor)
    here = [list(p) for p in track.geometry.coordinates]
    target = [to.longitude, to.latitude]
    if _inverse(here[dragged], target)[0] < 1e-6:
        return None
    r = Reckoning.of(track)
    first, last = indices[0], indices[-1]
    if anchor == "start":
        added = _solve_set(r, indices, last, target)
    else:
        _move_start(r, track.properties.name, first, target, here)
        added = _solve_set(r, indices, last, here[last])
    return r.track(track), added


def dr_stretched(
    track: models.TrackFeature, indices: Sequence[int], anchor: str, factor: float
) -> models.TrackFeature | None:
    """A stretch on a DR track: the speeds of the fixes in the period multiplied by the
    factor; held at the end, the start moved so the end stays. None if the factor is 1."""
    if factor <= 0:
        raise TrackError("A stretch needs a speed of more than nothing.")
    ends(track, indices, anchor)
    if abs(factor - 1) < 1e-12:
        return None
    r = Reckoning.of(track)
    for i in indices:
        r.set(i, r.courses[i], r.speeds[i] * factor)
    if anchor == "end":
        here = [list(p) for p in track.geometry.coordinates]
        _place_start_for_end(
            r, track.properties.name, indices[0], indices[-1], here[indices[-1]], here
        )
    return r.track(track)


def dr_smoothed(
    track: models.TrackFeature, window: int, indices: Sequence[int]
) -> tuple[models.TrackFeature, fixes.Smoothing]:
    """Smoothing on a DR track: the courses (as directions) and speeds averaged over the
    window, as fixes.smoothed averages them, and the positions worked out from them; how
    many fixes that moved, and the most any moved."""
    averaged, _ = fixes.smoothed(track, window, indices)
    r = Reckoning.of(track)
    after_cs = Reckoning.of(averaged)
    for i in indices:
        if after_cs.courses[i] != r.courses[i] or after_cs.speeds[i] != r.speeds[i]:
            r.set(i, after_cs.courses[i], after_cs.speeds[i])
    after = r.track(track)
    largest, largest_at, moved = 0.0, None, 0
    for i, (a, b) in enumerate(
        zip(track.geometry.coordinates, after.geometry.coordinates, strict=True)
    ):
        metres = _inverse(a, b)[0]
        if metres > 1e-6:
            moved += 1
            if metres > largest:
                largest, largest_at = metres, track.properties.times[i]
    return after, fixes.Smoothing(moved=moved, largest_m=largest, largest_time=largest_at)


def find_dr_jumps(
    track: models.TrackFeature,
    threshold: Quantity | None = None,
    period: tuple[int, int] | None = None,
) -> tuple[Quantity, list[fixes.Jump]]:
    """The jumps of a DR track: its positions jump only where a logged speed is wild, so
    a jump is a fix whose logged speed is faster than the threshold (the default one
    unless given), the leg from it running where the platform could not have gone, in a
    run of at most fixes.MAX_RUN such fixes with ordinary speeds either side (a longer
    run, or one reaching the track's end, may be the platform really going fast, as over
    the ground). Not the first fix, where dead reckoning starts: removing it would start
    the track where its wild leg ended (drag the fix after it instead), nor the last,
    whose speed places no fix. Each jump's speed is its logged speed, and `since` the
    time of the fix its leg runs to."""
    limit = threshold if threshold is not None else fixes.default_threshold(track)
    knots = limit.to(fixes.KNOTS).value
    if not knots > 0:
        raise TrackError("Give a speed above zero: fixes faster than it to reach are jumps.")
    r = Reckoning.of(track)
    n = len(r.times)
    logged = [Quantity(s, "m/s").to(fixes.KNOTS).value for s in r.speeds]
    fast = [s > knots for s in logged]
    allowed = None
    if period is not None:
        allowed = {i for i, t in enumerate(r.times) if period[0] <= t <= period[1]}
    found: list[int] = []
    i = 0
    while i < n:
        if not fast[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and fast[j + 1]:
            j += 1
        if i > 0 and j < n - 2 and j - i + 1 <= fixes.MAX_RUN:
            found += list(range(i, j + 1))
        i = j + 1
    jumps = []
    for index in found:
        if allowed is not None and index not in allowed:
            continue
        lon, lat = track.geometry.coordinates[index]
        jumps.append(
            fixes.Jump(
                index=index,
                time=track.properties.times[index],
                position=(lon, lat),
                speed_kn=logged[index],
                since=track.properties.times[index + 1],
                logged=True,
            )
        )
    return limit, jumps


def dr_without_fixes(
    track: models.TrackFeature, times: Sequence[str], threshold: Quantity | None = None
) -> tuple[models.TrackFeature, int]:
    """Fixes removed from a DR track, every series and mark in step (fixes.without_fixes),
    and the positions worked out again: the fix before each one removed carries on, by its
    own course and speed, to the fix after. Refused for the first fix, where dead
    reckoning starts."""
    first = parse_utc(track.properties.times[0])
    if any(parse_utc(t) == first for t in times):
        raise TrackError(
            f"{track.properties.name} is plotted by dead reckoning from its first fix, so that "
            "fix is not removed: drag the fix after it to change the leg from it instead."
        )
    after, lost = fixes.without_fixes(track, times, threshold)
    return Reckoning.of(after).track(after), lost


# --- What the step says --------------------------------------------------------------


def _speed_text(metres_per_second: float) -> str:
    return format_quantity(Quantity(metres_per_second, "m/s").to(DEFAULT_SETTINGS.speed_unit))


def course_speed(course: float, speed: float) -> str:
    """ "056.5°T 12.1 kn"."""
    return f"{format_bearing(Quantity(course, 'deg'))} {_speed_text(speed)}"


def describe_leg(name: str, leg: LegChange, at_ms: int) -> str:
    """What the History view calls a DR fix dragged: "RED ONE (DR) leg into 09:43:00Z now
    056.5°T 12.1 kn"."""
    return f"{dr_name(name)} leg into {_when(at_ms)} now {course_speed(leg.course, leg.speed)}"


def describe_leg_was(leg: LegChange) -> str:
    return f"Was {course_speed(leg.was_course, leg.was_speed)}"


def describe_origin(to: Sequence[float]) -> str:
    return (
        f"Dead reckoning now starts from {format_position(Position(to[0], to[1]))}; every fix "
        "follows, its course and speed kept"
    )


FOLLOW = "The fixes after it follow, by dead reckoning"
FOLLOW_FROM = "It and the fixes after it follow, by dead reckoning"
FOLLOW_ON = "The fixes after the period follow on, by dead reckoning: there is no jump"
START_TURNS = (
    "Turned about the period's first fix: dead reckoning places it from the fix before, "
    "which does not turn"
)
ORIGIN_FIX = "Dead reckoning starts from it, so every fix follows, its course and speed kept"
JUMPS_JOINED = (
    "Plotted by dead reckoning: the fix before each one removed carries on, by its own "
    "course and speed, to the fix after"
)
DR_SMOOTHING = "Courses and speeds averaged, not positions; the fixes follow, by dead reckoning"


def describe_leg_into(leg: LegChange, at_ms: int) -> str:
    """ "Leg into 09:43:00Z now 056.5°T 12.1 kn (was 045.0°T 12.0 kn)"."""
    return (
        f"Leg into {_when(at_ms)} now {course_speed(leg.course, leg.speed)} "
        f"(was {course_speed(leg.was_course, leg.was_speed)})"
    )


def describe_courses_turned(angle: Quantity, part: bool) -> str:
    turn = angle.to("deg").value
    what = "Each course in the period" if part else "Every course"
    sense = "clockwise" if turn > 0 else "anticlockwise"
    return f"{what} turned {fixed(abs(turn), DEFAULT_SETTINGS.angle_decimals)}° {sense}"


def describe_speeds_scaled(factor: float, part: bool) -> str:
    what = "Each speed in the period" if part else "Every speed"
    return f"{what} multiplied by {factor:.3f}"


def describe_set(added: tuple[float, float], part: bool) -> str:
    """ "Every course and speed changed by the same 1.2 kn toward 045.0°T (a set and
    drift)"."""
    east, north = added
    speed = math.hypot(east, north)
    bearing = math.degrees(math.atan2(east, north)) % 360.0
    what = "Each course and speed in the period" if part else "Every course and speed"
    return (
        f"{what} changed by the same {_speed_text(speed)} toward "
        f"{format_bearing(Quantity(bearing, 'deg'))} (a set and drift)"
    )


__all__ = [
    "DR_SMOOTHING",
    "FOLLOW",
    "FOLLOW_FROM",
    "FOLLOW_ON",
    "JUMPS_JOINED",
    "LegChange",
    "ORIGIN_FIX",
    "Reckoning",
    "START_TURNS",
    "course_speed",
    "describe_courses_turned",
    "describe_leg",
    "describe_leg_into",
    "describe_leg_was",
    "describe_origin",
    "describe_set",
    "describe_speeds_scaled",
    "dr_fix_moved",
    "dr_moved",
    "dr_name",
    "dr_pivot",
    "dr_rotated",
    "dr_sheared",
    "dr_smoothed",
    "dr_stretched",
    "dr_without_fixes",
    "find_dr_jumps",
    "reckoned",
]
