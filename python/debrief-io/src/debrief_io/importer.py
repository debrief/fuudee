"""Importing a REP file into a catalogue as a new plot (EXT-01, SUB-10, SUB-11, SUB-18).

The source is copied into the plot's item, read-only, and hashed; the plot
records one provenance entry naming that source, the importer and its
version, and everything the import did not take. Nothing in the file is
dropped silently: other record types, unreadable lines, single-fix tracks,
incomplete depths, labels and truncated times are all listed, both in the returned
report (for the message the analyst sees) and in the plot's provenance.
"""

from __future__ import annotations

import io
import re
import time
from collections import defaultdict
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path

from debrief_io.rep import RepFix, RepNarrative, colour_for, parse_rep
from debrief_kernel.time import format_utc
from debrief_schemas import SCHEMA_VERSION, DebriefFeatureCollection, dump_plot, models
from debrief_stac import Catalogue, narrative, period_view, tracks, with_plot_details
from debrief_stac.hashing import content_hash
from debrief_stac.history import view_hash

IMPORTER = "debrief-io.rep"

# Returns the current time in epoch milliseconds.
Clock = Callable[[], int]


def wall_clock() -> int:
    return int(time.time() * 1000)


@dataclass
class ImportReport:
    item_id: str
    tracks: list[str] = field(default_factory=list)
    fixes: int = 0
    annotations: int = 0
    narrative_entries: int = 0
    sensor_cuts: int = 0
    # Everything not imported, in words an analyst can act on.
    omitted: list[str] = field(default_factory=list)
    # What the analyst should know that is not an omission: how each track is plotted.
    notes: list[str] = field(default_factory=list)


# How each track is plotted (CAP-01): over the ground or by dead reckoning, as the host
# says, having asked the analyst or used the choice they remembered. User state stays with
# the host (debrief-config); the importer only takes the answer. Without one, over the ground.
Modes = str | Mapping[str, str] | None
MODE_SAID = {"otg": "over the ground (OTG)", "dr": "by dead reckoning (DR)"}


def mode_for(modes: Modes, name: str) -> str | None:
    """The mode asked for a track: one for every track, or by its name; None if not said."""
    mode = modes if isinstance(modes, str) or modes is None else modes.get(name)
    if mode is not None and mode not in MODE_SAID:
        raise ValueError(f"{mode!r} is not a way to plot a track: otg or dr")
    return mode


def plotted(feature: models.TrackFeature, mode: str | None) -> models.TrackFeature:
    """The track as imported, plotted as asked: by dead reckoning, from its first fix by
    each fix's course and speed, its positions as logged kept beside them."""
    if mode is None:
        return feature
    if mode == "dr":
        return tracks.plotted_as(feature, "dr")
    return feature.model_copy(
        update={"properties": feature.properties.model_copy(update={"plotting_mode": "otg"})}
    )


def mode_notes(chosen: dict[str, str], remembered: str | None) -> list[str]:
    """What the import says of how its tracks are plotted, and, when it used the
    analyst's remembered choice, how to change it or be asked again."""
    notes = [f"Track {name!r} plotted {MODE_SAID[mode]}." for name, mode in chosen.items()]
    if remembered is not None and chosen:
        mode = next(iter(chosen.values()))
        notes.append(
            f"Tracks were plotted {MODE_SAID[mode]} as you chose for future imports. {remembered}"
        )
    return notes


def rep_track_names(path: Path) -> list[str]:
    """The tracks a REP file holds that would be imported (two fixes or more), in the
    order they first appear: so the host can ask how each is plotted before importing."""
    counts: dict[str, int] = {}
    for fix in parse_rep(_rep_text(Path(path).read_bytes())).fixes:
        counts[fix.track] = counts.get(fix.track, 0) + 1
    return [name for name, n in counts.items() if n >= 2]


def _rep_text(raw: bytes) -> str:
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1")  # legacy files are often Latin-1; every byte decodes


def _track_id(name: str, taken: set[str]) -> str:
    base = "track-" + (re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "unnamed")
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    taken.add(candidate)
    return candidate


def _depths(fixes: list[RepFix]) -> models.LengthSeries | None:
    """A track's depths, only when every fix gives one: a series cannot hold gaps."""
    depths = [f.depth_m for f in fixes]
    if any(d is None for d in depths):
        return None
    return models.LengthSeries(unit="m", values=depths)


def _track(feature_id: str, name: str, fixes: list[RepFix]) -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[f.longitude, f.latitude] for f in fixes]
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=[format_utc(f.time_ms) for f in fixes],
            speeds=models.SpeedSeries(unit="[kn_i]", values=[f.speed_kn for f in fixes]),
            courses=models.AngleSeries(unit="deg", values=[f.course_deg for f in fixes]),
            depths=_depths(fixes),
            style=models.TrackStyle(
                colour=colour_for(fixes[0].symbology), legacy_symbology=fixes[0].symbology
            ),
        ),
    )


