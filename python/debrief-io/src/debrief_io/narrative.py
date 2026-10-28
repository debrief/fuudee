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

A file read in before (product owner, 15 Oct 2026) is known by its content hash, which
the provenance of the step that read it records, whatever the file was called; an entry
already in the plot, by its time, source and text. preview_narrative says so, and
import_narrative reads nothing until told whether to skip the entries already in the
plot or add them again (Choices.duplicates).
"""

from __future__ import annotations

import hashlib
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path, PurePosixPath
from typing import Any

from debrief_io.documents import Document, DocumentError, file_bytes, read_document, sniff
from debrief_io.importer import Clock, _rep_text, wall_clock
from debrief_io.rep import parse_rep
from debrief_io.word import (
    ASW,
    MAX_CONTINUATION,
    SKIP_NAMES,
    DocEntry,
    DocumentRead,
    read_dialect,
)
from debrief_kernel.formatting import format_time
from debrief_kernel.time import format_utc, parse_utc
from debrief_schemas import DebriefFeatureCollection, models
from debrief_stac import Base, Catalogue, CatalogueError, Conflict, History, HistoryError
from debrief_stac import narrative as plot_narrative
from debrief_stac.sensors import ReadCut, ReadSensor

IMPORTER = "debrief-io.narrative"
MEDIA_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "pdf": "application/pdf",
}


class NoNarrativeError(ValueError):
    """A file in which no narrative entry could be read: nothing would be added."""


class AlreadyInPlotError(NoNarrativeError):
    """A file read into the plot before, or with entries already in it, read again with no
    word on whether to skip those entries or add them again: nothing is read."""


# Choices.duplicates: what to do with entries already in the plot.
SKIP, ADD = "skip", "add"

# A Rider's narrative's bearings become cuts of this sensor on the entry's track, drawn red, as
# legacy Debrief made them (its sensor FromNarrative, ImportRiderNarrativeDocument.addCut).
RIDER_SENSOR = "Rider bearings"
RIDER_COLOUR = "#e01c3e"


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
    bearing: float | None = None  # a Rider entry's bearing: a sensor cut (CAP-22)
    ambiguous: float | None = None  # and its ambiguous twin


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
    # The file's content hash, as a source's is recorded: "sha256:…".
    content_hash: str = ""

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
    digest = f"sha256:{hashlib.sha256(data).hexdigest()}"
    kind = sniff(data)
    if kind is None:
        narrative = _rep_file(path.name, data)
    else:
        try:
            doc = read_document(path.name, data)
        except DocumentError as error:
            raise NoNarrativeError(f"{path.name} could not be read: {error}") from None
        year = datetime.fromtimestamp(clock() / 1000, UTC).year
        read = read_dialect(doc, track=path.stem, default_year=year)
        narrative = _document_file(path.name, doc.format, read)
    narrative.content_hash = digest
    return narrative


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
            f"{_plural(read.overflow, 'line')} of text after an entry's first "
            f"{MAX_CONTINUATION:,} lines of continuation {'was' if read.overflow == 1 else 'were'} "
            "not read: more than an entry could hold."
        )
    if read.stopped_at:
        omitted.append(f"Reading stopped at {read.stopped_at[:60]!r}: what follows was not read.")
    if read.as_text:
        n = len(read.as_text)
        listed = "; ".join(f"line {number}: {_quoted(line)}" for number, line in read.as_text)
        notes.append(
            f"{_plural(n, 'line')} starting with a number {'was' if n == 1 else 'were'} read as "
            f"text of the entry before, not as {'an entry' if n == 1 else 'entries'}: "
            f"{'its' if n == 1 else 'their'} time would be out of order with the entries "
            f"around {'it' if n == 1 else 'them'} ({listed})."
        )
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
            f"{_plural(cuts, 'entry', 'entries')} give a bearing: kept in the entry's text, "
            f"and made a cut of the sensor {RIDER_SENSOR} on the entry's track, an ambiguous "
            "one where the entry gives two, as legacy Debrief made them (CAP-22)."
        )
    entries = [_candidate(e) for e in read.entries]
    if not entries:
        why = f" ({'; '.join(read.problems[:3])})" if read.problems else ""
        raise NoNarrativeError(
            f"No narrative entry could be read from {name}, read as a {read.dialect_title}{why}."
        )
    return NarrativeFile(name, fmt, read.dialect, read.dialect_title, entries, omitted, notes)


def _quoted(text: str, most: int = 60) -> str:
    one_line = " ".join(text.split())
    return f"\u201c{one_line if len(one_line) <= most else one_line[: most - 1] + '\u2026'}\u201d"


def _candidate(entry: DocEntry) -> Candidate:
    return Candidate(
        entry.time_ms,
        entry.source,
        entry.entry_type,
        entry.text,
        fcs=entry.fcs is not None and entry.fcs.complete,
        bearing=entry.bearing,
        ambiguous=entry.ambiguous,
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
    narrative: NarrativeFile,
    plot: DebriefFeatureCollection | None = None,
    earlier: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """What a file holds, for the host to ask about before reading it into the plot:
    its dialect, its types with counts, its sources with the track each would belong
    to, its period and how many entries fall outside the plot's tracks' period; and,
    given the plot, whether it was read into the plot before (earlier, from
    earlier_reads: when, by whom, as which step) and how many of its entries are
    already there (already: same time, source and text)."""
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
        "content_hash": narrative.content_hash,
        "earlier": earlier or [],
        "already": sum(already_in_plot(narrative, plot, Choices())) if plot is not None else 0,
    }


def _ranked(counter: Counter[str]) -> list[tuple[str, int]]:
    return sorted(counter.items(), key=lambda item: (-item[1], item[0].casefold(), item[0]))


def preview_narrative(
    path: Path,
    plot: DebriefFeatureCollection | None = None,
    *,
    catalogue: Catalogue | None = None,
    item_id: str | None = None,
) -> dict[str, Any]:
    """preview of a file, read: see preview. Given the catalogue and the plot's item,
    the plot is its current content, and earlier reads of the file are looked for in
    its history."""
    narrative = read_narrative_file(Path(path))
    earlier = None
    if catalogue is not None and item_id is not None:
        history = catalogue.history(item_id)
        plot = history.plot()
        earlier = earlier_reads(history, narrative.content_hash)
    return preview(narrative, plot, earlier)


# --- Read before ---------------------------------------------------------------------


def earlier_reads(history: History, content_hash: str) -> list[dict[str, Any]]:
    """The steps in the plot now (not undone) whose records used a source with this
    content hash, whatever its name: when (at), by whom (by), the step and its name
    (how, as the History view names it) and the source's name, oldest first."""
    found = []
    try:
        steps = history.steps()
    except HistoryError:
        return []  # a history that cannot be trusted names no earlier read
    for step in steps:
        if step.status != "applied":
            continue
        for record in step.records:
            used = [u for u in record.used or [] if u.content_hash == content_hash]
            if used:
                found.append(
                    {
                        "step": step.seq,
                        "at": record.started_at,
                        "by": record.agent.name,
                        "how": record.notes[0] if record.notes else "an import",
                        "name": PurePosixPath(used[0].href).name,
                    }
                )
                break
    return found


