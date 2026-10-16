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
- **New data** (decisions, product owner, 16 Oct 2026). Data arrives only through
  Debrief's import. An item that came into the folder tree the plot draws from after
  the plot did is marked as new data for it, until the analyst takes it or sets it
  aside, when it shares a platform with the plot (linked or proposed), has data within
  the plot's period, and is not made from the plot's data; and either it came in by
  importing files (its first record names them) and is no product of other items, or
  it is a copy of the plot (their histories share their first step) with steps since
  they parted that add data. Items made by hand and products are never new data.
- **Taking new data** is the analyst's choice: one recorded step naming the item. A
  matched track gains the item's fixes where it has none (and, where the item
  already supplies a period, that period is read again from the item's latest
  revision); periods supplied by another item stay theirs, as the analyst chose;
  tracks that match none of the plot's are added. Taking an item whose data the plot
  has already, as it is now, makes no step: the plot is marked as reviewed against
  that revision instead.
- **Revisions.** Any recorded change to an item, of its data or its details, is a new
  revision (its plot's content hash). Each period a track takes from an item names
  the revision it was read at, so periods of one item read at two revisions say so.
  A product with a period read at a revision the item no longer has may need review,
  until the analyst clears its flag; who cleared it and when are kept in its island.

Coverage is worked out within the plot's own period: items far outside it cost
nothing and offer no choice, though tracks of the same name are still proposed.

Edits survive. Fixes taken into a track the analyst has changed (moved, rotated,
sheared, stretched, smoothed) follow the change made around them: each existing
fix's offset from where its source, at the revision it was read at, puts it is
worked out, and a new fix is offset by the offsets of the fixes either side of it in
time, in proportion to its time between them (beyond the first or last, as the
nearest). Its course and speed are carried through the same change, as a shear or a
stretch carries a fix's own: a rotation turns the course, a stretch scales the
speed. A move is carried exactly; a shear, being proportional to time, exactly
within the period it covered; the rest closely. A fix dragged on its own moves only
a new fix at its very time. On a track plotted by dead reckoning, its courses and
speeds are what edits change, so a new fix's course gains the change in course of
the fixes either side and its speed their change in proportion, and the positions
are worked out again by dead reckoning. Marks stay with their fixes,
by time; frequencies, colour and hiding are the track's own and are kept;
annotations and narrative are untouched. Replay is unaffected: each step records
its output, so undo and redo never read an item again (SUB-19, SUB-21).
"""

from __future__ import annotations

import bisect
import logging
import math
from collections import OrderedDict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING

from debrief_kernel.formatting import DEFAULT_SETTINGS, format_time
from debrief_kernel.geodesy import WGS84, Position, destination, range_bearing
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
    # A sweep along the time: each source's spans open and close at their bounds, so
    # the work grows with the number of spans, not with spans times bounds (NFR-01).
    bounds = sorted({t for spans_ in sources for span in spans_ for t in span})
    index = {t: k for k, t in enumerate(bounds)}
    opening: list[list[int]] = [[] for _ in bounds]
    closing: list[list[int]] = [[] for _ in bounds]
    for i, spans_ in enumerate(sources):
        for s, e in spans_:
            if s < e:
                opening[index[s]].append(i)
                closing[index[e]].append(i)
    open_count = [0] * len(sources)
    active: set[int] = set()
    out: list[Period] = []
    for k in range(len(bounds) - 1):
        for i in closing[k]:
            open_count[i] -= 1
            if not open_count[i]:
                active.discard(i)
        for i in opening[k]:
            open_count[i] += 1
            active.add(i)
        if not active:
            continue
        a, b = bounds[k], bounds[k + 1]
        covering = tuple(sorted(active))
        last = out[-1] if out else None
        if last is not None and last.sources == covering and last.end == a:
            out[-1] = Period(last.start, b, covering)
        else:
            out.append(Period(a, b, covering))
    # Single instants: a period of their own, unless inside one already.
    starts = [p.start for p in out]
    flat = [sorted(spans_) for spans_ in sources]
    flat_starts = [[s for s, _ in spans_] for spans_ in flat]

    def holds(j: int, t: int) -> bool:
        n = bisect.bisect_right(flat_starts[j], t)
        return any(flat[j][m][0] <= t <= flat[j][m][1] for m in range(max(0, n - 2), n))

    instants: list[Period] = []
    for i, spans_ in enumerate(sources):
        for s, e in spans_:
            if s != e:
                continue
            n = bisect.bisect_right(starts, s)
            if any(out[m].start <= s <= out[m].end for m in range(max(0, n - 2), n)):
                continue
            if any(p.start == s for p in instants):
                continue
            at = tuple(j for j in range(len(sources)) if holds(j, s))
            instants.append(Period(s, s, at or (i,)))
    out.extend(instants)
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


def taken_from(plot: DebriefFeatureCollection) -> list[models.ItemRef]:
    """The items the plot ever took data from, each at the latest revision taken, from
    the provenance of the steps it holds now (an undone step's records are not in it).
    An item taken from is no longer new data for it, even once none of its data is left."""
    found: dict[tuple[str, str], models.ItemRef] = {}
    for record in plot.provenance or []:
        for ref in record.drawn_from or []:
            found.pop((ref.catalogue, ref.item), None)
            found[(ref.catalogue, ref.item)] = ref
    return list(found.values())


def drawn_from(plot: DebriefFeatureCollection) -> list[models.ItemRef]:
    """The items the plot's tracks take data from now, each at every revision a period
    was read at, from the tracks' supplies (CAP-12): what a review flag is judged by. An
    item whose periods have all gone back to other sources is no longer drawn from, and
    a period read at an older revision than the rest is named at that revision."""
    found: dict[tuple[str, str, str], models.ItemRef] = {}
    for feature in plot.features:
        if feature.properties.kind != "track":
            continue
        for s in feature.properties.supplies or []:
            if s.revision is None:  # the plot's own data
                continue
            key = (s.catalogue, s.item, s.revision)
            if key not in found:
                found[key] = models.ItemRef(
                    catalogue=s.catalogue, item=s.item, title=s.title, revision=s.revision
                )
    return list(found.values())


def first_recorded_at(plot: DebriefFeatureCollection) -> str | None:
    """When the plot's first step was made: when an item saved before items kept their
    arrival came in, near enough (CAP-10)."""
    first = (plot.provenance or [None])[0]
    return first.started_at if first is not None else None


def imported(plot: DebriefFeatureCollection) -> bool:
    """Whether the plot came in by importing source files: its first record names the
    files it read (CAP-10). A plot made by hand, a copy or a product's first record names
    none."""
    first = (plot.provenance or [None])[0]
    return bool(first is not None and first.used)


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
    imported: bool = False
    origin: str | None = None
    # Each track's spans in milliseconds, worked out once while the item is unchanged.
    _spans_ms: dict[str, list[Span]] = field(default_factory=dict, repr=False, compare=False)

    def spans_ms(self, cov: models.TrackCoverage) -> list[Span]:
        found = self._spans_ms.get(cov.track)
        if found is None:
            found = self._spans_ms[cov.track] = _spans_of(cov)
        return found

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
    created = props.created
    was_imported = bool(props.debrief_imported)
    origin = props.debrief_origin
    whole = revision is not None and props.debrief_imported is not None
    if not whole:
        # Saved before collation kept these in the item: worked out from its plot, and
        # when it came in from its first step, so it can still be new data (CAP-10).
        try:
            history = catalogue.history(item_id)
            plot, revision = history.plot_and_revision()
            coverage, refs = plot_coverage(plot), drawn_from(plot)
            was_imported, origin = imported(plot), history.origin()
            created = created or first_recorded_at(plot)
        except (HistoryError, OSError, ValueError):
            coverage, refs = [], []
    info = ItemInfo(
        catalogue,
        item_id,
        props.title or item_id,
        created,
        revision,
        list(coverage or []),
        list(refs or []),
        props.start_datetime or props.datetime,
        props.end_datetime or props.datetime,
        was_imported,
        origin,
    )
    if version is not None and whole:
        if len(_READ) >= _READ_KEPT:
            _READ.clear()
        _READ[key] = (version, info)
    return info


_LOG = logging.getLogger(__name__)


def _where(catalogue: Catalogue) -> str:
    return str(getattr(catalogue.store, "root", id(catalogue)))


class Catalogues:
    """The catalogues an analyst has, by their own ids (the id in each catalog.json),
    so an item named in provenance is found whatever folder holds it."""

    def __init__(self, catalogues: Iterable[Catalogue]):
        self.by_id: dict[str, Catalogue] = {}
        # Two folders with one catalogue id (a catalogue copied, say): provenance names
        # items by catalogue id, so only the first is looked in, and the analyst is told.
        self.duplicates: list[str] = []
        for catalogue in catalogues:
            kept = self.by_id.setdefault(catalogue.id, catalogue)
            if kept is not catalogue and _where(kept) != _where(catalogue):
                self.duplicates.append(catalogue.id)
                _LOG.warning(
                    "Two catalogues have the id %r: %s and %s. Collation looks only in the "
                    "first; give the other its own id.",
                    catalogue.id,
                    _where(kept),
                    _where(catalogue),
                )
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
    # The revision of the item it came from, when it came from another item: fixes read
    # at different revisions of one item are told apart (CAP-12).
    revision: str | None = None


@dataclass(frozen=True)
class Units:
    speed: str = "[kn_i]"
    course: str = "deg"
    depth: str = "m"


# Where a source, at a revision (None for the plot's own data), puts a track's fixes, by
# time, in the units given: for carrying edits.
Reference = Callable[[Key, str | None, Units], dict[int, Fix]]


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


def current_fixes(track: models.TrackFeature, plot: Plot, units: Units) -> list[Fix]:
    """The track's fixes, each with the source and the revision it came from, by the
    period of the track's supplies its time is in. A fix outside every period (one added
    by hand since) is the plot's own."""
    supplies = sorted(
        (ms_of(s.start), ms_of(s.end), _key(s), s.revision) for s in supplies_of(track, plot)
    )
    starts = [s[0] for s in supplies]
    own = plot.own(track.id)
    fixes = fixes_of(track, own, units)
    for fix in fixes:
        i = bisect.bisect_right(starts, fix.ms) - 1
        if i >= 0 and supplies[i][0] <= fix.ms <= supplies[i][1]:
            _, _, key, revision = supplies[i]
            fix.source = key
            fix.revision = None if plot.is_own(key) else revision
    return fixes


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
    units: Units = field(default_factory=Units)
    # Single fixes dragged on their own, by time: their offsets go to a new fix at that
    # very time only, never spread to the fixes about them.
    single: dict[int, tuple[float, float]] = field(default_factory=dict)

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
        return bool(self.times) or bool(self.single)

    def _offsets_at(self, ms: int) -> tuple[float, float]:
        if not self.times:
            return 0.0, 0.0
        return self._at(self.east, ms), self._at(self.north, ms)

    def place(self, fix: Fix) -> None:
        """Move a new fix as the fixes about it were moved (over the ground), its course
        and speed changed as the move changes them; or change its course and speed as
        theirs were (by dead reckoning)."""
        if not self.any():
            return
        if self.dr:
            if not self.times:
                return
            if fix.course is not None and self.turns:
                fix.course = (fix.course + self._at(self.turns, fix.ms)) % 360.0
            if fix.speed is not None and self.ratios:
                fix.speed = fix.speed * self._at(self.ratios, fix.ms)
            # Only a new first fix keeps its position: dead reckoning places the rest. It
            # starts where the track's start was moved to, as the first fix was.
            fix.position = _offset_by(fix.position, self.east[0], self.north[0])
            return
        raw = list(fix.position)
        if fix.ms in self.single:
            # A fix dragged on its own: the new fix at its time goes where it was dragged.
            # Its course and speed stay as recorded, as a dragged fix's do.
            fix.position = _offset_by(raw, *self.single[fix.ms])
            return
        east, north = self._offsets_at(fix.ms)
        fix.position = _offset_by(raw, east, north)
        if fix.course is None and fix.speed is None:
            return
        # The velocity carried through the same change, as tracks._carried carries a
        # shear's or a stretch's: where the recorded velocity reaches a moment later,
        # moved as a fix then would be; the new course and speed are from the moved fix
        # to it. A move leaves them as they were; a rotation turns the course; a shear
        # or a stretch changes both, exactly on a straight, steady leg.
        u = self.units
        later = fix.ms + int(tracks.VELOCITY_STEP_S * 1000)
        east_later, north_later = self._offsets_at(later)
        if math.hypot(east_later - east, north_later - north) < 1e-6:
            return  # moved, not turned or stretched here: the velocity is as recorded
        course = Quantity(fix.course if fix.course is not None else 0.0, u.course).to("deg").value
        metres_per_s = (
            Quantity(fix.speed, u.speed).to("m/s").value if fix.speed is not None else 0.0
        )
        if metres_per_s <= 0 and fix.course is None:
            return
        reach = max(metres_per_s, 1.0) * tracks.VELOCITY_STEP_S
        ahead = destination(Position(raw[0], raw[1]), Quantity(course, "deg"), Quantity(reach, "m"))
        moved_ahead = _offset_by([ahead.longitude, ahead.latitude], east_later, north_later)
        distance, bearing = range_bearing(
            Position(fix.position[0], fix.position[1]),
            Position(moved_ahead[0], moved_ahead[1]),
        )
        if fix.course is not None and distance.value > 0:
            fix.course = Quantity(bearing.value % 360.0, "deg").to(u.course).value
        if fix.speed is not None and metres_per_s > 0:
            fix.speed = Quantity(distance.value / tracks.VELOCITY_STEP_S, "m/s").to(u.speed).value


def edits_of(
    current: list[Fix],
    reference: Reference,
    dr: bool,
    units: Units,
    single: Iterable[int] = (),
) -> Edits:
    """The offsets of a track's fixes from where their sources, at the revision each was
    read at, put them. reference gives a source's fixes by time; fixes whose source
    cannot be read are left out. single are the times of fixes dragged on their own:
    their offsets are kept for their own time, not spread to new fixes about them."""
    edits = Edits(dr=dr, units=units)
    alone = set(single)
    for fix in current:
        found = reference(fix.source, fix.revision, units).get(fix.ms)
        if found is None:
            continue
        if not dr and fix.ms in alone:
            east, north = _offset(found.position, fix.position)
            if math.hypot(east, north) >= EDITED_M:
                edits.single[fix.ms] = (east, north)
                edits.largest_m = max(edits.largest_m, math.hypot(east, north))
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
            return Edits(dr=True, units=units)
        return edits
    if edits.largest_m < EDITED_M:
        return Edits(units=units)
    return edits


def single_moves(plot: DebriefFeatureCollection, track_id: str) -> set[int]:
    """The times of a track's fixes dragged on their own, from the records of the steps
    the plot holds now: a fix moved by distance and bearing or to a position."""
    out: set[int] = set()
    for record in plot.provenance or []:
        if track_id not in (record.selected or []):
            continue
        names = {p.name: p.value for p in record.parameters or []}
        if "fix_time" in names and ("longitude" in names or "distance" in names):
            value = names["fix_time"]
            if isinstance(value, str):
                out.add(ms_of(value))
    return out


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
        fixes = fixes_of(self.track, self.key, units)
        for fix in fixes:
            fix.revision = self.revision
        return fixes


def _runs(fixes: list[Fix]) -> list[tuple[Key, str | None, Fix, Fix]]:
    """The track's fixes in runs from one source at one revision: fixes of one item read
    at two revisions are two runs, each naming its revision (CAP-12)."""
    runs: list[tuple[Key, str | None, Fix, Fix]] = []
    for fix in fixes:
        if runs and runs[-1][0] == fix.source and runs[-1][1] == fix.revision:
            runs[-1] = (fix.source, fix.revision, runs[-1][2], fix)
        else:
            runs.append((fix.source, fix.revision, fix, fix))
    return runs


def rebuilt(
    track: models.TrackFeature,
    fixes: list[Fix],
    plot: Plot,
    titles: dict[Key, str],
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
    if all(plot.is_own(key) and key[2] == track.id for key, _, _, _ in runs):
        update["supplies"] = None
    else:
        update["supplies"] = [
            models.TrackSupply(
                catalogue=key[0],
                item=key[1],
                track=key[2],
                title=titles.get(key, plot.title),
                revision=None if plot.is_own(key) else revision,
                start=first.time,
                end=last.time,
            )
            for key, revision, first, last in runs
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
    """What taking an item's data did, for the step's record and the analyst. changes
    is empty when the plot already has the item's data as it is now (taken before, or
    a revision that changed nothing the plot took): nothing to record."""

    changes: Changes
    note: str
    notes: list[str]
    matched: dict[str, int]  # the plot's track names, and fixes each gained or changed
    added: list[str]

    @property
    def unchanged(self) -> bool:
        return not self.changes.touched()


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
    supplied_before = False
    # Tracks whose data from the item is unchanged, only the revision it names newer:
    # relabelled when the step changes something else, never a step on their own.
    relabels: dict[str, models.TrackFeature] = {}
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
        target = modified.get(candidates[0].id, relabels.get(candidates[0].id, candidates[0]))
        supplied_before = supplied_before or any(
            _key(s) == key for s in target.properties.supplies or []
        )
        result = _take_into(
            target,
            theirs_track,
            key,
            me,
            title,
            revision,
            reference,
            notes,
            single_moves(plot, target.id),
        )
        if result is None:
            continue
        built, changed, relabelled = result
        if relabelled:
            relabels[target.id] = built
            continue
        modified[target.id] = built
        matched[target.properties.name] = matched.get(target.properties.name, 0) + changed
    note = f"New data from {title}"
    if not modified and not added:
        if supplied_before:
            # Taken before, and nothing has changed in what the plot took: no step, so
            # no new revision of the plot and no products flagged for nothing.
            return Taken(Changes(), note, [], {}, [])
        raise CollationError(
            f"{title} has nothing the plot hasn't: every fix it has is in a period another "
            "item supplies, or it has no tracks. Choose its periods in Coverage, or set it "
            "aside with Not now."
        )
    for track_id, built in relabels.items():
        modified.setdefault(track_id, built)
    parts = [f"{name} {_fixes(n)}" for name, n in matched.items()]
    parts += [f"{t.properties.name} added" for t in added]
    # Named shortly, as the History view names a step; what it did, in the next note.
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


def _fix_data(fix: Fix) -> tuple:
    """What a fix says, to tell a fix changed from one taken again as it was."""
    return (
        fix.ms,
        tuple(round(v, 9) for v in fix.position),
        None if fix.course is None else round(fix.course, 9),
        None if fix.speed is None else round(fix.speed, 9),
        None if fix.depth is None else round(fix.depth, 9),
    )


def changed_fixes(before: list[Fix], after: list[Fix]) -> int:
    """How many fixes after has that before had not, as they are: added or changed."""
    was = {_fix_data(f) for f in before}
    return sum(1 for f in after if _fix_data(f) not in was)


def _take_into(
    track: models.TrackFeature,
    theirs: models.TrackFeature,
    key: Key,
    me: Plot,
    title: str,
    revision: str | None,
    reference: Reference,
    notes: list[str],
    single: set[int],
) -> tuple[models.TrackFeature, int, bool] | None:
    """The track with the item's track taken into it, how many of its fixes were added
    or changed, and whether only the revision its periods name changed (the item's data
    as the plot has it already); None if nothing is taken."""
    name = track.properties.name
    units = units_of(track)
    dr = tracks.plotting_mode(track) == "dr"
    current = current_fixes(track, me, units)
    their_fixes = fixes_of(theirs, key, units)
    for fix in their_fixes:
        fix.revision = revision
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
    edits = edits_of(current, reference, dr, units, single)
    for fix in fresh:
        _as_logged(fix)
        edits.place(fix)
    kept = [f for f in current if not inside(f.ms, refreshed)]
    fixes = merged(kept, fresh)
    titles = _titles(track, me)
    titles[key] = title
    scratch: list[str] = []
    built = rebuilt(track, fixes, me, titles, scratch)
    links = list(track.properties.platform_links or [])
    newly_linked = not linked(track, key)
    if newly_linked:
        links.append(
            models.SourceTrackRef(
                catalogue=key[0], item=key[1], track=key[2], name=theirs.properties.name
            )
        )
    built = built.model_copy(
        update={"properties": built.properties.model_copy(update={"platform_links": links})}
    )
    changed = changed_fixes(fixes_of(track, key, units), fixes_of(built, key, units))
    if not changed and not newly_linked and _same_but_revisions(track, built):
        # The item's data as the plot has it already: a revision that changed nothing
        # taken (its details, another track), or the same revision taken again. Only the
        # revision its periods name would change: worth no step of its own.
        return built, 0, True
    notes.extend(scratch)
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
    if newly_linked and platform_key(theirs.properties.name) == platform_key(name):
        notes.append(f"{theirs.properties.name} in {title} confirmed as {name}")
    return built, changed, False


def _same_but_revisions(a: models.TrackFeature, b: models.TrackFeature) -> bool:
    """Whether two versions of a track differ at most in the revisions their supplies
    name: the data is the same."""

    def plain(track: models.TrackFeature) -> object:
        data = track.model_dump(mode="json", exclude_none=True)
        for s in data.get("properties", {}).get("supplies") or []:
            s.pop("revision", None)
        return _rounded(data)

    return plain(a) == plain(b)


def _rounded(value: object) -> object:
    """Numbers to nine places, so the same data worked out again compares equal."""
    if isinstance(value, float):
        return round(value, 9)
    if isinstance(value, list):
        return [_rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: _rounded(v) for k, v in value.items()}
    return value


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


def _titles(track: models.TrackFeature, me: Plot) -> dict[Key, str]:
    titles = {me.own(track.id): me.title}
    for s in track.properties.supplies or []:
        titles[_key(s)] = s.title
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
    current = current_fixes(track, me, units)
    inside = [f for f in current if start <= f.ms <= end]
    theirs = [f for f in source.fixes(units) if start <= f.ms <= end]
    own = me.is_own(source.key)
    revision = None if own else source.revision
    if not theirs:
        raise CollationError(
            f"{source.title} has no data for {name} {describe_span(start, end)}, so nothing "
            "was changed."
        )
    if (
        inside
        and all(f.source == source.key and f.revision == revision for f in inside)
        and len(inside) >= len(theirs)
    ):
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
    edits = edits_of(current, reference, dr, units, single_moves(plot, track_id))
    for fix in theirs:
        fix.revision = revision
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
    titles[source.key] = source.title
    notes: list[str] = []
    was_titles = [titles.get(k, k[1]) for k in was]
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


def clipped(spans_: Iterable[Span], within: Span | None) -> list[Span]:
    """Spans cut to a period: what lies outside it left out."""
    if within is None:
        return list(spans_)
    lo, hi = within
    return [(max(a, lo), min(b, hi)) for a, b in spans_ if a <= hi and b >= lo]


# Whether an item that shares this plot's first step (a copy of it, forked where their
# histories part) has steps since that add data: asked only of such items.
AddsData = Callable[["ItemInfo"], bool]


def coverage(
    catalogues: Catalogues,
    home: Catalogue,
    item_id: str,
    plot: DebriefFeatureCollection,
    view: models.PlotView | None,
    first_recorded: Callable[[str], models.TrackFeature | None],
    adds_data: AddsData | None = None,
) -> models.CoverageReport:
    """The plot's coverage (CAP-08, CAP-09): for each of its tracks, its own data and
    the data of tracks in other items linked or proposed as its platform, with the
    periods each covers within the plot's own period and which supplies each; the items
    in the folder tree it draws from, marked as new data where they are (CAP-10) or as
    revised since taken (CAP-12)."""
    mine = catalogues.info(home.id, item_id) or item_info(home, item_id)
    plot_details = next((f for f in plot.features if f.properties.kind == "plot"), None)
    title = (plot_details.properties.title if plot_details else None) or mine.title
    me = Plot(home.id, item_id, title)
    supplied = drawn_from(plot)  # what the tracks take from other items now, by revision
    ever = taken_from(plot)  # every item a step took data from
    plot_tracks = [f for f in plot.features if f.properties.kind == "track"]
    tree = folder_tree(
        catalogues,
        home,
        sorted({r.catalogue for r in ever} | {r.catalogue for r in supplied}),
    )
    others = [
        info for catalogue in tree for info in catalogues.items(catalogue) if info.key != mine.key
    ]
    by_key = {info.key: info for info in others}
    drawn_keys = {(r.catalogue, r.item) for r in ever} | {(r.catalogue, r.item) for r in supplied}
    said = (view.collation if view is not None else None) or models.CollationView()
    reviewed = {(r.catalogue, r.item, r.revision) for r in said.reviewed or []}
    dismissed = {(r.catalogue, r.item, r.revision) for r in said.dismissed or []}

    # The plot's own period: the computation is clipped to it (decision, product owner,
    # 16 Oct 2026), so items far outside it cost nothing and offer no choice.
    plot_spans = [s for t in plot_tracks for s in spans([ms_of(x) for x in t.properties.times])]
    p_start = min((a for a, _ in plot_spans), default=None)
    p_end = max((b for _, b in plot_spans), default=None)
    window = (p_start, p_end) if p_start is not None and p_end is not None else None

    platforms: list[models.CoveragePlatform] = []
    lo: int | None = None
    hi: int | None = None
    for track in plot_tracks:
        props = track.properties
        sources: list[models.CoverageSource] = []
        source_spans: list[list[Span]] = []  # each source's spans, in milliseconds
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
            source_spans.append(own_spans)
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
            from_it = [s for s in supplies if _key(s) == key]
            revised = bool(
                info
                and info.revision
                and any(s.revision and s.revision != info.revision for s in from_it)
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
                    # The item's title as it is now, where it can be found.
                    title=info.title if info else fallback or key[1],
                    link=link,
                    fixes=cov.fixes if cov else 0,
                    spans=list(cov.spans) if cov else [],
                    revised=revised or None,
                )
            )
            source_spans.append(info.spans_ms(cov) if info and cov else [])
            keys.append(key)
        supply_spans = sorted((ms_of(s.start), ms_of(s.end), _key(s)) for s in supplies)
        rows, first, last = _period_rows(
            [clipped(spans_, window) for spans_ in source_spans],
            supply_spans,
            keys,
            [ms_of(t) for t in props.times],
        )
        if first is not None:
            lo = first if lo is None else min(lo, first)
            hi = last if hi is None else max(hi, last)
        colour = props.style.colour if props.style else None
        platforms.append(
            models.CoveragePlatform(
                track=track.id, name=props.name, colour=colour, sources=sources, periods=rows
            )
        )

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
        role = "drawn_from" if info.key in drawn_keys else "other"
        revised = info.revision is not None and any(
            (r.catalogue, r.item) == info.key and r.revision != info.revision for r in supplied
        )
        mark = None
        if (
            role == "other"
            and info.revision is not None
            and mine.created is not None
            and info.created is not None
            and info.created > mine.created
            and (*info.key, info.revision) not in dismissed
        ):
            mark = _new_data(info, mine, plot_tracks, me, window, adds_data)
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
    review = _review(me, supplied, catalogues, reviewed)
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


# A platform's period rows, by everything they are worked out from: asked again at each
# change to the plot, a platform whose sources have not changed is not cut again (NFR-01).
_ROWS: OrderedDict[tuple, tuple[list[models.CoveragePeriod], int | None, int | None]] = (
    OrderedDict()
)
_ROWS_KEPT = 64


def _period_rows(
    source_spans: list[list[Span]],
    supply_spans: list[tuple[int, int, Key]],
    keys: list[Key],
    times: list[int],
) -> tuple[list[models.CoveragePeriod], int | None, int | None]:
    """A platform's periods, each with its sources and the one supplying it, and the
    first and last time of them. Between two fixes of the stitched track where one source
    hands over to the next (seconds, usually), no period is offered: the track has no gap
    there, and taking another source for it would replace no fix."""
    signature = (
        tuple(tuple(s) for s in source_spans),
        tuple(supply_spans),
        tuple(keys),
        hash(tuple(times)),
        len(times),
    )
    found = _ROWS.get(signature)
    if found is not None:
        _ROWS.move_to_end(signature)
        return found
    supply_starts = [s[0] for s in supply_spans]
    track_spans = spans(times)
    span_starts = [a for a, _ in track_spans]
    rows: list[models.CoveragePeriod] = []
    lo: int | None = None
    hi: int | None = None
    for p in periods(source_spans):
        chosen = _supplier((p.start + p.end) // 2, supply_starts, supply_spans, keys)
        if chosen is None:
            # A period between two supplied ones: whichever supplies its fixes.
            chosen = _supplier(p.start, supply_starts, supply_spans, keys)
        if chosen is not None and chosen not in p.sources:
            chosen = None
        if (
            chosen is None
            and _within(p.start, p.end, span_starts, track_spans)
            and bisect.bisect_right(times, p.start) == bisect.bisect_left(times, p.end)
        ):
            continue
        # Built as checked already: a study's thousands of periods, each valid by
        # construction, are not validated again one by one (NFR-01).
        rows.append(
            models.CoveragePeriod.model_construct(
                start=_utc(p.start), end=_utc(p.end), sources=list(p.sources), chosen=chosen
            )
        )
        lo = p.start if lo is None else min(lo, p.start)
        hi = p.end if hi is None else max(hi, p.end)
    _ROWS[signature] = (rows, lo, hi)
    while len(_ROWS) > _ROWS_KEPT:
        _ROWS.popitem(last=False)
    return rows, lo, hi


def _within(start: int, end: int, starts: list[int], spans_: list[Span]) -> bool:
    """Whether one of the spans (in time order, apart) holds the whole of start to end."""
    i = bisect.bisect_right(starts, start) - 1
    return i >= 0 and spans_[i][0] <= start and end <= spans_[i][1]


# Times written as the schema writes them, by epoch milliseconds: a study's periods share
# their bounds, and are asked for again at every change (NFR-01).
_UTC: dict[int, str] = {}
_UTC_KEPT = 65_536


def _utc(ms: int) -> str:
    found = _UTC.get(ms)
    if found is None:
        if len(_UTC) >= _UTC_KEPT:
            _UTC.clear()
        found = _UTC[ms] = format_utc(ms)
    return found


def _supplier(
    ms: int, starts: list[int], supplied: list[tuple[int, int, Key]], keys: list[Key]
) -> int | None:
    """Which of the sources, by place, supplies the track at a time; None for none."""
    i = bisect.bisect_right(starts, ms) - 1
    if i >= 0 and supplied[i][0] <= ms <= supplied[i][1]:
        k = supplied[i][2]
        return keys.index(k) if k in keys else None
    return None


def _new_data(
    info: ItemInfo,
    mine: ItemInfo,
    plot_tracks: list[models.TrackFeature],
    me: Plot,
    window: Span | None,
    adds_data: AddsData | None,
) -> models.NewDataMark | None:
    """Whether an item that came in after the plot is new data for it (CAP-10; decision,
    product owner, 16 Oct 2026): it shares a platform with the plot and has data within
    its period; it is not derived from the plot; and either it came in by importing
    files and is no product of other items, or it is a copy of the plot with steps
    since they parted that add data."""
    if any((r.catalogue, r.item) == (me.catalogue, me.item) for r in info.drawn_from):
        return None  # made from this plot's data
    fork = info.origin is not None and info.origin == mine.origin
    if fork:
        if adds_data is None or not adds_data(info):
            return None  # a copy of this plot with nothing added since they parted
    elif not info.imported or info.drawn_from:
        return None  # made by hand, or a product of other items: never new data
    names: list[str] = []
    for cov in info.coverage:
        key = (*info.key, cov.track)
        for track in plot_tracks:
            if matches(track, key, cov.name) in ("linked", "proposed"):
                if track.properties.name not in names:
                    names.append(track.properties.name)
    within = window is not None and any(
        a <= window[1] and b >= window[0] for cov in info.coverage for a, b in _spans_of(cov)
    )
    if not names or not within:
        return None
    said = ", ".join(names[:4]) + (f" and {len(names) - 4} more" if len(names) > 4 else "")
    if fork:
        note = f"Data added to a copy of {me.title} since it was made: {said}, within its period"
    else:
        note = f"New data for {me.title}: {said}, within its period"
    return models.NewDataMark(
        revision=info.revision, platforms=names, within_period=True, note=note
    )


def _review(
    me: Plot,
    refs: list[models.ItemRef],
    catalogues: Catalogues,
    reviewed: set[tuple[str, str, str]],
) -> models.ReviewFlag | None:
    """The plot's review flag: the items its tracks take data from at a revision other
    than the item's now, unless reviewed against that revision."""
    revised: dict[tuple[str, str], models.ItemRef] = {}
    for ref in refs:
        info = catalogues.info(ref.catalogue, ref.item)
        if info is None or info.revision is None or info.revision == ref.revision:
            continue
        if (ref.catalogue, ref.item, info.revision) in reviewed:
            continue
        revised.setdefault(
            (ref.catalogue, ref.item),
            models.ItemRef(
                catalogue=ref.catalogue, item=ref.item, title=info.title, revision=info.revision
            ),
        )
    if not revised:
        return None
    found = list(revised.values())
    names = ", ".join(r.title or r.item for r in found)
    verb = "was" if len(found) == 1 else "were"
    return models.ReviewFlag(
        catalogue=me.catalogue,
        item=me.item,
        title=me.title,
        revised=found,
        note=f"May need review: {names} {verb} revised since {me.title} took data from "
        f"{'it' if len(found) == 1 else 'them'}",
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
