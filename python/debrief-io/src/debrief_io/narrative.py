"""A narrative read into a plot already open (CAP-19, CAP-20, SUB-10, SUB-18).

Each platform keeps its own log; combining them on one Zulu time axis means reading
each into the same plot. A REP file's ;NARRATIVE: and ;NARRATIVE2: lines are read
(rep.parse_narrative, ported from legacy Debrief), and so are Word (.docx, .doc) and
PDF documents in legacy Debrief's dialects (word.py). The file is kept in the plot's
item as a source, read-only and hashed, and its entries are added as one recorded,
undoable step whose record names the importer, its version, that source and, for a
document, its dialect and the choices made, and lists what was not read, with why.
Each entry belongs to the plot's track of its source's name, if any; for a document,
also after a prefix such as HMS, or the track the analyst said.

Legacy Debrief asked, before reading a document, which types of entry to read (with
how many of each), whether only entries within the plot's period, and which track an
unknown platform is. Here the host asks (preview_narrative says what there is to ask
about) and passes the answers; an agent passes them, or reads everything.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from typing import Any

from debrief_io.documents import Document, DocumentError, file_bytes, read_document, sniff
from debrief_io.importer import Clock, _rep_text, wall_clock
from debrief_io.rep import parse_rep
from debrief_io.word import ASW, SKIP_NAMES, DocEntry, DocumentRead, read_dialect
from debrief_kernel.formatting import format_time
from debrief_kernel.time import format_utc, parse_utc
from debrief_schemas import DebriefFeatureCollection, models
from debrief_stac import Base, Catalogue, CatalogueError, Conflict
from debrief_stac import narrative as plot_narrative

IMPORTER = "debrief-io.narrative"
MEDIA_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "pdf": "application/pdf",
}


class NoNarrativeError(ValueError):
    """A file in which no narrative entry could be read: nothing would be added."""


@dataclass
class NarrativeImport:
    step: int
    entries: int
    sources: list[str] = field(default_factory=list)
    # Everything not read, in words an analyst can act on.
    omitted: list[str] = field(default_factory=list)
    # What the analyst should know that is not an omission: corrections, the dialect.
    notes: list[str] = field(default_factory=list)


@dataclass
class Candidate:
    """An entry as read, before the analyst's choices."""

    time_ms: int
    source: str | None
    entry_type: str | None
    text: str
    truncated: bool = False
    fcs: bool = False  # an FCS entry giving a bearing and range: a TMA solution, later
    bearing: bool = False  # a Rider entry's bearing: a sensor cut, later


@dataclass
class NarrativeFile:
    """A file's narrative, read, with what was not read and what was corrected."""

    name: str
    format: str  # "rep", "docx", "doc" or "pdf"
    dialect: str | None  # a document's dialect; None for REP
    dialect_title: str
    entries: list[Candidate]
    omitted: list[str]
    notes: list[str]
    fixes: int = 0  # ASW data: positions, which are a track, not narrative

    @property
    def described(self) -> str:
        if self.format == "rep":
            return "REP file"
        kind = Document(self.format).described
        return f"{kind}, read as a {self.dialect_title}"


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n:,} {one if n == 1 else (many or one + 's')}"


def read_narrative_file(path: Path, *, clock: Clock = wall_clock) -> NarrativeFile:
    """A REP file's narrative lines, or a document's entries in its dialect."""
    path = Path(path)
    try:
        data = file_bytes(path)
    except DocumentError as error:
        raise NoNarrativeError(f"{path.name} could not be read: {error}") from None
    kind = sniff(data)
    if kind is None:
        return _rep_file(path.name, data)
    try:
        doc = read_document(path.name, data)
    except DocumentError as error:
        raise NoNarrativeError(f"{path.name} could not be read: {error}") from None
    year = datetime.fromtimestamp(clock() / 1000, UTC).year
    read = read_dialect(doc, track=path.stem, default_year=year)
    return _document_file(path.name, doc.format, read)


def _rep_file(name: str, data: bytes) -> NarrativeFile:
    parsed = parse_rep(_rep_text(data))
    omitted = []
    if parsed.fixes:
        omitted.append(
            f"{len(parsed.fixes)} fix lines not read: import the file as a plot for its tracks."
        )
    for record, count in sorted(parsed.other_records.items()):
        omitted.append(f"{count} {record} line{'s' if count != 1 else ''} not read.")
    for number, problem in parsed.errors:
        omitted.append(f"Line {number} could not be read: {problem}.")
    truncated = sum(n.time_truncated for n in parsed.narrative)
    if truncated:
        omitted.append(
            f"{truncated} narrative times had more than millisecond precision "
            "and were truncated to milliseconds."
        )
    entries = [
        Candidate(n.time_ms, n.source, n.entry_type, n.text, n.time_truncated)
        for n in parsed.narrative
    ]
    if not entries:
        problems = [f"line {n}: {p}" for n, p in parsed.errors[:3]]
        why = f" ({'; '.join(problems)})" if problems else ""
        raise NoNarrativeError(f"No narrative entry could be read from {name}{why}.")
    return NarrativeFile(name, "rep", None, "REP narrative", entries, omitted, [])