def earlier_words(earlier: dict[str, Any]) -> str:
    """An earlier read in words: "read in on 15 Oct 2026 14:02:11Z by Ian (step 3,
    Narrative read from log.docx)"."""
    when = format_time(parse_utc(earlier["at"]), plot_narrative.DATED)
    return f"read in on {when} by {earlier['by']} (step {earlier['step']}, {earlier['how']})"


def _key(text: str) -> str:
    """Text and names compared as the importer matches a platform to a track: ignoring
    case and spacing (line breaks included)."""
    return " ".join(text.split()).casefold()


def _sources(narrative: NarrativeFile, plot: DebriefFeatureCollection, choices: Choices):
    """Each entry's source as written and as it would be written into the plot (its
    track's name, for an entry matched to a track), and the track."""
    tracks = plot_narrative.track_names(plot)
    platform = choices.platform or default_platform(narrative, tracks)
    names = {f.id: f.properties.name for f in plot.features if f.properties.kind == "track"}
    out = []
    for entry in narrative.entries:
        written = entry.source or platform
        if written in choices.tracks:
            track = choices.tracks[written]
            track = track if track in names else None
        else:
            track = track_for_platform(written, tracks)
        out.append((written, names[track] if track is not None else written, track))
    return out


def already_in_plot(
    narrative: NarrativeFile, plot: DebriefFeatureCollection | None, choices: Choices
) -> list[bool]:
    """For each entry, whether the plot has it already: an entry at the same time
    (to the millisecond), from the same source (as written, or the name of the track it
    would belong to) and with the same text, names and text compared ignoring case and
    spacing, as the importer matches a platform to a track."""
    if plot is None:
        return [False] * len(narrative.entries)
    have: dict[tuple[int, str], set[str]] = {}
    for f in plot.features:
        if f.properties.kind == "narrative":
            key = (parse_utc(f.properties.time), _key(f.properties.text))
            have.setdefault(key, set()).add(_key(f.properties.source))
    if not have:
        return [False] * len(narrative.entries)
    out = []
    for entry, (written, source, _) in zip(
        narrative.entries, _sources(narrative, plot, choices), strict=True
    ):
        names = have.get((entry.time_ms, _key(entry.text)), set())
        out.append(_key(written) in names or _key(source) in names)
    return out


