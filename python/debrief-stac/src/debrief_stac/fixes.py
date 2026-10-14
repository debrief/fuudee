"""Cleaning tracks: jumps found and removed, positions smoothed, fixes marked (CAP-01, EXT-14).

Each change here makes a new track feature from an old one; the catalogue
records it as one step in the plot's history, named in the words the History
view shows ("BLUE ONE: 3 jumps removed"), with who did it and what they asked
for in its provenance record (SUB-19, SUB-24). Nothing is removed or moved
without the analyst seeing it first: jumps are found and shown, then removed
only when the analyst says which; smoothing is previewed, with how far it
moves the fixes, then applied.

Jumps. A fix is a jump when reaching it from the last good fix before it
needs more than a threshold speed (geodesic range over elapsed time). The
threshold is the analyst's; unless they say, it is three times the track's
median speed between fixes, and never less than 10 kn: three times the median
fits the platform (a helicopter at 120 kn, a submarine at 5 kn) and is far
above the changes of speed a real platform makes between fixes, and the floor
keeps position noise on a slow or stopped platform from being called a jump.
Comparing with the last good fix, not the fix before, finds a burst of
several bad fixes in a row; up to MAX_RUN of them. After a jump, a fix is back
on the track when it is reachable from the last good fix and the track goes
on from it. A track that goes off and
does not come back within that many fixes, or before it ends, is not a jump:
the data may have a gap, or the platform really went somewhere (a ship at
anchor getting under way); nothing is offered. The first fix is a jump when
it is far from the next two fixes and they agree; the last likewise.

Smoothing. A moving average over an odd number of fixes, each fix averaged
with the same number of fixes either side of it, in a flat frame centred on
that fix (ranges and bearings from it, along geodesics: an azimuthal
equidistant frame), so it is right at any latitude and across the
antimeridian. Near the ends of the period the window narrows evenly, so the
period's first and last fixes never move and the average never pulls a fix
sideways. A gap in the data (more than GAP_FACTOR times the track's median time
between fixes) is treated as an end: fixes either side of it are never averaged
together, so a platform that went somewhere while nothing was recorded is not
pulled across the gap. Only fixes in the period move. Recorded courses and speeds are
smoothed with the same window (courses as directions), so they stay in step
with the positions; depths are kept. Times never change, so the fixes stay in
time order.

Marked fixes. A fix's own colour, label and comment are kept in the track's
fix_marks, found by its time (see FixMark in the schema).
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from debrief_kernel.formatting import DEFAULT_SETTINGS, fixed, format_quantity, format_time
from debrief_kernel.geodesy import Position, destination, range_bearing
from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models
from debrief_stac.tracks import FEWEST_FIXES, TrackError, period_indices, times_of

KNOTS = "[kn_i]"
# Unless the analyst says: three times the track's median speed between fixes, at least 10 kn.
THRESHOLD_FACTOR = 3.0
THRESHOLD_FLOOR_KN = 10.0
# The most fixes in a row that can be one jump: a burst of bad fixes, then back on the track.
MAX_RUN = 5
# Smoothing averages each fix with this many fixes, itself in the middle, unless the analyst says.
DEFAULT_WINDOW = 5
LARGEST_WINDOW = 99
# A gap in the data: more than this many times the track's median time between fixes.
# Smoothing never averages fixes either side of one: the window narrows at it as at an end.
GAP_FACTOR = 10
# How much of a label a step's name quotes.
LABEL_SHOWN = 16
_MARK_MEMBERS = ("colour", "label", "comment")


def _when(ms: int) -> str:
    return format_time(ms, DEFAULT_SETTINGS)


def _position(track: models.TrackFeature, i: int) -> Position:
    lon, lat = track.geometry.coordinates[i]
    return Position(lon, lat)


def _speed_kn(track: models.TrackFeature, times: list[int], a: int, b: int) -> float:
    """The speed needed to go from fix a to fix b, in knots: infinite for two fixes at
    one time in different places."""
    metres = range_bearing(_position(track, a), _position(track, b))[0].value
    seconds = (times[b] - times[a]) / 1000.0
    if seconds <= 0:
        return 0.0 if metres < 0.5 else math.inf
    return Quantity(metres / seconds, "m/s").to(KNOTS).value


# --- Jumps ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Jump:
    """A fix found to be a jump: where and when, and how fast the track would have
    had to go to reach it from the last good fix (since)."""

    index: int
    time: str
    position: tuple[float, float]
    speed_kn: float
    since: str


def median_speed(track: models.TrackFeature) -> Quantity | None:
    """The median speed between consecutive fixes, from their positions and times;
    None for a track with no two fixes at different times."""
    times = times_of(track)
    speeds = [
        _speed_kn(track, times, i, i + 1) for i in range(len(times) - 1) if times[i + 1] > times[i]
    ]
    return Quantity(statistics.median(speeds), KNOTS) if speeds else None


def default_threshold(track: models.TrackFeature) -> Quantity:
    """The speed above which a fix is a jump unless the analyst says: three times the
    median speed between fixes, at least 10 kn, to a tenth of a knot."""
    median = median_speed(track)
    knots = max(THRESHOLD_FACTOR * (median.value if median else 0.0), THRESHOLD_FLOOR_KN)
    return Quantity(round(knots, 1), KNOTS)


def find_jumps(
    track: models.TrackFeature,
    threshold: Quantity | None = None,
    period: tuple[int, int] | None = None,
) -> tuple[Quantity, list[Jump]]:
    """The fixes that are jumps at the threshold (the default one if none is given),
    in time order; only those in the period, if one is given. Returns the threshold
    used with them. Changes nothing."""
    limit = threshold if threshold is not None else default_threshold(track)
    knots = limit.to(KNOTS).value
    if not knots > 0:
        raise TrackError("Give a speed above zero: fixes faster than it to reach are jumps.")
    allowed = set(period_indices(track, period)) if period else None
    times = times_of(track)
    n = len(times)
    if n < 3:
        return limit, []  # with two fixes, which one is wrong cannot be told
    too_fast = lambda a, b: _speed_kn(track, times, a, b) > knots  # noqa: E731
    found: list[int] = []
    anchor = 0
    # The first fix is a jump when it is far from the next two, and they agree.
    if too_fast(0, 1) and too_fast(0, 2) and not too_fast(1, 2):
        found.append(0)
        anchor = 1
    run: list[int] = []

    def back(i: int) -> bool:
        """After a jump, whether fix i is back on the track: reachable from the last good
        fix, and the track goes on from it (the next fix reachable from it, or the next but
        one, when the next is a jump of its own). Reachable alone is not enough: the longer
        since the last good fix, the further off a fix can be and still be reachable, so the
        second of two bad fixes in a row would pass."""
        if too_fast(anchor, i):
            return False
        if i == n - 1 or not too_fast(i, i + 1):
            return True
        return i + 2 < n and not too_fast(i, i + 2) and too_fast(i + 1, i + 2)

    i = anchor + 1
    while i < n:
        off = not back(i) if run else too_fast(anchor, i)
        if off:
            run.append(i)
            if len(run) > MAX_RUN:
                # Gone off and not come back: not a jump. Carry on from where it went.
                anchor, i, run = run[0], run[0] + 1, []
                continue
        else:
            # A fix of the run that the track goes on from smoothly is not off the track: the
            # platform really went there (a sprint, then a drift), so it is not offered, nor
            # any before it that the track goes on from. Only fixes the track also leaves too
            # fast are a jump: off it, and back.
            while run and not too_fast(run[-1], i):
                run.pop()
            found += run
            run = []
            anchor = i
        i += 1
    # A run still open at the end never came back, so it may be the platform really going
    # somewhere (a ship at anchor getting under way): not offered. Only the last fix alone,
    # as the first: far from the two before it, when they agree.
    if run == [n - 1] and too_fast(n - 3, n - 1) and not too_fast(n - 3, n - 2):
        found.append(n - 1)
    jumps = []
    bad = set(found)
    for index in sorted(bad):
        if allowed is not None and index not in allowed:
            continue
        # The good fix it was reached from: the one before it, or after it for the first fix.
        before = index - 1
        while before >= 0 and before in bad:
            before -= 1
        after = index + 1
        while after < n and after in bad:
            after += 1
        reference = before if before >= 0 else (after if after < n else None)
        speed = _speed_kn(track, times, *sorted((reference, index))) if reference is not None else 0
        lon, lat = track.geometry.coordinates[index]
        jumps.append(
            Jump(
                index=index,
                time=track.properties.times[index],
                position=(lon, lat),
                speed_kn=speed,
                since=track.properties.times[reference] if reference is not None else "",
            )
        )
    return limit, jumps


def describe_speed(knots: float) -> str:
    """A speed as the analyst reads it; an impossible one as such."""
    if math.isinf(knots):
        return "no time at all"
    return format_quantity(Quantity(knots, KNOTS).to(DEFAULT_SETTINGS.speed_unit))


def describe_jumps(name: str, count: int) -> str:
    """What the History view calls a removal of jumps: "BLUE ONE: 3 jumps removed"."""
    return f"{name}: {count} jump{'' if count == 1 else 's'} removed"


def describe_times(times: Iterable[str]) -> str:
    """Times as the analyst reads them: "09:31:00Z, 09:47:00Z and 10:02:00Z"."""
    said = [_when(parse_utc(t)) for t in times]
    if len(said) <= 1:
        return "".join(said)
    return ", ".join(said[:-1]) + " and " + said[-1]


# --- Removing fixes --------------------------------------------------------------------


def _kept(track: models.TrackFeature, keep: list[int], **update) -> models.TrackFeature:
    """The track with only the fixes at keep, every series with them."""
    props = track.properties
    series = {
        name: getattr(props, name).model_copy(
            update={"values": [getattr(props, name).values[i] for i in keep]}
        )
        for name in ("speeds", "courses", "depths")
        if getattr(props, name) is not None
    }
    times = [props.times[i] for i in keep]
    marks = marks_within(props.fix_marks, times)
    properties = props.model_copy(
        update={"times": times, "fix_marks": marks, **series, **update.pop("properties", {})}
    )
    coordinates = [list(track.geometry.coordinates[i]) for i in keep]
    geometry = track.geometry.model_copy(update={"coordinates": coordinates})
    return track.model_copy(update={"geometry": geometry, "properties": properties, **update})


def marks_within(
    marks: Sequence[models.FixMark] | None, times: Sequence[str]
) -> list[models.FixMark] | None:
    """The marks still at one of the fixes' times; None when none are."""
    present = set(times)
    kept = [m for m in marks or [] if m.time in present]
    return kept or None