def _document_file(name: str, fmt: str, read: DocumentRead) -> NarrativeFile:
    omitted = list(read.problems)
    notes = list(read.warnings)
    if read.dialect == ASW:
        return NarrativeFile(
            name, fmt, read.dialect, read.dialect_title, [], omitted, notes, len(read.fixes)
        )
    if read.preamble:
        omitted.insert(
            0,
            f"{_plural(read.preamble, 'line')} before the first entry (a title, a preamble) "
            f"{'was' if read.preamble == 1 else 'were'} not read.",
        )
    if read.overflow:
        omitted.append(
            f"{_plural(read.overflow, 'line')} of text after an entry's sixth line of "
            f"continuation {'was' if read.overflow == 1 else 'were'} not read, as legacy Debrief "
            "read them."
        )
    if read.stopped_at:
        omitted.append(f"Reading stopped at {read.stopped_at[:60]!r}: what follows was not read.")
    fcs = sum(1 for e in read.entries if e.fcs is not None and e.fcs.complete)
    if fcs:
        notes.append(
            f"{_plural(fcs, 'FCS entry', 'FCS entries')} give a fire-control solution (bearing "
            "and range): kept as narrative; TMA solution positions come with TMA solutions in "
            "the data model."
        )
    cuts = sum(1 for e in read.entries if e.bearing is not None)
    if cuts:
        notes.append(
            f"{_plural(cuts, 'entry', 'entries')} give a bearing: kept in the entry's text; "
            "legacy Debrief also made them sensor cuts, which come with sensor data."
        )
    entries = [_candidate(e) for e in read.entries]
    if not entries:
        why = f" ({'; '.join(read.problems[:3])})" if read.problems else ""
        raise NoNarrativeError(
            f"No narrative entry could be read from {name}, read as a {read.dialect_title}{why}."
        )
    return NarrativeFile(name, fmt, read.dialect, read.dialect_title, entries, omitted, notes)


def _candidate(entry: DocEntry) -> Candidate:
    return Candidate(
        entry.time_ms,
        entry.source,
        entry.entry_type,
        entry.text,
        fcs=entry.fcs is not None and entry.fcs.complete,
        bearing=entry.bearing is not None,
    )


# --- Which track, which platform -----------------------------------------------------


def track_for_platform(platform: str, tracks: dict[str, str]) -> str | None:
    """The track a platform's entries belong to: of its name, ignoring case and spacing,
    or of its name after a prefix legacy Debrief skipped (HMS NELSON is NELSON's)."""
    found = plot_narrative.track_for(platform, tracks)
    if found is not None:
        return found
    for skip in SKIP_NAMES:
        if platform.strip().startswith(skip):
            found = plot_narrative.track_for(platform.strip()[len(skip) :].strip(), tracks)
            if found is not None:
                return found
    return None


def tracks_period(plot: DebriefFeatureCollection) -> tuple[int, int] | None:
    """The plot's tracks' period, first fix to last: legacy Debrief's "outer period"."""
    times = [
        t
        for f in plot.features
        if f.properties.kind == "track"
        for t in (parse_utc(f.properties.times[0]), parse_utc(f.properties.times[-1]))
    ]
    return (min(times), max(times)) if times else None


def _period_words(start: int, end: int) -> str:
    """A period as the analyst's settings write it: "15 Jun 2023 17:00:00Z to 23:00:00Z"."""
    first = format_time(start, plot_narrative.DATED)
    same_day = start // 86_400_000 == end // 86_400_000
    return f"{first} to {format_time(end) if same_day else format_time(end, plot_narrative.DATED)}"


def default_platform(narrative: NarrativeFile, tracks: dict[str, str]) -> str:
    """The source of entries whose document names no platform: the plot's one track,
    as legacy Debrief took it, or else the document."""
    if len(tracks) == 1:
        return next(iter(tracks))
    return Path(narrative.name).stem


