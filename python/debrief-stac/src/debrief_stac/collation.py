"""Collation: putting a plot together from the catalogue items that have data for it
(CAP-05, CAP-08 to CAP-12).

A source is a catalogue item: an imported file, which Debrief keeps as a plot of its
own, or any other plot (decision, product owner, 16 Oct 2026). Collation is done in
the catalogue browser, with coverage visible:

- **Coverage.** Each item's tracks and the periods each has data for, from its first
  fix to its last, broken at each gap: a time between two fixes more than ten times
  the track's median time between fixes (as smoothing and the map treat a gap) and
  more than five minutes, so a busy track's pause for breath is not a gap. Worked out
  at each change to an item and kept in its STAC item (``debrief:coverage``), so a
  catalogue's coverage is read from its items alone, never their plots (NFR-01).
  TypeScript works spans out the same way for the Timeline, held to
  ``schemas/vectors/collation.json``.
- **One platform across items.** Tracks whose names match, ignoring case and runs of
  spaces, are proposed as one platform; the analyst confirms, refuses, or links
  others by hand, each one recorded step on the plot's track (``platform_links``,
  ``platform_unlinks``).
- **Source preference, per period.** Where two items have data for a platform over
  the same period, the analyst chooses which supplies it. The track is stitched from
  the chosen periods (``supplies``: which item supplies which period, in time order),
  as one recorded step naming the items and the period.
- **New data.** Data arrives only through Debrief's import. An item that came into
  the folder tree the plot draws from after the plot did, with data for its
  platforms or within its period, is marked as new data for it, until the analyst
  takes it or sets it aside.
- **Taking new data** is the analyst's choice: one recorded step naming the item. A
  matched track gains the item's fixes where it has none (and, where the item
  already supplies a period, that period is read again from the item's latest
  revision); periods supplied by another item stay theirs, as the analyst chose;
  tracks that match none of the plot's are added.
- **Revisions.** Any recorded change to an item, of its data or its details, is a new
  revision (its plot's content hash). A product whose provenance names an item at
  an older revision may need review, until the analyst clears its flag.

Edits survive. Fixes taken into a track the analyst has changed (moved, rotated,
sheared, stretched, smoothed, single fixes dragged) follow the change made around
them: each existing fix's offset from where its source puts it is worked out, and a
new fix is offset by the offsets of the fixes either side of it in time, in
proportion to its time between them (beyond the first or last, as the nearest). A
move is carried exactly; a shear, being proportional to time, exactly within the
period it covered; the rest closely. On a track plotted by dead reckoning, its
courses and speeds are what edits change, so a new fix's course gains the change
in course of the fixes either side and its speed their change in proportion, and
the positions are worked out again by dead reckoning. Marks stay with their fixes,
by time; frequencies, colour and hiding are the track's own and are kept;
annotations and narrative are untouched. Replay is unaffected: each step records
its output, so undo and redo never read an item again (SUB-19, SUB-21).
"""

from __future__ import annotations

import bisect
import math
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING

from debrief_kernel.formatting import DEFAULT_SETTINGS, format_time
from debrief_kernel.geodesy import WGS84
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import DebriefFeatureCollection, models
from debrief_stac import tracks
from debrief_stac.history import Changes, HistoryError

if TYPE_CHECKING:
    from debrief_stac.catalogue import Catalogue

# A gap in the data: more than GAP_FACTOR times the track's median time between fixes,
# as smoothing and the map's labels treat one, and more than MIN_GAP_MS.
GAP_FACTOR = 10
MIN_GAP_MS = 5 * 60_000
# Fewer steps between fixes than this, and there is no median to judge a gap by.
MIN_STEPS = 3
# An offset this small (metres) is no edit: a track not changed since it was taken.
EDITED_M = 0.5
TOOL = "debrief-stac.collation"

Key = tuple[str, str, str]  # (catalogue id, item id, track id)
Span = tuple[int, int]


class CollationError(ValueError):
    """A collation step that cannot be done as asked, in plain words."""


# --- Times, spans and periods --------------------------------------------------------

_DAYS: dict[str, int] = {}


def ms_of(text: str) -> int:
    """A schema time in epoch milliseconds: parse_utc, quicker for the thousands of
    fixes a coverage reads. The day is worked out once."""
    if len(text) != 24 or text[10] != "T":
        return parse_utc(text)
    day = _DAYS.get(text[:10])
    if day is None:
        day = parse_utc(f"{text[:10]}T00:00:00.000Z")
        if len(_DAYS) > 4096:
            _DAYS.clear()
        _DAYS[text[:10]] = day
    try:
        return (
            day
            + int(text[11:13]) * 3_600_000
            + int(text[14:16]) * 60_000
            + int(text[17:19]) * 1000
            + int(text[20:23])
        )
    except ValueError:
        return parse_utc(text)


def platform_key(name: str) -> str:
    """A track's name as collation compares it: case and runs of spaces ignored, so
    "BLUE ONE", "Blue One" and " blue  one " are one platform; "BLUE-ONE" is not."""
    return " ".join(name.split()).lower()