def without_fixes(
    track: models.TrackFeature, times: Sequence[str], threshold: Quantity | None = None
) -> tuple[models.TrackFeature, int]:
    """The track without the fixes at the times given, every series and mark kept in
    step with the fixes that stay. Returns it and how many marked fixes went with them.
    Where the track has more than one fix at a time given, only those found to be jumps
    at the threshold go (the others are real data). Refused, plainly, for a time the
    track has no fix at, for one whose jump cannot be told, or when fewer than two fixes
    would be left."""
    name = track.properties.name
    wanted = {parse_utc(t) for t in times}
    if not wanted:
        raise TrackError(f"Choose the fixes of {name} to remove.")
    track_times = times_of(track)
    missing = wanted - set(track_times)
    if missing:
        raise TrackError(f"{name} has no fix at {_when(min(missing))}, so nothing was removed.")
    remove: set[int] = set()
    jumps: set[int] | None = None
    for t in sorted(wanted):
        at = [i for i, u in enumerate(track_times) if u == t]
        if len(at) > 1:
            if jumps is None:
                jumps = {j.index for j in find_jumps(track, threshold)[1]}
            at = [i for i in at if i in jumps]
            if not at or len(at) == track_times.count(t):
                raise TrackError(
                    f"{name} has {track_times.count(t)} fixes at {_when(t)}, and which of them "
                    "is the jump cannot be told, so nothing was removed."
                )
        remove.update(at)
    keep = [i for i in range(len(track_times)) if i not in remove]
    if len(keep) < FEWEST_FIXES:
        raise TrackError(
            f"Removing those fixes would leave {name} with {len(keep)} "
            f"fix{'' if len(keep) == 1 else 'es'}; a track needs at least {FEWEST_FIXES}."
        )
    after = _kept(track, keep)
    lost = len(track.properties.fix_marks or []) - len(after.properties.fix_marks or [])
    return after, lost