def preview(
    narrative: NarrativeFile, plot: DebriefFeatureCollection | None = None
) -> dict[str, Any]:
    """What a file holds, for the host to ask about before reading it into the plot:
    its dialect, its types with counts, its sources with the track each would belong
    to, its period and how many entries fall outside the plot's tracks' period."""
    tracks = plot_narrative.track_names(plot) if plot is not None else {}
    unnamed = sum(1 for e in narrative.entries if not e.source)
    platform = default_platform(narrative, tracks)
    sources = Counter(e.source or platform for e in narrative.entries)
    types = Counter(e.entry_type or "" for e in narrative.entries)
    times = [e.time_ms for e in narrative.entries]
    period = tracks_period(plot) if plot is not None else None
    outside = sum(1 for t in times if not period[0] <= t <= period[1]) if period is not None else 0
    return {
        "name": narrative.name,
        "format": narrative.format,
        "dialect": narrative.dialect,
        "described": narrative.described,
        "entries": len(narrative.entries),
        "fixes": narrative.fixes,
        "types": [{"name": n, "count": c} for n, c in _ranked(types)],
        "sources": [
            {"name": n, "count": c, "track_id": track_for_platform(n, tracks)}
            for n, c in _ranked(sources)
        ],
        "unnamed": unnamed,
        "platform": platform if unnamed else None,
        "start": format_utc(min(times)) if times else None,
        "end": format_utc(max(times)) if times else None,
        "plot_start": format_utc(period[0]) if period else None,
        "plot_end": format_utc(period[1]) if period else None,
        "outside": outside,
        "omitted": narrative.omitted,
        "notes": narrative.notes,
    }


def _ranked(counter: Counter[str]) -> list[tuple[str, int]]:
    return sorted(counter.items(), key=lambda item: (-item[1], item[0].casefold(), item[0]))


def preview_narrative(path: Path, plot: DebriefFeatureCollection | None = None) -> dict[str, Any]:
    """preview of a file, read: see preview."""
    return preview(read_narrative_file(Path(path)), plot)


# --- Reading it in -------------------------------------------------------------------


@dataclass
class Choices:
    """What the analyst chose, as legacy Debrief asked: which types (None: all; ""
    names entries with no type), only the entries within the plot's tracks' period,
    the track each platform belongs to (None: none), and the source of entries whose
    document names no platform."""

    types: list[str] | None = None
    within_period: bool = False
    tracks: dict[str, str | None] = field(default_factory=dict)
    platform: str | None = None

    @classmethod
    def of(cls, value: dict[str, Any] | None) -> Choices:
        value = value or {}
        types, tracks, platform = value.get("types"), value.get("tracks"), value.get("platform")
        if types is not None and (
            not isinstance(types, list) or not all(isinstance(t, str) for t in types)
        ):
            raise ValueError("types is a list of the entry types to read")
        if tracks is not None and (
            not isinstance(tracks, dict)
            or not all(
                isinstance(k, str) and (v is None or isinstance(v, str)) for k, v in tracks.items()
            )
        ):
            raise ValueError("tracks gives, for a platform, the id of its track, or null")
        if platform is not None and (not isinstance(platform, str) or not platform.strip()):
            raise ValueError("platform is the name of the platform whose log it is")
        within = value.get("within_period", False)
        if not isinstance(within, bool):
            raise ValueError("within_period is true or false")
        return cls(types, within, dict(tracks or {}), platform.strip() if platform else None)


def chosen_features(
    narrative: NarrativeFile, plot: DebriefFeatureCollection, choices: Choices
) -> tuple[list[models.NarrativeFeature], list[str], list[str]]:
    """The entries to add, as features, with what the choices left out and the notes."""
    tracks = plot_narrative.track_names(plot)
    platform = choices.platform or default_platform(narrative, tracks)
    omitted: list[str] = []
    notes: list[str] = []
    entries = list(narrative.entries)
    if choices.types is not None:
        wanted = set(choices.types)
        left = Counter(e.entry_type or "" for e in entries if (e.entry_type or "") not in wanted)
        entries = [e for e in entries if (e.entry_type or "") in wanted]
        if left:
            named = ", ".join(f"{n or 'no type'} ({c})" for n, c in _ranked(left))
            count = _plural(left.total(), "entry", "entries")
            omitted.append(f"{count} of types not chosen not read: {named}.")
    period = tracks_period(plot)
    if choices.within_period and period is not None:
        before = len(entries)
        entries = [e for e in entries if period[0] <= e.time_ms <= period[1]]
        if len(entries) < before:
            omitted.append(
                f"{_plural(before - len(entries), 'entry', 'entries')} outside the plot's period "
                f"({_period_words(*period)}) not read, as chosen."
            )
    unnamed = sum(1 for e in entries if not e.source)
    if unnamed:
        notes.append(
            f"{_plural(unnamed, 'entry', 'entries')} name no platform: their source is {platform}."
        )
    ids = plot_narrative.new_ids({f.id for f in plot.features}, len(entries))
    known = {f.id for f in plot.features if f.properties.kind == "track"}
    features = []
    for feature_id, entry in zip(ids, entries, strict=True):
        source = entry.source or platform
        if source in choices.tracks:
            track = choices.tracks[source]
            track = track if track in known else None
        else:
            track = track_for_platform(source, tracks)
        features.append(
            models.NarrativeFeature(
                type="Feature",
                id=feature_id,
                geometry=None,
                properties=models.NarrativeProperties(
                    kind="narrative",
                    time=format_utc(entry.time_ms),
                    source=source,
                    entry_type=entry.entry_type,
                    text=entry.text,
                    track_id=track,
                ),
            )
        )
    return features, omitted, notes


