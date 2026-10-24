"""Sensor data read from REP and DSF files (CAP-22, EXT-01, EXT-03).

A REP file's ;SENSOR:, ;SENSOR2: and ;SENSOR3: lines (rep.parse_sensor, ported from
legacy Debrief) are cuts of a sensor carried by a track. A .dsf file, the acoustic replay
application's sensor format, is the same lines alone, read as legacy ImportReplay read
it: its host tracks are in another file, already in the plot, so it is read into an open
plot (import_sensor), as one recorded, undoable step with the file as its source, as a
narrative is. A REP file with both fixes and sensor lines makes a plot with both
(importer.build_plot).

Each (track, sensor) pair of the lines is a sensor, as legacy grouped them: its colour is
its first cut's, from the line's symbology; a cut of another colour keeps its own. Its
host is the plot's track of that name, ignoring case; or, as legacy did for names a
translator had mangled, the track named by its first six characters; or the track the
analyst chose, as legacy Debrief asked ("Sensor track not found"). A sensor named UNKNOWN
is named after the file, as legacy Debrief offered.

Not imported, and said: frequency (CAP-22, EXT-03); lines with no bearing (NULL, NaN, a
;SENSOR3: frequency-only line); a ;SENSOR3: bearing accuracy, which legacy read and threw
away and whose meaning no format defines (product owner, 24 Oct 2026: lines only, no
wedges); line styles other than solid; ranges of 0 on ;SENSOR2: and ;SENSOR3: lines,
which legacy drew as a point (here as a cut with no range). Bearings outside 0 to 360
degrees, which legacy drew as they were, are read modulo 360, and said.
"""

from __future__ import annotations

import hashlib
from collections import Counter
from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path
from typing import Any

from debrief_io.importer import Clock, _rep_text, wall_clock
from debrief_io.narrative import _kept_source, earlier_words
from debrief_io.narrative import earlier_reads as narrative_reads
from debrief_io.rep import RepFile, RepSensorCut, colour_for, parse_rep
from debrief_kernel.time import format_utc, parse_utc
from debrief_schemas import DebriefFeatureCollection, models
from debrief_stac import Base, Catalogue, CatalogueError, Conflict, History, HistoryError
from debrief_stac import narrative as plot_narrative
from debrief_stac.sensors import ReadCut, ReadSensor

IMPORTER = "debrief-io.sensor"
MEDIA_TYPE = "text/plain"
YARD_M = 0.9144
# Legacy ImportReplay: a track name a translator mangled matches on its first six characters.
SHORT_NAME = 6
# Legacy line styles, the symbology's first character (replayLineStyleFor).
LINE_STYLES = {
    "A": "dotted",
    "B": "dot-dash",
    "C": "short dashes",
    "D": "long dashes",
    "E": "unconnected",
}


class NoSensorDataError(ValueError):
    """A file from which no sensor cut could be read: nothing would be added."""


class SensorReadBefore(NoSensorDataError):
    """A file read into the plot before, read again without saying so: nothing is read."""


class HostNeeded(ValueError):
    """Sensors whose host track is not in the plot by name, and the analyst has not said
    which track carries them: nothing is read until they do, as legacy Debrief asked."""

    def __init__(self, message: str, unmatched: list[str]):
        super().__init__(message)
        self.unmatched = unmatched


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n:,} {one if n == 1 else (many or one + 's')}"


# --- Grouping and hosts --------------------------------------------------------------


def groups(cuts: list[RepSensorCut]) -> dict[tuple[str, str], list[RepSensorCut]]:
    """Cuts by (track, sensor), in the order each pair first appears, as legacy kept a
    track's sensors."""
    out: dict[tuple[str, str], list[RepSensorCut]] = {}
    for cut in cuts:
        out.setdefault((cut.track, cut.sensor), []).append(cut)
    return out


def match_host(name: str, tracks: dict[str, str]) -> str | None:
    """The plot's track a sensor line names: by name ignoring case; else by the first six
    characters of the name, as legacy matched a name a translator had mangled."""
    folded = {n.casefold(): i for n, i in reversed(list(tracks.items()))}
    found = folded.get(name.strip().casefold())
    if found is None and len(name.strip()) > SHORT_NAME:
        found = folded.get(name.strip()[:SHORT_NAME].casefold())
    return found


def sensor_name(name: str, file_name: str) -> str:
    """A sensor's name: UNKNOWN is named after the file, as legacy Debrief offered."""
    return Path(file_name).stem if name.strip().upper() == "UNKNOWN" else name