# --- Reading it in -------------------------------------------------------------------


@dataclass
class Choices:
    """What the analyst chose, as legacy Debrief asked: which types (None: all; ""
    names entries with no type), only the entries within the plot's tracks' period,
    the track each platform belongs to (None: none), and the source of entries whose
    document names no platform. And, new here, for a file read into the plot before or
    with entries already in it, duplicates: "skip" those entries, or "add" them again;
    None (not said) reads nothing from such a file (AlreadyInPlotError)."""

    types: list[str] | None = None
    within_period: bool = False
    tracks: dict[str, str | None] = field(default_factory=dict)
    platform: str | None = None
    duplicates: str | None = None

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
        duplicates = value.get("duplicates")
        if duplicates not in (None, SKIP, ADD):
            raise ValueError(
                'duplicates is "skip" (entries already in the plot are not read again) '
                'or "add" (they are read again)'
            )
        return cls(
            types, within, dict(tracks or {}), platform.strip() if platform else None, duplicates
        )


@dataclass
class Chosen:
    """The entries to add, as features, with what the choices left out, the notes, and
    how many of the entries chosen the plot has already (skipped or added again)."""

    features: list[models.NarrativeFeature]
    omitted: list[str]
    notes: list[str]
    already: int = 0
    # A Rider's bearings: (track id, time, bearing, ambiguous) of each entry chosen that has one.
    cuts: list[tuple[str, int, float, float | None]] = field(default_factory=list)


def chosen_features(
    narrative: NarrativeFile, plot: DebriefFeatureCollection, choices: Choices
) -> Chosen:
    """The entries to add, as features, with what the choices left out and the notes."""
    tracks = plot_narrative.track_names(plot)
    platform = choices.platform or default_platform(narrative, tracks)
    omitted: list[str] = []
    notes: list[str] = []
    # Each entry with its source as written, as written into the plot, its track, and
    # whether the plot has it already.
    rows = list(
        zip(
            narrative.entries,
            _sources(narrative, plot, choices),
            already_in_plot(narrative, plot, choices),
            strict=True,
        )
    )
    if choices.types is not None:
        wanted = set(choices.types)
        left = Counter(e.entry_type or "" for e, _, _ in rows if (e.entry_type or "") not in wanted)
        rows = [r for r in rows if (r[0].entry_type or "") in wanted]
        if left:
            named = ", ".join(f"{n or '(no type)'} ({c})" for n, c in _ranked(left))
            count = _plural(left.total(), "entry", "entries")
            omitted.append(f"{count} of types not chosen not read: {named}.")
    period = tracks_period(plot)
    if choices.within_period and period is not None:
        before = len(rows)
        rows = [r for r in rows if period[0] <= r[0].time_ms <= period[1]]
        if len(rows) < before:
            omitted.append(
                f"{_plural(before - len(rows), 'entry', 'entries')} outside the plot's period "
                f"({_period_words(*period)}) not read, as chosen."
            )
    already = sum(1 for _, _, there in rows if there)
    if already and choices.duplicates == SKIP:
        rows = [r for r in rows if not r[2]]
        omitted.append(
            f"{_plural(already, 'entry', 'entries')} already in the plot (the same time, "
            "source and text) not read again, as chosen."
        )
    elif already and choices.duplicates == ADD:
        notes.append(
            f"{_plural(already, 'entry', 'entries')} already in the plot (the same time, "
            "source and text) read again, as chosen: the plot has "
            f"{'it' if already == 1 else 'them'} twice."
        )
    entries = [e for e, _, _ in rows]
    unnamed = sum(1 for e in entries if not e.source)
    if unnamed:
        notes.append(
            f"{_plural(unnamed, 'entry', 'entries')} name no platform: their source is {platform}."
        )
    ids = plot_narrative.new_ids({f.id for f in plot.features}, len(entries))
    features = []
    renamed: Counter[tuple[str, str]] = Counter()
    for feature_id, (entry, (written, source, track), _) in zip(ids, rows, strict=True):
        # Product owner, 15 Oct 2026: an entry matched to a track is that track's, by its
        # name (and so its colour); the name as written is kept in the step's record.
        if source != written:
            renamed[(written, source)] += 1
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
    for (written, source), n in renamed.items():
        notes.append(
            f"{_plural(n, 'entry', 'entries')} written as from {written} "
            f"{'is' if n == 1 else 'are'} {source}'s: their source is the track's name."
        )
    # A Rider's bearings: cuts on the entry's track (CAP-22); none where it has no track,
    # as legacy Debrief made none without a host.
    cuts = [
        (track, entry.time_ms, float(entry.bearing), _float(entry.ambiguous))
        for entry, (_, _, track), _ in rows
        if entry.bearing is not None and track is not None
    ]
    hostless = sum(1 for entry, (_, _, t), _ in rows if entry.bearing is not None and t is None)
    if hostless:
        omitted.append(
            f"{_plural(hostless, 'bearing')} not made {'a cut' if hostless == 1 else 'cuts'}: "
            f"{'its entry belongs' if hostless == 1 else 'their entries belong'} to no track "
            "in the plot."
        )
    return Chosen(features, omitted, notes, already, cuts)