def entries_note(features: list[models.NarrativeFeature]) -> str:
    """How many entries, from whom."""
    sources = list(dict.fromkeys(f.properties.source for f in features))
    named = ", ".join(sources[:5]) + (f" and {len(sources) - 5} more" if len(sources) > 5 else "")
    entries = "entry" if len(features) == 1 else "entries"
    return f"{len(features)} narrative {entries} read, from {named}."


def _parameters(narrative: NarrativeFile, choices: Choices) -> list[models.ParameterValue] | None:
    if narrative.dialect is None and choices == Choices():
        return None
    values: list[tuple[str, Any]] = [("format", narrative.format)]
    if narrative.dialect is not None:
        values.append(("dialect", narrative.dialect))
    if choices.types is not None:
        values.append(("types", "; ".join(t or "(no type)" for t in choices.types)))
    values.append(("within_period", choices.within_period))
    if choices.platform:
        values.append(("platform", choices.platform))
    for source, track in sorted(choices.tracks.items()):
        values.append(
            (
                "track_" + "".join(c if c.isalnum() else "_" for c in source.lower())[:40],
                track or "none",
            )
        )
    return [models.ParameterValue(name=n, value=v) for n, v in values]


def import_narrative(
    catalogue: Catalogue,
    item_id: str,
    path: Path,
    agent: models.AgentRef,
    base: Base | None = None,
    *,
    clock: Clock = wall_clock,
    allow_newer_schema: bool = False,
    choices: Choices | None = None,
) -> NarrativeImport:
    """Read a file's narrative into the plot item_id as one step. base is the plot the
    analyst was looking at: changed since, Conflict is raised and nothing is added."""
    path = Path(path)
    choices = choices or Choices()
    started = format_utc(clock())
    narrative = read_narrative_file(path, clock=clock)
    if narrative.dialect == ASW:
        raise NoNarrativeError(
            f"{path.name} is ASW data: {_plural(narrative.fixes, 'position')} of a track, not "
            "narrative. Import it as a plot for its track."
        )
    history = catalogue.history(item_id)
    if base is not None and base != history.base():
        # Said before the source is kept, so a stale base changes nothing at all.
        raise Conflict(
            "The plot was changed elsewhere since you opened it, so nothing was read in. "
            "Open it again and read the file in again.",
            mergeable=False,
        )
    plot = history.plot()
    features, left, notes = chosen_features(narrative, plot, choices)
    if not features:
        raise NoNarrativeError(f"Nothing would be read from {path.name}: {' '.join(left)}")
    omitted = narrative.omitted + left
    notes = narrative.notes + notes
    key = f"source-{path.name}"
    if key in catalogue.assets(item_id):
        raise CatalogueError(
            f"This plot already has a source named {path.name}. Rename the file to read it in."
        )
    source = catalogue.add_source(
        item_id, path, media_type=MEDIA_TYPES.get(narrative.format, "text/plain")
    )
    record = models.ProvRecord(
        id=f"import-narrative-{started}",
        kind="import",
        started_at=started,
        ended_at=format_utc(clock()),
        tool=models.ToolRef(name=IMPORTER, version=version("debrief-io")),
        agent=agent,
        used=[source],
        parameters=_parameters(narrative, choices),
        # The first note names the step in the History view, so it is short.
        notes=[
            f"Narrative read from {path.name}",
            *([f"{narrative.described}."] if narrative.dialect else []),
            entries_note(features),
            *notes,
            *omitted,
        ],
    )
    step = catalogue.add_narrative_entries(
        item_id, features, record, base, allow_newer_schema=allow_newer_schema
    )
    sources = list(dict.fromkeys(f.properties.source for f in features))
    return NarrativeImport(step, len(features), sources, omitted, notes)