@dataclass
class SensorLines:
    """What a file's sensor lines give, ready to become sensors once their hosts are
    known, with what was not imported and what was corrected."""

    groups: dict[tuple[str, str], list[RepSensorCut]]
    omitted: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def sensor_lines(parsed: RepFile) -> SensorLines:
    """The sensor lines of a parsed file, with the notes every import of them gives."""
    cuts = parsed.sensor_cuts
    out = SensorLines(groups(cuts))
    if not cuts:
        return out
    by_record = Counter(c.record for c in cuts)
    out.notes.append(
        "Sensor lines read: " + ", ".join(f"{n:,} {r}" for r, n in sorted(by_record.items())) + "."
    )
    frequencies = sum(1 for c in cuts if c.frequency is not None)
    if frequencies:
        out.omitted.append(
            f"{_plural(frequencies, 'cut')} gave a frequency: not imported. Frequency and "
            "acoustic analysis stay in the acoustic replay application (CAP-22, EXT-03)."
        )
    no_bearing = sum(1 for c in cuts if c.bearing is None)
    if no_bearing:
        out.omitted.append(
            f"{_plural(no_bearing, 'line')} gave no bearing (NULL, NaN, or a frequency only): "
            "not imported, as frequency is not."
        )
    accuracy = Counter(c.bearing_accuracy for c in cuts if c.bearing_accuracy is not None)
    if accuracy:
        said = ", ".join(f"{a}" for a, _ in accuracy.most_common(3))
        out.omitted.append(
            f"{_plural(accuracy.total(), ';SENSOR3: line')} gave a bearing accuracy ({said}): "
            "not imported. Legacy Debrief read it and threw it away, and no format says what "
            "it means; cuts are drawn as lines (decision, product owner, 24 Oct 2026)."
        )
    zero = sum(1 for c in cuts if c.zero_range)
    if zero:
        out.notes.append(
            f"{_plural(zero, 'cut')} gave a range of 0: drawn without a range, past the edge "
            "of the view (legacy Debrief drew them as a point)."
        )
    styles = Counter(
        LINE_STYLES[c.symbology[0].upper()]
        for c in cuts
        if c.bearing is not None and c.symbology[:1].upper() in LINE_STYLES
    )
    if styles:
        said = ", ".join(f"{s} ({n:,})" for s, n in styles.most_common())
        out.omitted.append(f"Line styles not imported, cuts drawn solid: {said}.")
    wrapped = sum(
        1 for c in cuts for b in (c.bearing, c.ambiguous) if b is not None and not 0 <= b < 360
    )
    if wrapped:
        out.notes.append(
            f"{_plural(wrapped, 'bearing')} outside 0 to 360° read modulo 360 (-153.5 is 206.5)."
        )
    truncated = sum(1 for c in cuts if c.time_truncated)
    if truncated:
        out.omitted.append(
            f"{truncated} cut times had more than millisecond precision and were truncated "
            "to milliseconds."
        )
    return out


@dataclass(frozen=True)
class Span:
    """A host track's first and last fix times (ms): its cuts outside it are not drawn."""

    start_ms: int
    end_ms: int


def spans(tracks) -> dict[str, Span]:
    """Each track's span, from its first and last fix alone: parsing every fix time of a
    track of 200,000 fixes took two seconds of a sensor import."""
    return {
        t.id: Span(parse_utc(t.properties.times[0]), parse_utc(t.properties.times[-1]))
        for t in tracks
        if t.properties.times
    }


def read_sensors(
    lines: SensorLines,
    hosts: dict[str, str | None],
    file_name: str,
    paths: dict[str, Span] | None = None,
    track_names: dict[str, str] | None = None,
    *,
    in_file: bool = False,
) -> tuple[list[ReadSensor], list[str], list[str]]:
    """The sensors to add: each (track, sensor) group whose host is known (hosts: a track
    name as the lines give it to a track id, or None for none). Returns them, with notes
    and omissions: groups with no host, and cuts outside their host's span (not drawn)."""
    read: list[ReadSensor] = []
    notes: list[str] = []
    omitted: list[str] = []
    for (track, sensor), cuts in lines.groups.items():
        with_bearing = [c for c in cuts if c.bearing is not None]
        if not with_bearing:
            continue
        host = hosts.get(track)
        name = sensor_name(sensor, file_name)
        if host is None:
            omitted.append(
                f"{_plural(len(with_bearing), 'cut')} of {name} not imported: "
                + (
                    f"the file has no track {track!r}. Read the file into a plot that has it: "
                    "Read sensor data into the plot."
                    if in_file
                    else f"no track was chosen to carry it ({track!r} is not in the plot)."
                )
            )
            continue
        first = with_bearing[0]
        colour = colour_for(first.symbology)
        read.append(
            ReadSensor(
                name=name,
                host_track_id=host,
                colour=colour,
                legacy_symbology=first.symbology,
                cuts=[
                    ReadCut(
                        time_ms=c.time_ms,
                        bearing=c.bearing,
                        ambiguous=c.ambiguous,
                        range_m=c.range_yd * YARD_M if c.range_yd else None,
                        origin=c.origin,
                        label=c.label,
                        comment=c.comment,
                        colour=colour_for(c.symbology),
                    )
                    for c in with_bearing
                ],
            )
        )
        if name != sensor:
            notes.append(f"Sensor {sensor} on {track} named {name}, after the file.")
        if track_names is not None and track_names.get(host, track).casefold() != track.casefold():
            notes.append(f"{name}: carried by {track_names.get(host, host)}, for {track}.")
        path = (paths or {}).get(host)
        if path is not None:
            outside = sum(1 for c in with_bearing if not path.start_ms <= c.time_ms <= path.end_ms)
            if outside:
                omitted.append(
                    f"{_plural(outside, 'cut')} of {name} "
                    f"fall{'s' if outside == 1 else ''} outside "
                    f"{(track_names or {}).get(host, track)}'s fixes: kept, but not drawn, "
                    "as legacy Debrief drew none there."
                )
    return read, notes, omitted