def gap_ms(times: Sequence[int]) -> float:
    """How long a time between fixes must be to be a gap in the data: ten times the
    median time between them (the upper of the middle two), and more than five minutes.
    With fewer than three steps there is no median to judge by, so no gap, as the map's
    labels judge one."""
    steps = sorted(b - a for a, b in zip(times, times[1:], strict=False) if b > a)
    if len(steps) < MIN_STEPS:
        return math.inf
    return max(GAP_FACTOR * steps[len(steps) // 2], MIN_GAP_MS)


def spans(times: Sequence[int]) -> list[Span]:
    """The periods a track has data for: from its first fix to its last, broken at
    each gap (see gap_ms). Times in order; a single fix is a span of an instant."""
    if not times:
        return []
    gap = gap_ms(times)
    out: list[Span] = []
    start = times[0]
    for a, b in zip(times, times[1:], strict=False):
        if b - a > gap:
            out.append((start, a))
            start = b
    out.append((start, times[-1]))
    return out


@dataclass(frozen=True)
class Period:
    """A period in which the same sources have data, by their place in the list."""

    start: int
    end: int
    sources: tuple[int, ...]


def periods(sources: Sequence[Sequence[Span]]) -> list[Period]:
    """A platform's time cut where the sources with data change: each period with
    the sources whose spans hold all of it, in time order, ones with the same
    sources that meet joined. A source whose span is a single instant inside another
    source's period is not counted in it (one fix is no choice); alone, it is a
    period of its own."""
    bounds = sorted({t for spans_ in sources for span in spans_ for t in span})
    out: list[Period] = []
    for a, b in zip(bounds, bounds[1:], strict=False):
        covering = tuple(
            i
            for i, spans_ in enumerate(sources)
            if any(s <= a and b <= e and s < e for s, e in spans_)
        )
        if not covering:
            continue
        last = out[-1] if out else None
        if last is not None and last.sources == covering and last.end == a:
            out[-1] = Period(last.start, b, covering)
        else:
            out.append(Period(a, b, covering))
    for i, spans_ in enumerate(sources):
        for s, e in spans_:
            if s == e and not any(p.start <= s <= p.end for p in out):
                at = tuple(
                    j for j, other in enumerate(sources) if any(x <= s <= y for x, y in other)
                )
                out.append(Period(s, s, at or (i,)))
    out.sort(key=lambda p: (p.start, p.end))
    return out


def _when(ms: int) -> str:
    return format_time(ms, DEFAULT_SETTINGS)


def describe_span(start: int, end: int) -> str:
    """A period as notes say it: "09:00:00Z to 09:30:00Z"; one time alone, "at 09:00:00Z"."""
    return f"at {_when(start)}" if start == end else f"{_when(start)} to {_when(end)}"


def _fixes(n: int) -> str:
    return "1 fix" if n == 1 else f"{n} fixes"


# --- What an item holds --------------------------------------------------------------

# Coverage worked out for a track, by its id and the hash of its times: a track's times
# change only by fixes added or removed, and a plot is saved at every change.
_COVERED: dict[tuple[str, int, int], models.TrackCoverage] = {}
_COVERED_KEPT = 2048


def track_coverage(track: models.TrackFeature) -> models.TrackCoverage:
    times = track.properties.times
    key = (track.id, hash(tuple(times)), len(times))
    found = _COVERED.get(key)
    if found is not None and found.name == track.properties.name:
        return found
    covered = models.TrackCoverage(
        track=track.id,
        name=track.properties.name,
        fixes=len(times),
        spans=[
            models.TimeRange(start=format_utc(s), end=format_utc(e))
            for s, e in spans([ms_of(t) for t in times])
        ],
    )
    if len(_COVERED) >= _COVERED_KEPT:
        _COVERED.clear()
    _COVERED[key] = covered
    return covered


def plot_coverage(plot: DebriefFeatureCollection) -> list[models.TrackCoverage]:
    """Each track's coverage, in plot order."""
    return [track_coverage(f) for f in plot.features if f.properties.kind == "track"]


def drawn_from(plot: DebriefFeatureCollection) -> list[models.ItemRef]:
    """The items the plot took data from, each at the latest revision taken, from the
    provenance of the steps it holds now (an undone step's records are not in it)."""
    found: dict[tuple[str, str], models.ItemRef] = {}
    for record in plot.provenance or []:
        for ref in record.drawn_from or []:
            found.pop((ref.catalogue, ref.item), None)
            found[(ref.catalogue, ref.item)] = ref
    return list(found.values())


@dataclass
class ItemInfo:
    """A catalogue item as collation reads it: from its STAC item alone."""

    catalogue: Catalogue
    item: str
    title: str
    created: str | None
    revision: str | None
    coverage: list[models.TrackCoverage]
    drawn_from: list[models.ItemRef]
    start: str | None = None
    end: str | None = None

    @property
    def catalogue_id(self) -> str:
        return self.catalogue.id

    @property
    def key(self) -> tuple[str, str]:
        return (self.catalogue.id, self.item)


# Items read, by their file and its version: a study's coverage is asked again at each
# change, and most of its items have not changed since (NFR-01).
_READ: dict[tuple[str, str], tuple[tuple[int, ...], ItemInfo]] = {}
_READ_KEPT = 4096


def item_info(catalogue: Catalogue, item_id: str) -> ItemInfo:
    """What collation needs of an item, read from its STAC item: its plot is read only
    when the item has never been saved with them (an empty plot, say)."""
    path = f"{item_id}/{item_id}.json"
    try:
        version = catalogue.store.version(path)
    except (OSError, AttributeError):
        version = None
    key = (str(getattr(catalogue.store, "root", id(catalogue))), item_id)
    cached = _READ.get(key)
    if version is not None and cached is not None and cached[0] == version:
        info = cached[1]
        return info if info.catalogue is catalogue else replace(info, catalogue=catalogue)
    item = catalogue.read_item(item_id)
    props = item.properties
    coverage = props.debrief_coverage
    revision = props.debrief_revision
    refs = props.debrief_drawn_from
    if revision is None:
        try:
            history = catalogue.history(item_id)
            plot = history.plot()
            revision = history.head().plot_hash
            coverage, refs = plot_coverage(plot), drawn_from(plot)
        except (HistoryError, OSError, ValueError):
            coverage, refs = [], []
    info = ItemInfo(
        catalogue,
        item_id,
        props.title or item_id,
        props.created,
        revision,
        list(coverage or []),
        list(refs or []),
        props.start_datetime or props.datetime,
        props.end_datetime or props.datetime,
    )
    if version is not None and props.debrief_revision is not None:
        if len(_READ) >= _READ_KEPT:
            _READ.clear()
        _READ[key] = (version, info)
    return info


class Catalogues:
    """The catalogues an analyst has, by their own ids (the id in each catalog.json),
    so an item named in provenance is found whatever folder holds it."""

    def __init__(self, catalogues: Iterable[Catalogue]):
        self.by_id: dict[str, Catalogue] = {}
        for catalogue in catalogues:
            self.by_id.setdefault(catalogue.id, catalogue)
        self._infos: dict[tuple[str, str], ItemInfo | None] = {}
        self._ids: dict[str, set[str]] = {}

    def __iter__(self):
        return iter(self.by_id.values())

    def find(self, catalogue_id: str) -> Catalogue | None:
        return self.by_id.get(catalogue_id)

    def item_ids(self, catalogue: Catalogue) -> list[str]:
        """Its items, found by walking it once (SUB-23)."""
        if catalogue.id not in self._ids:
            self._ids[catalogue.id] = catalogue.item_ids()
        return list(self._ids[catalogue.id])

    def info(self, catalogue_id: str, item_id: str) -> ItemInfo | None:
        key = (catalogue_id, item_id)
        if key not in self._infos:
            catalogue = self.find(catalogue_id)
            found = None
            if catalogue is not None and item_id in self.item_ids(catalogue):
                try:
                    found = item_info(catalogue, item_id)
                except (OSError, ValueError):
                    found = None
            self._infos[key] = found
        return self._infos[key]

    def items(self, catalogue: Catalogue) -> list[ItemInfo]:
        out = []
        for item_id in self.item_ids(catalogue):
            info = self.info(catalogue.id, item_id)
            if info is not None:
                out.append(info)
        return out


# --- Fixes, each with its source -----------------------------------------------------


@dataclass
class Fix:
    """One fix of a track, with what it carries and which item's track it came from."""

    ms: int
    time: str
    position: list[float]
    source: Key
    speed: float | None = None
    course: float | None = None
    depth: float | None = None
    logged_position: list[float] | None = None
    logged_course: float | None = None
    logged_speed: float | None = None


@dataclass(frozen=True)
class Units:
    speed: str = "[kn_i]"
    course: str = "deg"
    depth: str = "m"


# Where a source puts a track's fixes, by time, in the units given: for carrying edits.
Reference = Callable[[Key, Units], dict[int, Fix]]


def _series(props, name: str) -> list[float] | None:
    s = getattr(props, name)
    return list(s.values) if s is not None else None


def fixes_of(
    track: models.TrackFeature, source: Key | Callable[[int], Key], units: Units | None = None
) -> list[Fix]:
    """A track's fixes, each tagged with its source (one for all, or by time), their
    speeds, courses and depths in units (the track's own unless given)."""
    props = track.properties
    times = props.times
    tag = source if callable(source) else (lambda _ms, s=source: s)

    def convert(name: str, unit: str | None) -> list[float] | None:
        s = getattr(props, name)
        if s is None:
            return None
        if unit is None or str(s.unit) == unit:
            return list(s.values)
        return [Quantity(v, str(s.unit)).to(unit).value for v in s.values]

    u = units or Units()
    speeds = convert("speeds", units and u.speed)
    courses = convert("courses", units and u.course)
    depths = convert("depths", units and u.depth)
    logged_courses = convert("logged_courses", units and u.course)
    logged_speeds = convert("logged_speeds", units and u.speed)
    logged = props.logged_positions.coordinates if props.logged_positions is not None else None
    out = []
    for i, (time, position) in enumerate(zip(times, track.geometry.coordinates, strict=True)):
        ms = ms_of(time)
        out.append(
            Fix(
                ms,
                time,
                list(position),
                tag(ms),
                speeds[i] if speeds else None,
                courses[i] if courses else None,
                depths[i] if depths else None,
                list(logged[i]) if logged else None,
                logged_courses[i] if logged_courses else None,
                logged_speeds[i] if logged_speeds else None,
            )
        )
    return out


def units_of(track: models.TrackFeature) -> Units:
    props = track.properties
    return Units(
        str(props.speeds.unit) if props.speeds else "[kn_i]",
        str(props.courses.unit) if props.courses else "deg",
        str(props.depths.unit) if props.depths else "m",
    )


@dataclass
class Plot:
    """The plot being collated: its catalogue and item, so its own data is named."""

    catalogue: str
    item: str
    title: str

    def own(self, track_id: str) -> Key:
        return (self.catalogue, self.item, track_id)

    def is_own(self, key: Key) -> bool:
        return key[0] == self.catalogue and key[1] == self.item


def supplies_of(track: models.TrackFeature, plot: Plot) -> list[models.TrackSupply]:
    """The periods each item supplies: as the track says, or the plot itself supplying
    the whole track, as imported."""
    if track.properties.supplies:
        return list(track.properties.supplies)
    times = track.properties.times
    return [
        models.TrackSupply(
            catalogue=plot.catalogue,
            item=plot.item,
            track=track.id,
            title=plot.title,
            start=times[0],
            end=times[-1],
        )
    ]


def _key(supply) -> Key:
    return (supply.catalogue, supply.item, supply.track)


def source_by_time(track: models.TrackFeature, plot: Plot) -> Callable[[int], Key]:
    """Which source each fix of the track came from, by its time."""
    supplies = [(ms_of(s.start), ms_of(s.end), _key(s)) for s in supplies_of(track, plot)]
    own = plot.own(track.id)

    def tag(ms: int) -> Key:
        for start, end, key in supplies:
            if start <= ms <= end:
                return key
        # A fix outside every period (one added by hand since): the plot's own.
        return own

    return tag


# --- Carrying the analyst's edits to new fixes -----------------------------------------


def _offset(raw: Sequence[float], placed: Sequence[float]) -> tuple[float, float]:
    """How far east and north (metres) a fix is from where its source puts it."""
    r = WGS84.Inverse(raw[1], raw[0], placed[1], placed[0])
    distance, bearing = r["s12"], math.radians(r["azi1"])
    return distance * math.sin(bearing), distance * math.cos(bearing)


def _offset_by(position: Sequence[float], east: float, north: float) -> list[float]:
    metres = math.hypot(east, north)
    if metres < 1e-6:
        return [position[0], position[1]]
    bearing = math.degrees(math.atan2(east, north)) % 360.0
    r = WGS84.Direct(position[1], position[0], bearing, metres)
    lon = math.fmod(r["lon2"] + 180.0, 360.0)
    return [(lon + 360.0 if lon < 0 else lon) - 180.0, r["lat2"]]


def _turn(a: float, b: float) -> float:
    """b less a, in degrees, the short way round."""
    return (b - a + 180.0) % 360.0 - 180.0


@dataclass
class Edits:
    """The analyst's changes to a track, as offsets of its fixes from their sources at
    known times, to carry to new fixes by interpolating in time."""

    times: list[int] = field(default_factory=list)
    east: list[float] = field(default_factory=list)
    north: list[float] = field(default_factory=list)
    turns: list[float] = field(default_factory=list)
    ratios: list[float] = field(default_factory=list)
    largest_m: float = 0.0
    dr: bool = False

    def _at(self, values: list[float], ms: int) -> float:
        times = self.times
        if ms <= times[0]:
            return values[0]
        if ms >= times[-1]:
            return values[-1]
        lo, hi = 0, len(times) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if times[mid] <= ms:
                lo = mid
            else:
                hi = mid
        if times[hi] == times[lo]:
            return values[lo]
        f = (ms - times[lo]) / (times[hi] - times[lo])
        return values[lo] + f * (values[hi] - values[lo])

    def any(self) -> bool:
        return bool(self.times)

    def place(self, fix: Fix) -> None:
        """Move a new fix as the fixes about it were moved (over the ground), or change
        its course and speed as theirs were (by dead reckoning)."""
        if not self.times:
            return
        if self.dr:
            if fix.course is not None and self.turns:
                fix.course = (fix.course + self._at(self.turns, fix.ms)) % 360.0
            if fix.speed is not None and self.ratios:
                fix.speed = fix.speed * self._at(self.ratios, fix.ms)
            # Only a new first fix keeps its position: dead reckoning places the rest. It
            # starts where the track's start was moved to, as the first fix was.
            fix.position = _offset_by(fix.position, self.east[0], self.north[0])
            return
        fix.position = _offset_by(
            fix.position, self._at(self.east, fix.ms), self._at(self.north, fix.ms)
        )


def edits_of(current: list[Fix], reference: Reference, dr: bool, units: Units) -> Edits:
    """The offsets of a track's fixes from where their sources put them. reference
    gives a source's fixes by time; fixes whose source cannot be read are left out."""
    edits = Edits(dr=dr)
    for fix in current:
        found = reference(fix.source, units).get(fix.ms)
        if found is None:
            continue
        if dr:
            # On a DR track edits change courses and speeds; the source's as logged.
            course = found.logged_course if found.logged_course is not None else found.course
            speed = found.logged_speed if found.logged_speed is not None else found.speed
            if fix.course is None or course is None or fix.speed is None or speed is None:
                continue
            logged = found.logged_position if found.logged_position is not None else found.position
            east, north = _offset(logged, fix.position) if not edits.times else (0.0, 0.0)
            edits.times.append(fix.ms)
            edits.turns.append(_turn(course, fix.course))
            edits.ratios.append(fix.speed / speed if speed > 0 else 1.0)
            edits.east.append(east)
            edits.north.append(north)
            edits.largest_m = max(edits.largest_m, math.hypot(east, north))
            continue
        east, north = _offset(found.position, fix.position)
        edits.times.append(fix.ms)
        edits.east.append(east)
        edits.north.append(north)
        edits.largest_m = max(edits.largest_m, math.hypot(east, north))
    if dr:
        changed = (
            any(abs(t) > 1e-6 for t in edits.turns)
            or any(abs(r - 1) > 1e-9 for r in edits.ratios)
            or edits.largest_m >= EDITED_M
        )
        if not changed:
            return Edits(dr=True)
        return edits
    if edits.largest_m < EDITED_M:
        return Edits()
    return edits


# --- Building a track from fixes ----------------------------------------------------


@dataclass
class Source:
    """A source's track, read for its fixes."""

    key: Key
    title: str
    revision: str | None
    track: models.TrackFeature | None

    def fixes(self, units: Units) -> list[Fix]:
        if self.track is None:
            return []
        return fixes_of(self.track, self.key, units)


def _runs(fixes: list[Fix]) -> list[tuple[Key, Fix, Fix]]:
    runs: list[tuple[Key, Fix, Fix]] = []
    for fix in fixes:
        if runs and runs[-1][0] == fix.source:
            runs[-1] = (fix.source, runs[-1][1], fix)
        else:
            runs.append((fix.source, fix, fix))
    return runs


def rebuilt(
    track: models.TrackFeature,
    fixes: list[Fix],
    plot: Plot,
    titles: dict[Key, tuple[str, str | None]],
    notes: list[str],
) -> models.TrackFeature:
    """The track with these fixes (in time order), every series with them where every
    fix has one, its supplies the runs of fixes from one source, its marks kept with
    their fixes by time (a mark whose fix has gone moves to the nearest fix without
    one, and the notes say so). On a track plotted by dead reckoning, the positions
    are worked out again from its first fix by each fix's course and speed."""
    props = track.properties
    name = props.name
    u = units_of(track)
    update: dict = {"times": [f.time for f in fixes]}
    for member, attr, unit, title in (
        ("speeds", "speed", u.speed, "Speeds"),
        ("courses", "course", u.course, "Courses"),
        ("depths", "depth", u.depth, "Depths"),
    ):
        values = [getattr(f, attr) for f in fixes]
        if all(v is not None for v in values):
            series_type = {
                "speeds": models.SpeedSeries,
                "courses": models.AngleSeries,
                "depths": models.LengthSeries,
            }[member]
            update[member] = series_type(unit=unit, values=values)
        else:
            if getattr(props, member) is not None:
                notes.append(f"{title} of {name} not kept: not every fix taken has one")
            update[member] = None
    dr = tracks.plotting_mode(track) == "dr"
    if dr:
        logged = [f.logged_position for f in fixes]
        update["logged_positions"] = (
            models.LineStringGeometry(type="LineString", coordinates=logged)
            if all(p is not None for p in logged)
            else None
        )
        for member, attr, unit, kind in (
            ("logged_courses", "logged_course", u.course, models.AngleSeries),
            ("logged_speeds", "logged_speed", u.speed, models.SpeedSeries),
        ):
            values = [getattr(f, attr) for f in fixes]
            update[member] = (
                kind(unit=unit, values=values) if all(v is not None for v in values) else None
            )
    # Marks stay with their fixes, found by time.
    present = {f.time for f in fixes}
    marks: dict[str, models.FixMark] = {}
    moved: list[models.FixMark] = []
    for mark in props.fix_marks or []:
        (marks.__setitem__(mark.time, mark) if mark.time in present else moved.append(mark))
    for mark in moved:
        at = ms_of(mark.time)
        free = [f for f in fixes if f.time not in marks]
        if not free:
            notes.append(f"The mark on {name}'s fix at {_when(at)} not kept: no fix free for it")
            continue
        nearest = min(free, key=lambda f: (abs(f.ms - at), f.ms))
        marks[nearest.time] = mark.model_copy(update={"time": nearest.time})
        notes.append(
            f"The mark on {name}'s fix at {_when(at)} moved to its fix at {_when(nearest.ms)}"
        )
    update["fix_marks"] = [marks[t] for t in sorted(marks)] or None
    runs = _runs(fixes)
    if all(plot.is_own(key) and key[2] == track.id for key, _, _ in runs):
        update["supplies"] = None
    else:
        update["supplies"] = [
            models.TrackSupply(
                catalogue=key[0],
                item=key[1],
                track=key[2],
                title=titles.get(key, (plot.title, None))[0],
                revision=None if plot.is_own(key) else titles.get(key, ("", None))[1],
                start=first.time,
                end=last.time,
            )
            for key, first, last in runs
        ]
    properties = props.model_copy(update=update)
    geometry = track.geometry.model_copy(update={"coordinates": [f.position for f in fixes]})
    built = track.model_copy(update={"geometry": geometry, "properties": properties})
    if dr and properties.courses is not None and properties.speeds is not None:
        positions = tracks.dead_reckoned_positions(built)
        built = built.model_copy(
            update={"geometry": geometry.model_copy(update={"coordinates": positions})}
        )
    return built


def merged(existing: list[Fix], added: list[Fix]) -> list[Fix]:
    """Fixes in time order; where two share a time, the one already there is kept."""
    taken = {f.ms for f in existing}
    out = existing + [f for f in added if f.ms not in taken]
    out.sort(key=lambda f: f.ms)
    return out


# --- The steps ------------------------------------------------------------------------


def _same(ref, key: Key) -> bool:
    return (ref.catalogue, ref.item, ref.track) == key


def linked(track: models.TrackFeature, key: Key) -> bool:
    return any(_same(r, key) for r in track.properties.platform_links or [])


def unlinked(track: models.TrackFeature, key: Key) -> bool:
    return any(_same(r, key) for r in track.properties.platform_unlinks or [])


def matches(track: models.TrackFeature, key: Key, name: str) -> str | None:
    """How a track in another item is this track's platform: "linked", "proposed"
    (its name matches), "supplying", or None."""
    if linked(track, key):
        return "linked"
    if any(_key(s) == key for s in track.properties.supplies or []):
        return "supplying"
    if unlinked(track, key):
        return None
    if platform_key(name) == platform_key(track.properties.name):
        return "proposed"
    return None


@dataclass
class Taken:
    """What taking an item's data did, for the step's record and the analyst."""

    changes: Changes
    note: str
    notes: list[str]
    matched: dict[str, int]  # the plot's track names, and fixes each gained or replaced
    added: list[str]


def take(
    plot: DebriefFeatureCollection,
    me: Plot,
    source: DebriefFeatureCollection,
    source_item: ItemInfo,
    reference: Reference,
    taken_ids: set[str] | None = None,
) -> Taken:
    """Take an item's data into the plot (CAP-11): see the module's description.
    reference gives a source's fixes by time, as taken (for carrying edits)."""
    item_key = source_item.key
    title, revision = source_item.title, source_item.revision
    plot_tracks = [f for f in plot.features if f.properties.kind == "track"]
    theirs = [f for f in source.features if f.properties.kind == "track"]
    taken_ids = set(taken_ids or {f.id for f in plot.features})
    modified: dict[str, models.TrackFeature] = {}
    added: list[models.TrackFeature] = []
    notes: list[str] = []
    matched: dict[str, int] = {}
    for theirs_track in theirs:
        key = (*item_key, theirs_track.id)
        candidates = [
            t for t in plot_tracks if matches(t, key, theirs_track.properties.name) is not None
        ]
        # Linked by hand first, then by name, then the first in the plot.
        candidates.sort(key=lambda t: (not linked(t, key), plot_tracks.index(t)))
        if not candidates:
            copy = _copied(theirs_track, key, title, revision, taken_ids)
            added.append(copy)
            notes.append(
                f"{theirs_track.properties.name} added: {_fixes(len(copy.properties.times))}, "
                f"{_describe_spans(theirs_track)}"
            )
            continue
        if len(candidates) > 1:
            names = ", ".join(t.properties.name for t in candidates[1:])
            notes.append(
                f"{theirs_track.properties.name} matches more than one track; taken into "
                f"{candidates[0].properties.name}, not {names}"
            )
        target = modified.get(candidates[0].id, candidates[0])
        result = _take_into(
            target, theirs_track, key, me, title, revision, reference, notes, plot_tracks
        )
        if result is None:
            continue
        built, gained = result
        modified[target.id] = built
        matched[target.properties.name] = matched.get(target.properties.name, 0) + gained
    if not modified and not added:
        raise CollationError(
            f"{title} has nothing the plot hasn't: every fix it has is in a period another "
            "item supplies, or it has no tracks. Choose its periods in Coverage, or set it "
            "aside with Not now."
        )
    parts = [f"{name} {_fixes(n)}" for name, n in matched.items()]
    parts += [f"{t.properties.name} added" for t in added]
    # Named shortly, as the History view names a step; what it did, in the next note.
    note = f"New data from {title}"
    notes.insert(0, ", ".join(parts))
    return Taken(
        Changes(added=added, modified=list(modified.values())),
        note,
        notes,
        matched,
        [t.properties.name for t in added],
    )


def _describe_spans(track: models.TrackFeature) -> str:
    covered = spans([ms_of(t) for t in track.properties.times])
    return "; ".join(describe_span(s, e) for s, e in covered)


def _copied(
    track: models.TrackFeature, key: Key, title: str, revision: str | None, taken: set[str]
) -> models.TrackFeature:
    """A track of another item, as a new track of the plot supplied by it."""
    new_id = (
        track.id if track.id not in taken else tracks.new_track_id(track.properties.name, taken)
    )
    taken.add(new_id)
    props = track.properties
    ref = models.SourceTrackRef(catalogue=key[0], item=key[1], track=key[2], name=props.name)
    supply = models.TrackSupply(
        catalogue=key[0],
        item=key[1],
        track=key[2],
        title=title,
        revision=revision,
        start=props.times[0],
        end=props.times[-1],
    )
    return track.model_copy(
        update={
            "id": new_id,
            "properties": props.model_copy(
                update={
                    "supplies": [supply],
                    "platform_links": [ref],
                    "platform_unlinks": None,
                }
            ),
        }
    )


def _take_into(
    track: models.TrackFeature,
    theirs: models.TrackFeature,
    key: Key,
    me: Plot,
    title: str,
    revision: str | None,
    reference: Reference,
    notes: list[str],
    plot_tracks: list[models.TrackFeature],
) -> tuple[models.TrackFeature, int] | None:
    name = track.properties.name
    units = units_of(track)
    dr = tracks.plotting_mode(track) == "dr"
    current = fixes_of(track, source_by_time(track, me), units)
    their_fixes = fixes_of(theirs, key, units)
    if dr and (theirs.properties.courses is None or theirs.properties.speeds is None):
        notes.append(
            f"Nothing taken into {name}: it is plotted by dead reckoning, and "
            f"{theirs.properties.name} in {title} records no courses and speeds"
        )
        return None
    # Periods the item supplies already are read again, from its revision now.
    refreshed = [
        (ms_of(s.start), ms_of(s.end)) for s in track.properties.supplies or [] if _key(s) == key
    ]
    covered = spans([f.ms for f in current])

    def inside(ms: int, periods_: Iterable[Span]) -> bool:
        return any(a <= ms <= b for a, b in periods_)

    fresh = [f for f in their_fixes if inside(f.ms, refreshed) or not inside(f.ms, covered)]
    if not fresh:
        return None
    edits = edits_of(current, reference, dr, units)
    for fix in fresh:
        _as_logged(fix)
        edits.place(fix)
    kept = [f for f in current if not inside(f.ms, refreshed)]
    fixes = merged(kept, fresh)
    gained = sum(1 for f in fixes if f.source == key) - sum(1 for f in kept if f.source == key)
    if refreshed:
        notes.append(
            f"{name}'s periods from {title} read again from its latest revision: "
            + "; ".join(describe_span(a, b) for a, b in refreshed)
        )
    overlap = [f for f in their_fixes if inside(f.ms, covered) and not inside(f.ms, refreshed)]
    if overlap:
        notes.append(
            f"{title} also has data for {name} {describe_span(overlap[0].ms, overlap[-1].ms)}, "
            "where another item supplies it: choose which in Coverage"
        )
    if edits.any():
        notes.append(_describe_edits(name, edits))
    titles = _titles(track, me)
    titles[key] = (title, revision)
    built = rebuilt(track, fixes, me, titles, notes)
    links = list(track.properties.platform_links or [])
    if not linked(track, key):
        links.append(
            models.SourceTrackRef(
                catalogue=key[0], item=key[1], track=key[2], name=theirs.properties.name
            )
        )
        if platform_key(theirs.properties.name) == platform_key(name):
            notes.append(f"{theirs.properties.name} in {title} confirmed as {name}")
    built = built.model_copy(
        update={"properties": built.properties.model_copy(update={"platform_links": links})}
    )
    return built, gained


def _as_logged(fix: Fix) -> None:
    """A fix from another item as logged: where it was plotted by dead reckoning there,
    its positions, courses and speeds as logged are what is taken."""
    if fix.logged_position is not None:
        fix.position = list(fix.logged_position)
    if fix.logged_course is not None:
        fix.course = fix.logged_course
    if fix.logged_speed is not None:
        fix.speed = fix.logged_speed
    fix.logged_position = list(fix.position)
    fix.logged_course = fix.course
    fix.logged_speed = fix.speed


def _titles(track: models.TrackFeature, me: Plot) -> dict[Key, tuple[str, str | None]]:
    titles = {me.own(track.id): (me.title, None)}
    for s in track.properties.supplies or []:
        titles[_key(s)] = (s.title, s.revision)
    return titles


def _describe_edits(name: str, edits: Edits) -> str:
    if edits.dr:
        return (
            f"New fixes on {name} (DR) follow the changes made to its courses and speeds "
            "around them; the positions after them are worked out again by dead reckoning"
        )
    nmi = edits.largest_m / 1852.0
    return (
        f"New fixes on {name} follow the changes made to the track around them "
        f"(fixes there moved up to {nmi:.2f} nmi from where their sources put them)"
    )


@dataclass
class Chosen:
    track: models.TrackFeature
    note: str
    notes: list[str]
    drawn: models.ItemRef | None


def prefer(
    plot: DebriefFeatureCollection,
    me: Plot,
    track_id: str,
    period: Span,
    source: Source,
    reference: Reference,
) -> Chosen | None:
    """The track with one period supplied by another source (CAP-09): its fixes in the
    period replaced by the source's, edits carried; None if that source supplies it
    already. Refused, saying why, if the source has no data then."""
    track = next(
        (f for f in plot.features if f.id == track_id and f.properties.kind == "track"), None
    )
    if track is None:
        raise CollationError(f"The plot has no track {track_id!r}.")
    start, end = period
    if start > end:
        raise CollationError("The period ends before it starts.")
    name = track.properties.name
    units = units_of(track)
    dr = tracks.plotting_mode(track) == "dr"
    current = fixes_of(track, source_by_time(track, me), units)
    inside = [f for f in current if start <= f.ms <= end]
    theirs = [f for f in source.fixes(units) if start <= f.ms <= end]
    if not theirs:
        raise CollationError(
            f"{source.title} has no data for {name} {describe_span(start, end)}, so nothing "
            "was changed."
        )
    if inside and all(f.source == source.key for f in inside) and len(inside) >= len(theirs):
        return None
    if (
        dr
        and source.track is not None
        and (source.track.properties.courses is None or source.track.properties.speeds is None)
    ):
        raise CollationError(
            f"{name} is plotted by dead reckoning, and {source.title} records no courses and "
            "speeds for it, so it cannot supply a period of it."
        )
    edits = edits_of(current, reference, dr, units)
    own = me.is_own(source.key)
    for fix in theirs:
        if not own:
            _as_logged(fix)
        else:
            fix.logged_position = fix.logged_position or list(fix.position)
            fix.logged_course = fix.logged_course if fix.logged_course is not None else fix.course
            fix.logged_speed = fix.logged_speed if fix.logged_speed is not None else fix.speed
        edits.place(fix)
    kept = [f for f in current if not start <= f.ms <= end]
    fixes = merged(kept, theirs)
    was = sorted({f.source for f in inside})
    titles = _titles(track, me)
    titles[source.key] = (source.title, None if own else source.revision)
    notes: list[str] = []
    was_titles = [titles.get(k, (k[1], None))[0] for k in was]
    if was_titles:
        notes.append(f"Was {', '.join(was_titles)}: {_fixes(len(inside))}")
    notes.append(f"Now {source.title}: {_fixes(len(theirs))}")
    if edits.any():
        notes.append(_describe_edits(name, edits))
    built = rebuilt(track, fixes, me, titles, notes)
    note = f"{name} {describe_span(start, end)} from {source.title}"
    drawn = (
        None
        if own or source.revision is None
        else models.ItemRef(
            catalogue=source.key[0],
            item=source.key[1],
            title=source.title,
            revision=source.revision,
        )
    )
    if not own and not linked(track, source.key):
        links = list(built.properties.platform_links or [])
        links.append(
            models.SourceTrackRef(
                catalogue=source.key[0],
                item=source.key[1],
                track=source.key[2],
                name=source.track.properties.name if source.track else name,
            )
        )
        built = built.model_copy(
            update={"properties": built.properties.model_copy(update={"platform_links": links})}
        )
    return Chosen(built, note, notes, drawn)


def relink(
    track: models.TrackFeature, ref: models.SourceTrackRef, link: bool, title: str
) -> tuple[models.TrackFeature, str] | None:
    """The track with a track in another item linked as its platform, or unlinked (a
    proposal by name then refused); None if it already is. Refused while that item
    supplies a period of the track."""
    key = (ref.catalogue, ref.item, ref.track)
    props = track.properties
    name = props.name
    links = [r for r in props.platform_links or [] if not _same(r, key)]
    unlinks = [r for r in props.platform_unlinks or [] if not _same(r, key)]
    proposed = platform_key(ref.name) == platform_key(name)
    if link:
        if linked(track, key):
            return None
        links.append(ref)
        verb = "confirmed as" if proposed and not unlinked(track, key) else "linked to"
        note = f"{ref.name} in {title} {verb} {name}"
    else:
        supplying = [s for s in props.supplies or [] if _key(s) == key]
        if supplying:
            when = "; ".join(describe_span(ms_of(s.start), ms_of(s.end)) for s in supplying)
            raise CollationError(
                f"{title} supplies {name} {when}. Choose another source for that period in "
                "Coverage first, or undo the step that took it."
            )
        if not linked(track, key) and (not proposed or unlinked(track, key)):
            return None
        if proposed:
            unlinks.append(ref)
        note = f"{ref.name} in {title} {'is not' if proposed else 'unlinked from'} {name}"
    update = {"platform_links": links or None, "platform_unlinks": unlinks or None}
    return track.model_copy(update={"properties": props.model_copy(update=update)}), note


# --- What the browser shows ------------------------------------------------------------


def _time(ms: int | None) -> str | None:
    return format_utc(ms) if ms is not None else None


def _range(start: int, end: int) -> models.TimeRange:
    return models.TimeRange(start=format_utc(start), end=format_utc(end))


def _spans_of(coverage: models.TrackCoverage) -> list[Span]:
    return [(ms_of(s.start), ms_of(s.end)) for s in coverage.spans]


def folder_tree(catalogues: Catalogues, home: Catalogue, ids: Iterable[str]) -> list[Catalogue]:
    """The catalogues the plot draws from: its own, and those of the items it took
    data from that can be found (CAP-10)."""
    out = [home]
    for catalogue_id in ids:
        found = catalogues.find(catalogue_id)
        if found is not None and found not in out:
            out.append(found)
    return out


def coverage(
    catalogues: Catalogues,
    home: Catalogue,
    item_id: str,
    plot: DebriefFeatureCollection,
    view: models.PlotView | None,
    first_recorded: Callable[[str], models.TrackFeature | None],
) -> models.CoverageReport:
    """The plot's coverage (CAP-08, CAP-09): for each of its tracks, its own data and
    the data of tracks in other items linked or proposed as its platform, with the
    periods each covers and which supplies each; the items in the folder tree it draws
    from, marked as new data where they are (CAP-10) or as revised since taken (CAP-12)."""
    mine = catalogues.info(home.id, item_id) or item_info(home, item_id)
    plot_details = next((f for f in plot.features if f.properties.kind == "plot"), None)
    title = (plot_details.properties.title if plot_details else None) or mine.title
    me = Plot(home.id, item_id, title)
    refs = drawn_from(plot)
    plot_tracks = [f for f in plot.features if f.properties.kind == "track"]
    supply_keys = {(s.catalogue, s.item) for t in plot_tracks for s in t.properties.supplies or []}
    tree = folder_tree(
        catalogues, home, [r.catalogue for r in refs] + [c for c, _ in sorted(supply_keys)]
    )
    others = [
        info for catalogue in tree for info in catalogues.items(catalogue) if info.key != mine.key
    ]
    by_key = {info.key: info for info in others}
    taken = {(r.catalogue, r.item): r.revision for r in refs}
    said = (view.collation if view is not None else None) or models.CollationView()
    reviewed = {(r.catalogue, r.item, r.revision) for r in said.reviewed or []}
    dismissed = {(r.catalogue, r.item, r.revision) for r in said.dismissed or []}

    platforms: list[models.CoveragePlatform] = []
    lo: int | None = None
    hi: int | None = None
    for track in plot_tracks:
        props = track.properties
        sources: list[models.CoverageSource] = []
        keys: list[Key] = []
        supplies = supplies_of(track, me)
        own_supplies = [s for s in supplies if me.is_own(_key(s))]
        if own_supplies:
            own_id = own_supplies[0].track
            original = first_recorded(own_id) if own_id else None
            own_track = original if original is not None else track
            if original is None or original.properties.kind != "track":
                own_track = track
            own_spans = spans([ms_of(t) for t in own_track.properties.times])
            sources.append(
                models.CoverageSource(
                    catalogue=me.catalogue,
                    item=me.item,
                    track=own_id,
                    name=own_track.properties.name,
                    title=me.title,
                    link="plot",
                    fixes=len(own_track.properties.times),
                    spans=[_range(a, b) for a, b in own_spans],
                )
            )
            keys.append(me.own(own_id))
        candidates: list[tuple[Key, str, str]] = []
        for s in supplies:
            if not me.is_own(_key(s)):
                candidates.append((_key(s), "linked", s.title))
        for r in props.platform_links or []:
            candidates.append(((r.catalogue, r.item, r.track), "linked", ""))
        for info in others:
            for cov in info.coverage:
                key = (*info.key, cov.track)
                how = matches(track, key, cov.name)
                if how == "proposed":
                    candidates.append((key, "proposed", info.title))
        for key, link, fallback in candidates:
            if key in keys:
                continue
            info = by_key.get(key[:2]) or catalogues.info(key[0], key[1])
            cov = next((c for c in info.coverage if c.track == key[2]), None) if info else None
            supplied = [s for s in supplies if _key(s) == key]
            revised = bool(
                info
                and info.revision
                and any(s.revision and s.revision != info.revision for s in supplied)
            )
            sources.append(
                models.CoverageSource(
                    catalogue=key[0],
                    item=key[1],
                    track=key[2],
                    name=cov.name
                    if cov
                    else next(
                        (r.name for r in props.platform_links or [] if _same(r, key)), props.name
                    ),
                    title=info.title if info else fallback or key[1],
                    link=link,
                    fixes=cov.fixes if cov else 0,
                    spans=list(cov.spans) if cov else [],
                    revised=revised or None,
                )
            )
            keys.append(key)
        cut = periods([[(ms_of(s.start), ms_of(s.end)) for s in src.spans] for src in sources])
        supply_spans = [(ms_of(s.start), ms_of(s.end), _key(s)) for s in supplies]
        times = [ms_of(t) for t in props.times]
        track_spans = spans(times)
        rows = []
        for p in cut:
            middle = (p.start + p.end) // 2
            chosen = next(
                (keys.index(k) for a, b, k in supply_spans if a <= middle <= b and k in keys),
                None,
            )
            if chosen is None:
                # A period between two supplied ones: whichever supplies its fixes.
                chosen = next(
                    (keys.index(k) for a, b, k in supply_spans if a <= p.start <= b and k in keys),
                    None,
                )
            if chosen is not None and chosen not in p.sources:
                chosen = None
            if (
                chosen is None
                and any(a <= p.start and p.end <= b for a, b in track_spans)
                and bisect.bisect_right(times, p.start) == bisect.bisect_left(times, p.end)
            ):
                # Between two fixes of the stitched track where one source hands over to
                # the next (seconds, usually): the track has no gap there, and taking
                # another source for it would replace no fix, so it is not offered.
                continue
            rows.append(
                models.CoveragePeriod(
                    start=format_utc(p.start),
                    end=format_utc(p.end),
                    sources=list(p.sources),
                    chosen=chosen,
                )
            )
            lo = p.start if lo is None else min(lo, p.start)
            hi = p.end if hi is None else max(hi, p.end)
        colour = props.style.colour if props.style else None
        platforms.append(
            models.CoveragePlatform(
                track=track.id, name=props.name, colour=colour, sources=sources, periods=rows
            )
        )

    # The plot's period, and the names of its platforms, for marking new data.
    plot_spans = [s for t in plot_tracks for s in spans([ms_of(x) for x in t.properties.times])]
    p_start = min((a for a, _ in plot_spans), default=None)
    p_end = max((b for _, b in plot_spans), default=None)
    own_created = mine.created
    items = [
        models.CoverageItem(
            catalogue=me.catalogue,
            item=me.item,
            title=me.title,
            role="this_plot",
            created=mine.created,
            start=mine.start,
            end=mine.end,
            revision=mine.revision,
            tracks=mine.coverage or None,
        )
    ]
    for info in others:
        role = "drawn_from" if info.key in taken or info.key in supply_keys else "other"
        revised = (
            info.key in taken and info.revision is not None and taken[info.key] != info.revision
        )
        mark = None
        if (
            role == "other"
            and info.revision is not None
            and own_created is not None
            and info.created is not None
            and info.created > own_created
            and (*info.key, info.revision) not in dismissed
        ):
            mark = _new_data(info, plot_tracks, me, p_start, p_end)
        items.append(
            models.CoverageItem(
                catalogue=info.catalogue_id,
                item=info.item,
                title=info.title,
                role=role,
                created=info.created,
                start=info.start,
                end=info.end,
                revision=info.revision,
                tracks=info.coverage or None,
                new_data=mark,
                revised=revised or None,
            )
        )
    review = _review(me, refs, catalogues, reviewed)
    return models.CoverageReport(
        catalogue=me.catalogue,
        item=me.item,
        title=me.title,
        start=_time(lo),
        end=_time(hi),
        platforms=platforms,
        items=items,
        review=review,
    )


def _new_data(
    info: ItemInfo,
    plot_tracks: list[models.TrackFeature],
    me: Plot,
    start: int | None,
    end: int | None,
) -> models.NewDataMark | None:
    names: list[str] = []
    within = False
    for cov in info.coverage:
        key = (*info.key, cov.track)
        for track in plot_tracks:
            if matches(track, key, cov.name) in ("linked", "proposed"):
                if track.properties.name not in names:
                    names.append(track.properties.name)
        if start is not None and end is not None:
            within = within or any(a <= end and b >= start for a, b in _spans_of(cov))
    if not names and not within:
        return None
    said = ", ".join(names[:4]) + (f" and {len(names) - 4} more" if len(names) > 4 else "")
    if names and within:
        note = f"New data for {me.title}: {said}, within its period"
    elif names:
        note = f"New data for {me.title}: {said}"
    else:
        note = f"New data for {me.title}, within its period"
    return models.NewDataMark(
        revision=info.revision, platforms=names or None, within_period=within or None, note=note
    )


def _review(
    me: Plot,
    refs: list[models.ItemRef],
    catalogues: Catalogues,
    reviewed: set[tuple[str, str, str]],
) -> models.ReviewFlag | None:
    revised = []
    for ref in refs:
        info = catalogues.info(ref.catalogue, ref.item)
        if info is None or info.revision is None or info.revision == ref.revision:
            continue
        if (ref.catalogue, ref.item, info.revision) in reviewed:
            continue
        revised.append(
            models.ItemRef(
                catalogue=ref.catalogue, item=ref.item, title=info.title, revision=info.revision
            )
        )
    if not revised:
        return None
    names = ", ".join(r.title or r.item for r in revised)
    verb = "was" if len(revised) == 1 else "were"
    return models.ReviewFlag(
        catalogue=me.catalogue,
        item=me.item,
        title=me.title,
        revised=revised,
        note=f"May need review: {names} {verb} revised since {me.title} took data from "
        f"{'it' if len(revised) == 1 else 'them'}",
    )


def review_flags(
    catalogues: Catalogues, reviewed_of: Callable[[Catalogue, str], set[tuple[str, str, str]]]
) -> list[models.ReviewFlag]:
    """Every product in the analyst's catalogues that drew from an item since revised
    (CAP-12): read from the items alone; a product's island is read only to see which
    revisions it was reviewed against. Items its provenance names that cannot be found
    are passed over."""
    flags = []
    for catalogue in catalogues:
        for info in catalogues.items(catalogue):
            if not info.drawn_from:
                continue
            stale = [
                ref
                for ref in info.drawn_from
                if (found := catalogues.info(ref.catalogue, ref.item)) is not None
                and found.revision is not None
                and found.revision != ref.revision
            ]
            if not stale:
                continue
            flag = _review(
                Plot(catalogue.id, info.item, info.title),
                stale,
                catalogues,
                reviewed_of(catalogue, info.item),
            )
            if flag is not None:
                flags.append(flag)
    return flags


__all__ = [
    "CollationError",
    "Catalogues",
    "GAP_FACTOR",
    "ItemInfo",
    "MIN_GAP_MS",
    "Period",
    "Plot",
    "coverage",
    "drawn_from",
    "item_info",
    "ms_of",
    "periods",
    "platform_key",
    "plot_coverage",
    "review_flags",
    "spans",
    "take",
    "track_coverage",
]