def _float(value: float | None) -> float | None:
    return None if value is None else float(value)


def rider_sensors(cuts: list[tuple[str, int, float, float | None]]) -> list[ReadSensor]:
    """A Rider's bearings as cuts of the sensor RIDER_SENSOR on each entry's track."""
    by_track: dict[str, list[ReadCut]] = {}
    for track, time_ms, bearing, ambiguous in cuts:
        by_track.setdefault(track, []).append(ReadCut(time_ms, bearing, ambiguous=ambiguous))
    return [
        ReadSensor(name=RIDER_SENSOR, host_track_id=track, colour=RIDER_COLOUR, cuts=read)
        for track, read in by_track.items()
    ]


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
    if choices.duplicates:
        values.append(("duplicates", choices.duplicates))
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
    chosen = chosen_features(narrative, plot, choices)
    earlier = earlier_reads(history, narrative.content_hash)
    if choices.duplicates is None and (earlier or chosen.already):
        raise AlreadyInPlotError(
            already_words(path.name, earlier, chosen.already, len(chosen.features))
        )
    features, left = chosen.features, chosen.omitted
    if not features:
        raise NoNarrativeError(f"Nothing would be read from {path.name}: {' '.join(left)}")
    omitted = narrative.omitted + left
    notes = narrative.notes + chosen.notes
    if earlier:
        notes.insert(
            len(narrative.notes),
            f"The same file (by its content) was {earlier_words(earlier[-1])}.",
        )
    # The same content kept already, under any name, is the source again; another file
    # of the same name is not.
    kept = _kept_source(catalogue, item_id, narrative.content_hash)
    key = f"source-{path.name}"
    if kept is None and key in catalogue.assets(item_id):
        raise CatalogueError(
            f"This plot already has a source named {path.name}. Rename the file to read it in."
        )
    source = kept or catalogue.add_source(
        item_id, path, media_type=MEDIA_TYPES.get(narrative.format, "text/plain")
    )
    riders = rider_sensors(chosen.cuts)
    if riders:
        names = plot_narrative.track_names(plot)
        hosts = {i: n for n, i in names.items()}
        made = ", ".join(f"{hosts.get(s.host_track_id, s.host_track_id)}" for s in riders)
        ambiguous = sum(1 for _, _, _, a in chosen.cuts if a is not None)
        notes.append(
            f"{_plural(len(chosen.cuts), 'bearing')} made cuts of the sensor {RIDER_SENSOR} "
            f"on {made}" + (f", {ambiguous:,} of them ambiguous" if ambiguous else "") + "."
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
        item_id,
        features,
        record,
        base,
        allow_newer_schema=allow_newer_schema,
        sensor_data=riders,
    )
    sources = list(dict.fromkeys(f.properties.source for f in features))
    return NarrativeImport(step, len(features), sources, omitted, notes)


def already_words(name: str, earlier: list[dict[str, Any]], already: int, total: int) -> str:
    """Why nothing was read from a file read before, or with entries in the plot already
    (already of the total to read), and what to say to read it."""
    if already == total:
        have = "the entry to read" if total == 1 else f"all {total:,} entries to read"
    else:
        have = f"{already:,} of the {total:,} entries to read"
    verb = "is" if already == 1 or total == 1 else "are"
    if earlier:
        said = f"{name} is already in the plot: {earlier_words(earlier[-1])}"
        said += f"; {have} {verb} in the plot." if already else "."
    else:
        said = (
            f"{have[0].upper() + have[1:]} from {name} {verb} already in the plot (the same "
            "time, source and text)."
        )
    return (
        f'{said} Nothing was read. Say duplicates "skip" to read only the entries not in '
        'the plot, or "add" to read them all again.'
    )


def _kept_source(catalogue: Catalogue, item_id: str, content_hash: str) -> models.SourceRef | None:
    """The plot's source with this content, if it has one."""
    for asset in catalogue.assets(item_id).values():
        if asset.debrief_asset_kind == "source" and asset.debrief_content_hash == content_hash:
            href = PurePosixPath(*[p for p in PurePosixPath(asset.href).parts if p != "."])
            return models.SourceRef(href=href.as_posix(), content_hash=content_hash)
    return None