# --- Smoothing -------------------------------------------------------------------------


@dataclass(frozen=True)
class Smoothing:
    """What smoothing did: how many fixes moved, and the most any moved, and where."""

    moved: int
    largest_m: float
    largest_time: str | None


def _flat(origin: Position, other: Position) -> tuple[float, float]:
    """other as east and north metres from origin, along the geodesic (azimuthal
    equidistant about origin)."""
    distance, bearing = range_bearing(origin, other)
    radians = math.radians(bearing.value)
    return distance.value * math.sin(radians), distance.value * math.cos(radians)


def smoothed(
    track: models.TrackFeature, window: int, indices: Sequence[int]
) -> tuple[models.TrackFeature, Smoothing]:
    """The track with the fixes at indices (one period, in order) smoothed by a moving
    average over window fixes; the period's first and last fixes stay where they are.
    Courses and speeds are averaged over the same fixes; depths and times are kept."""
    if window < 3 or window % 2 == 0 or window > LARGEST_WINDOW:
        raise TrackError(
            f"Smooth over an odd number of fixes from 3 to {LARGEST_WINDOW} (3, 5, 7 and so "
            "on), so each fix is in the middle of the fixes it is averaged with."
        )
    name = track.properties.name
    if len(indices) < 3:
        raise TrackError(
            f"{name} has {len(indices)} fix{'' if len(indices) == 1 else 'es'} there; smoothing "
            "needs at least 3, as the first and last stay where they are."
        )
    start, end = indices[0], indices[-1]
    half = window // 2
    # Each fix's stretch of the period between gaps in the data: its first and last stay put.
    times = times_of(track)
    steps = [b - a for a, b in zip(times, times[1:], strict=False) if b > a]
    gap = GAP_FACTOR * statistics.median(steps) if steps else math.inf
    stretch_start, stretch_end = {}, {}
    first = start
    for i in indices:
        if i > start and times[i] - times[i - 1] > gap:
            first = i
        stretch_start[i] = first
    last = end
    for i in reversed(indices):
        if i < end and times[i + 1] - times[i] > gap:
            last = i
        stretch_end[i] = last
    props = track.properties
    positions = [list(p) for p in track.geometry.coordinates]
    courses = list(props.courses.values) if props.courses else None
    speeds = list(props.speeds.values) if props.speeds else None
    course_unit = str(props.courses.unit) if props.courses else "deg"
    full_turn = Quantity(360.0, "deg").to(course_unit).value
    largest, largest_at, moved = 0.0, None, 0
    for i in indices:
        h = min(half, i - stretch_start[i], stretch_end[i] - i)
        if h == 0:
            continue
        around = range(i - h, i + h + 1)
        centre = _position(track, i)
        offsets = [_flat(centre, _position(track, j)) for j in around]
        east = sum(e for e, _ in offsets) / len(offsets)
        north = sum(n for _, n in offsets) / len(offsets)
        distance = math.hypot(east, north)
        if distance > 1e-6:
            bearing = math.degrees(math.atan2(east, north))
            to = destination(centre, Quantity(bearing, "deg"), Quantity(distance, "m"))
            positions[i] = [to.longitude, to.latitude]
            moved += 1
            if distance > largest:
                largest, largest_at = distance, props.times[i]
        if courses is not None:
            angles = [props.courses.values[j] / full_turn * 2 * math.pi for j in around]
            x = sum(math.sin(a) for a in angles)
            y = sum(math.cos(a) for a in angles)
            if math.hypot(x, y) > 1e-9:  # courses that cancel out keep their own
                courses[i] = (math.atan2(x, y) / (2 * math.pi) * full_turn) % full_turn
        if speeds is not None:
            speeds[i] = sum(props.speeds.values[j] for j in around) / len(around)
    update: dict = {}
    if courses is not None:
        update["courses"] = props.courses.model_copy(update={"values": courses})
    if speeds is not None:
        update["speeds"] = props.speeds.model_copy(update={"values": speeds})
    geometry = track.geometry.model_copy(update={"coordinates": positions})
    after = track.model_copy(
        update={"geometry": geometry, "properties": props.model_copy(update=update)}
    )
    return after, Smoothing(moved=moved, largest_m=largest, largest_time=largest_at)