def narrative_features(
    lines: list[RepNarrative], tracks: dict[str, str]
) -> list[models.NarrativeFeature]:
    """Narrative lines as narrative entries, in file order, numbered narrative-0001 on;
    each belongs to the track named as its source, where there is one (CAP-20)."""
    ids = narrative.new_ids(set(), len(lines))
    return [
        models.NarrativeFeature(
            type="Feature",
            id=feature_id,
            geometry=None,
            properties=models.NarrativeProperties(
                kind="narrative",
                time=format_utc(line.time_ms),
                source=line.source,
                entry_type=line.entry_type,
                text=line.text,
                track_id=narrative.track_for(line.source, tracks),
            ),
        )
        for feature_id, line in zip(ids, lines, strict=True)
    ]


def narrative_note(lines: list[RepNarrative]) -> str:
    """What the import says of the narrative it read: how many entries, from whom."""
    sources = list(dict.fromkeys(line.source for line in lines))
    named = ", ".join(sources[:5]) + (f" and {len(sources) - 5} more" if len(sources) > 5 else "")
    entries = "entry" if len(lines) == 1 else "entries"
    return f"{len(lines)} narrative {entries} read, from {named}."


def build_plot(
    text: str,
    source: models.SourceRef,
    agent: models.AgentRef,
    *,
    clock: Clock = wall_clock,
    modes: Modes = None,
    remembered: str | None = None,
) -> tuple[DebriefFeatureCollection, ImportReport]:
    """Parse REP text into a plot and a report of what was and was not imported.

    The clock times the provenance record. A builder that must produce the
    same plot every run, such as the sample data, passes a fixed clock. modes
    says how each track is plotted (otg or dr: one for all, or by track name);
    remembered, when the host used the analyst's remembered choice, says how to
    change it, and the notes say so.
    """
    started = format_utc(clock())
    parsed = parse_rep(text)
    report = ImportReport(item_id="")

    by_track: dict[str, list[RepFix]] = defaultdict(list)
    for fix in parsed.fixes:
        by_track[fix.track].append(fix)

    features: list[models.TrackFeature | models.NarrativeFeature] = []
    taken: set[str] = set()
    chosen: dict[str, str] = {}
    for name, fixes in by_track.items():
        fixes.sort(key=lambda f: f.time_ms)  # stable: equal times keep file order
        if len(fixes) < 2:
            report.omitted.append(
                f"Track {name!r} has only one fix, so it was not imported as a track."
            )
            continue
        mode = mode_for(modes, name)
        features.append(plotted(_track(_track_id(name, taken), name, fixes), mode))
        if mode is not None:
            chosen[name] = mode
        report.tracks.append(name)
        report.fixes += len(fixes)

    imported = [f for name in report.tracks for f in by_track[name]]
    truncated = sum(f.time_truncated for f in imported)
    if truncated:
        report.omitted.append(
            f"{truncated} fix times had more than millisecond precision "
            "and were truncated to milliseconds."
        )
    entries = narrative_features(parsed.narrative, {f.properties.name: f.id for f in features})
    features += entries
    report.narrative_entries = len(entries)
    if entries:
        report.notes.append(narrative_note(parsed.narrative))
    truncated = sum(n.time_truncated for n in parsed.narrative)
    if truncated:
        report.omitted.append(
            f"{truncated} narrative times had more than millisecond precision "
            "and were truncated to milliseconds."
        )
    for name in report.tracks:
        known = sum(f.depth_m is not None for f in by_track[name])
        if 0 < known < len(by_track[name]):
            report.omitted.append(
                f"Track {name!r} gives a depth for only {known} of {len(by_track[name])} "
                "fixes, so its depths were not imported."
            )
    labels = sum(1 for f in imported if f.label or f.comment)
    if labels:
        report.omitted.append(f"{labels} fixes had a label or comment; these are not yet imported.")
    features += _sensor_features(parsed, features, report)
    for record, count in sorted(parsed.other_records.items()):
        report.omitted.append(
            f"{count} {record} line{'s' if count != 1 else ''} not imported (not yet supported)."
        )
    for number, problem in parsed.errors:
        report.omitted.append(f"Line {number} could not be read: {problem}.")
    report.notes = mode_notes(chosen, remembered) + report.notes

    record = models.ProvRecord(
        id=f"import-{started}",
        kind="import",
        started_at=started,
        ended_at=format_utc(clock()),
        tool=models.ToolRef(name=IMPORTER, version=version("debrief-io")),
        agent=agent,
        used=[source],
        notes=[*report.notes, *report.omitted] or None,
    )
    plot = DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version=SCHEMA_VERSION,
        features=features,
        provenance=[record],
    )
    return plot, report