def sensors_note(read: list[ReadSensor], track_names: dict[str, str]) -> str:
    """What an import says of the sensors it read."""
    parts = []
    for sensor in read:
        ambiguous = sum(1 for c in sensor.cuts if c.ambiguous is not None and not c.resolved)
        resolved = sum(1 for c in sensor.cuts if c.ambiguous is not None and c.resolved)
        host = track_names.get(sensor.host_track_id, sensor.host_track_id)
        said = [_plural(len(sensor.cuts), "cut")]
        if ambiguous:
            said.append(f"{ambiguous:,} ambiguous")
        if resolved:
            said.append(f"{resolved:,} resolved")
        parts.append(f"{sensor.name} on {host} ({', '.join(said)})")
    return f"Sensor data read: {'; '.join(parts)}."


# --- Read into an open plot -------------------------------------------------------------


def _file(path: Path) -> tuple[RepFile, str]:
    data = path.read_bytes()
    return parse_rep(_rep_text(data)), f"sha256:{hashlib.sha256(data).hexdigest()}"


def _tracks(plot: DebriefFeatureCollection) -> tuple[dict[str, str], dict[str, str]]:
    """The plot's tracks: name to id (first of a name), and id to name."""
    names = plot_narrative.track_names(plot)
    return names, {i: n for n, i in names.items()}


def preview_sensor(
    path: Path,
    plot: DebriefFeatureCollection | None = None,
    *,
    catalogue: Catalogue | None = None,
    item_id: str | None = None,
) -> dict[str, Any]:
    """What a file's sensor lines hold, for the host to ask about before reading them
    into the plot: each (track, sensor) group, its cuts (with a bearing, ambiguous) and
    period, and the plot's track it would be carried by (None: the analyst is asked);
    what will not be imported; the plot's tracks to choose from; and whether the file
    was read into the plot before."""
    path = Path(path)
    parsed, digest = _file(path)
    lines = sensor_lines(parsed)
    earlier = None
    if catalogue is not None and item_id is not None:
        history = catalogue.history(item_id)
        plot = history.plot()
        earlier = earlier_reads(history, digest)
    names, ids = _tracks(plot) if plot is not None else ({}, {})
    entries = []
    for (track, sensor), cuts in lines.groups.items():
        with_bearing = [c for c in cuts if c.bearing is not None]
        host = match_host(track, names)
        entries.append(
            {
                "track": track,
                "sensor": sensor,
                "name": sensor_name(sensor, path.name),
                "cuts": len(with_bearing),
                "ambiguous": sum(1 for c in with_bearing if c.ambiguous is not None),
                "lines": len(cuts),
                "start": format_utc(min(c.time_ms for c in cuts)),
                "end": format_utc(max(c.time_ms for c in cuts)),
                "host_track_id": host,
                "host": ids.get(host) if host else None,
            }
        )
    return {
        "name": path.name,
        "sensors": entries,
        "cuts": sum(e["cuts"] for e in entries),
        "fixes": len(parsed.fixes),
        "tracks": [{"id": i, "name": n} for i, n in ids.items()],
        "omitted": lines.omitted + _other_lines(parsed),
        "notes": lines.notes,
        "content_hash": digest,
        "earlier": earlier or [],
    }


def _other_lines(parsed: RepFile) -> list[str]:
    out = []
    if parsed.fixes:
        out.append(
            f"{_plural(len(parsed.fixes), 'fix line')} not read: import the file as a plot "
            "for its tracks."
        )
    if parsed.narrative:
        out.append(
            f"{_plural(len(parsed.narrative), 'narrative line')} not read: read the file's "
            "narrative into the plot for them."
        )
    for record, count in sorted(parsed.other_records.items()):
        out.append(f"{count:,} {record} line{'s' if count != 1 else ''} not read.")
    for number, problem in parsed.errors:
        out.append(f"Line {number} could not be read: {problem}.")
    return out