def describe_smoothing(name: str, window: int, part: bool) -> str:
    """What the History view calls smoothing: "BLUE ONE smoothed over 5 fixes"."""
    return f"{name}{' part' if part else ''} smoothed over {window} fixes"


def describe_largest(smoothing: Smoothing) -> str:
    """How far smoothing moved the fixes: "The most a fix moved: 0.04 nmi, at 09:31:00Z"."""
    if not smoothing.moved or smoothing.largest_time is None:
        return "No fix moved"
    distance = Quantity(smoothing.largest_m, "m").to(DEFAULT_SETTINGS.length_unit)
    text = format_quantity(distance)
    if not any(c in "123456789" for c in text.split(" ")[0]):
        text = f"{fixed(smoothing.largest_m, 0)} m"
    when = _when(parse_utc(smoothing.largest_time))
    fixes = f"{smoothing.moved} fix{'' if smoothing.moved == 1 else 'es'} moved"
    return f"{fixes}; the most a fix moved: {text}, at {when}"


# --- Marked fixes ------------------------------------------------------------------------


def fix_at(track: models.TrackFeature, time: str) -> str:
    """The track's own text for the time of its fix at time (any UTC text for it).
    Refused, plainly, when it has no fix then."""
    try:
        at = parse_utc(time)
    except ValueError:
        raise TrackError(f"{time!r} is not a time, such as 2026-10-11T09:30:00.000Z.") from None
    for t in track.properties.times:
        if parse_utc(t) == at:
            return t
    raise TrackError(f"{track.properties.name} has no fix at {_when(at)}.")