def _sensor_features(parsed, features: list, report: ImportReport) -> list:
    """The file's sensor lines as sensors and cuts, each carried by the file's track of
    its name (CAP-22); sensor lines for a track the file does not have are said, so they
    can be read into a plot that has it."""
    from debrief_io import sensor_import
    from debrief_kernel.geodesy import TrackPath
    from debrief_stac import sensors

    lines = sensor_import.sensor_lines(parsed)
    if not lines.groups:
        return []
    tracks = {f.id: f for f in features if f.properties.kind == "track"}
    names = {f.properties.name: f.id for f in tracks.values()}
    hosts = {track: sensor_import.match_host(track, names) for track, _ in lines.groups}
    ids = {i: f.properties.name for i, f in tracks.items()}
    paths = {i: TrackPath.from_feature(f) for i, f in tracks.items()}
    read, notes, omitted = sensor_import.read_sensors(
        lines, hosts, report.item_id or "file", paths, ids, in_file=True
    )
    report.omitted += lines.omitted + omitted
    built = sensors.build(read, (f.id for f in features), ids)
    if read:
        report.notes.append(sensor_import.sensors_note(read, ids))
    report.notes += lines.notes + notes
    report.sensor_cuts = sum(len(s.cuts) for s in read)
    return built


class NoTracksError(ValueError):
    """A REP file in which no track could be read: there would be nothing to show."""


class SourceChangedError(ValueError):
    """The source file changed while it was being imported."""


def store_import(
    catalogue: Catalogue,
    path: Path,
    data: bytes,
    item_id: str,
    title: str,
    media_type: str,
    build: Callable[[models.SourceRef], tuple[DebriefFeatureCollection, ImportReport]],
    *,
    allow_newer_schema: bool = False,
) -> ImportReport:
    """Build and validate a plot from a source's bytes, then write it as a new item.

    Nothing is written until the plot is built and valid. If writing then
    fails, the new item is removed, so a failed import never leaves half a
    plot behind. The source is hashed from the bytes read; the copy the
    catalogue keeps must hash the same, or the import is refused.
    """
    expected = models.SourceRef(
        href=f"sources/{path.name}", content_hash=content_hash(io.BytesIO(data))
    )
    plot, report = build(expected)
    # The plot's own details, and a time window over its whole period to start with.
    plot = with_plot_details(plot, title)
    view = period_view(plot)
    dump_plot(plot)  # validates, raising DocumentValidationError before anything is written
    catalogue.create_plot(item_id, title, allow_newer_schema=allow_newer_schema)
    try:
        stored = catalogue.add_source(item_id, path, media_type=media_type)
        if stored.content_hash != expected.content_hash:
            raise SourceChangedError(f"{path.name} changed while it was being imported")
        if stored != expected:  # the catalogue chose another place for it
            (record,) = plot.provenance
            plot = plot.model_copy(
                update={"provenance": [record.model_copy(update={"used": [stored]})]}
            )
        catalogue.write_plot(item_id, plot, allow_newer_schema=allow_newer_schema)
        if view is not None:
            catalogue.write_view(item_id, view, view_hash(None))
    except BaseException:
        catalogue.discard_plot(item_id)
        raise
    report.item_id = item_id
    return report


def import_rep(
    catalogue: Catalogue,
    path: Path,
    *,
    item_id: str | None = None,
    title: str | None = None,
    agent: models.AgentRef | None = None,
    allow_newer_schema: bool = False,
    clock: Clock = wall_clock,
    modes: Modes = None,
    remembered: str | None = None,
) -> ImportReport:
    """Import a REP file as a new plot in the catalogue, each track plotted over the
    ground or by dead reckoning as modes says (see build_plot).

    The plot is built and validated before anything is written; a failed
    import leaves the catalogue unchanged.
    """
    path = Path(path)
    item_id = item_id or re.sub(r"[^A-Za-z0-9._-]+", "-", path.stem).strip("-.") or "plot"
    agent = agent or models.AgentRef(kind="person", name="analyst")
    raw = path.read_bytes()
    text = _rep_text(raw)
    return store_import(
        catalogue,
        path,
        raw,
        item_id,
        title or path.stem,
        "text/plain",
        lambda source: _with_tracks(
            build_plot(text, source, agent, clock=clock, modes=modes, remembered=remembered)
        ),
        allow_newer_schema=allow_newer_schema,
    )


def _with_tracks(
    built: tuple[DebriefFeatureCollection, ImportReport],
) -> tuple[DebriefFeatureCollection, ImportReport]:
    """Refuse a file with no readable track and no narrative, saying why, rather than
    make an empty plot. A file of narrative alone, a platform's log, makes a plot."""
    plot, report = built
    if not report.tracks and not report.narrative_entries:
        if any("the file has no track" in o for o in report.omitted):
            # A .dsf file: its host tracks are in another file (CAP-22, EXT-03).
            raise NoTracksError(
                "it holds sensor data only, with no track to carry it. Open the plot with "
                "its host track and read the file into it: Read sensor data into the plot."
            )
        why = " ".join(report.omitted[:3]) or "The file is empty."
        more = len(report.omitted) - 3
        raise NoTracksError(
            f"no tracks could be read from it. {why}"
            + (f" ({more} more problem{'s' if more != 1 else ''}.)" if more > 0 else "")
        )
    return plot, report