def earlier_reads(history: History, content_hash: str) -> list[dict[str, Any]]:
    """Steps in the plot now that read a source with this content (see narrative)."""

    try:
        return narrative_reads(history, content_hash)
    except HistoryError:
        return []


@dataclass
class SensorImport:
    step: int
    sensors: list[str]
    cuts: int
    omitted: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def import_sensor(
    catalogue: Catalogue,
    item_id: str,
    path: Path,
    agent: models.AgentRef,
    base: Base | None = None,
    *,
    hosts: dict[str, str | None] | None = None,
    again: bool = False,
    clock: Clock = wall_clock,
    allow_newer_schema: bool = False,
) -> SensorImport:
    """Read a .dsf or REP file's sensor lines into the plot item_id as one step, the file
    kept as its source. hosts says, for a track name as the lines give it, the id of the
    plot's track that carries its sensors (or None: not read); names the lines give that
    match a track need not be said. A sensor whose track is neither matched nor said is
    refused (HostNeeded), as legacy Debrief asked; a file read in before is refused
    (SensorReadBefore) unless again is true. base is the plot the analyst was looking at:
    changed since, Conflict is raised and nothing is added."""
    path = Path(path)
    started = format_utc(clock())
    parsed, digest = _file(path)
    lines = sensor_lines(parsed)
    if not any(c.bearing is not None for c in parsed.sensor_cuts):
        why = " ".join(lines.omitted[:2]) or "It has no ;SENSOR:, ;SENSOR2: or ;SENSOR3: lines."
        raise NoSensorDataError(f"No sensor cut could be read from {path.name}. {why}")
    history = catalogue.history(item_id)
    if base is not None and base != history.base():
        raise Conflict(
            "The plot was changed elsewhere since you opened it, so nothing was read in. "
            "Open it again and read the file in again.",
            mergeable=False,
        )
    plot = history.plot()
    names, ids = _tracks(plot)
    chosen: dict[str, str | None] = {}
    unmatched = []
    said = hosts or {}
    for track, _ in lines.groups:
        if track in chosen:
            continue
        if track in said:
            host = said[track]
            if host is not None and host not in ids:
                raise CatalogueError(f"The plot has no track {host!r} to carry {track}'s sensors.")
            chosen[track] = host
        else:
            chosen[track] = match_host(track, names)
            if chosen[track] is None:
                unmatched.append(track)
    if unmatched:
        listed = ", ".join(repr(t) for t in unmatched)
        tracks = ", ".join(f"{n} ({i})" for i, n in ids.items()) or "none"
        raise HostNeeded(
            f"Say which track carries the sensors of {listed}: the plot has no track of that "
            f"name. Its tracks: {tracks}. Nothing was read.",
            unmatched,
        )
    earlier = earlier_reads(history, digest)
    if earlier and not again:
        raise SensorReadBefore(
            f"{path.name} is already in the plot: {earlier_words(earlier[-1])}. Nothing was "
            "read. Say again to read it in a second time."
        )
    paths = spans(f for f in plot.features if f.properties.kind == "track")
    read, notes, omitted = read_sensors(lines, chosen, path.name, paths, ids)
    if not read:
        raise NoSensorDataError(f"Nothing would be read from {path.name}: {' '.join(omitted)}")
    omitted = lines.omitted + omitted + _other_lines(parsed)
    notes = lines.notes + notes
    if earlier:
        notes.append(f"The same file (by its content) was {earlier_words(earlier[-1])}.")

    kept = _kept_source(catalogue, item_id, digest)
    if kept is None and f"source-{path.name}" in catalogue.assets(item_id):
        raise CatalogueError(
            f"This plot already has a source named {path.name}. Rename the file to read it in."
        )
    source = kept or catalogue.add_source(item_id, path, media_type=MEDIA_TYPE)
    parameters = [
        models.ParameterValue(
            name="host_" + "".join(c if c.isalnum() else "_" for c in track.lower())[:40],
            value=host or "none",
        )
        for track, host in sorted(chosen.items())
        if track in said
    ]
    record = models.ProvRecord(
        id=f"import-sensor-{started}",
        kind="import",
        started_at=started,
        ended_at=format_utc(clock()),
        tool=models.ToolRef(name=IMPORTER, version=version("debrief-io")),
        agent=agent,
        used=[source],
        parameters=parameters or None,
        # The first note names the step in the History view, so it is short.
        notes=[
            f"Sensor data read from {path.name}",
            sensors_note(read, ids),
            *notes,
            *omitted,
        ],
    )
    step, sensor_ids = catalogue.add_sensors(
        item_id, read, record, base, allow_newer_schema=allow_newer_schema
    )
    return SensorImport(step, sensor_ids, sum(len(s.cuts) for s in read), omitted, notes)