def mark_of(track: models.TrackFeature, time: str) -> models.FixMark | None:
    return next((m for m in track.properties.fix_marks or [] if m.time == time), None)


def marked(
    track: models.TrackFeature, time: str, changes: dict, colour_name: str | None = None
) -> tuple[models.TrackFeature, str] | None:
    """The track with its fix at time given the colour, label or comment in changes (a
    member given as None or empty is taken away), and the note naming the change, such
    as "BLUE ONE fix at 09:31:00Z labelled 'Turn'". None if nothing changes."""
    unknown = set(changes) - set(_MARK_MEMBERS)
    if unknown or not changes:
        raise TrackError("Say what to change about the fix: its colour, label or comment.")
    at = fix_at(track, time)
    before = mark_of(track, at)
    now = {m: getattr(before, m) if before else None for m in _MARK_MEMBERS}
    for member, value in changes.items():
        if value is not None and not isinstance(value, str):
            raise TrackError(f"A fix's {member} is text.")
        text = value.strip() if isinstance(value, str) and member != "colour" else value
        now[member] = text or None
    if now["colour"] is not None and not _is_colour(now["colour"]):
        raise TrackError(f"{now['colour']!r} is not a colour: give lower-case hex, like #e01c3e.")
    old = {m: getattr(before, m) if before else None for m in _MARK_MEMBERS}
    if now == old:
        return None
    others = [m for m in track.properties.fix_marks or [] if m.time != at]
    if any(v is not None for v in now.values()):
        others.append(models.FixMark(time=at, **{k: v for k, v in now.items() if v is not None}))
    others.sort(key=lambda m: m.time)
    properties = track.properties.model_copy(update={"fix_marks": others or None})
    note = describe_mark(track.properties.name, at, old, now, colour_name)
    return track.model_copy(update={"properties": properties}), note


def _is_colour(text: str) -> bool:
    return len(text) == 7 and text[0] == "#" and all(c in "0123456789abcdef" for c in text[1:])


def describe_mark(name: str, at: str, old: dict, now: dict, colour_name: str | None = None) -> str:
    """What the History view calls a change to a fix: coloured, labelled, its comment
    added, changed or removed; "changed" when more than one thing changed at once."""
    fix = f"{name} fix at {_when(parse_utc(at))}"
    changed = [m for m in _MARK_MEMBERS if old[m] != now[m]]
    if len(changed) != 1:
        return f"{fix} changed"
    member = changed[0]
    if member == "colour":
        if now["colour"] is None:
            return f"{fix}: own colour removed"
        return f"{fix} coloured {colour_name or now['colour']}"
    if member == "label":
        if now["label"] is None:
            return f"{fix}: label removed"
        # Short enough for the History view to show whole; the record holds it all.
        label = (
            now["label"]
            if len(now["label"]) <= LABEL_SHOWN
            else now["label"][: LABEL_SHOWN - 1] + "…"
        )
        return f"{fix} labelled '{label}'"
    if now["comment"] is None:
        return f"{fix}: comment removed"
    return f"{fix}: comment {'added' if old['comment'] is None else 'changed'}"


__all__ = [
    "DEFAULT_WINDOW",
    "Jump",
    "Smoothing",
    "default_threshold",
    "describe_jumps",
    "describe_largest",
    "describe_smoothing",
    "describe_speed",
    "describe_times",
    "find_jumps",
    "fix_at",
    "mark_of",
    "marked",
    "marks_within",
    "median_speed",
    "smoothed",
    "without_fixes",
]
