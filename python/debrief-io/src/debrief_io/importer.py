"""Importing a REP file into a catalogue as a new plot (EXT-01, SUB-10, SUB-11, SUB-18).

The source is copied into the plot's item, read-only, and hashed; the plot
records one provenance entry naming that source, the importer and its
version, and everything the import did not take. Nothing in the file is
dropped silently: other record types, unreadable lines, single-fix tracks,
incomplete depths, labels and truncated times are all listed, both in the returned
report (for the message the analyst sees) and in the plot's provenance.
"""

from __future__ import annotations

import re
import time as clock
from collections import defaultdict
from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path

from debrief_io.rep import RepFix, colour_for, parse_rep
from debrief_kernel.time import format_utc
from debrief_schemas import SCHEMA_VERSION, DebriefFeatureCollection, models
from debrief_stac import Catalogue

IMPORTER = "debrief-io.rep"


@dataclass
class ImportReport:
    item_id: str
    tracks: list[str] = field(default_factory=list)
    fixes: int = 0
    # Everything not imported, in words an analyst can act on.
    omitted: list[str] = field(default_factory=list)


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


def build_plot(
    text: str, source: models.SourceRef, agent: models.AgentRef
) -> tuple[DebriefFeatureCollection, ImportReport]:
    """Parse REP text into a plot and a report of what was and was not imported."""
    started = format_utc(int(clock.time() * 1000))
    parsed = parse_rep(text)
    report = ImportReport(item_id="")

    by_track: dict[str, list[RepFix]] = defaultdict(list)
    for fix in parsed.fixes:
        by_track[fix.track].append(fix)

    features: list[models.TrackFeature] = []
    taken: set[str] = set()
    for name, fixes in by_track.items():
        fixes.sort(key=lambda f: f.time_ms)  # stable: equal times keep file order
        if len(fixes) < 2:
            report.omitted.append(
                f"Track {name!r} has only one fix, so it was not imported as a track."
            )
            continue
        features.append(_track(_track_id(name, taken), name, fixes))
        report.tracks.append(name)
        report.fixes += len(fixes)

    imported = [f for name in report.tracks for f in by_track[name]]
    truncated = sum(f.time_truncated for f in imported)
    if truncated:
        report.omitted.append(
            f"{truncated} fix times had more than millisecond precision "
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
    for record, count in sorted(parsed.other_records.items()):
        report.omitted.append(
            f"{count} {record} line{'s' if count != 1 else ''} not imported (not yet supported)."
        )
    for number, problem in parsed.errors:
        report.omitted.append(f"Line {number} could not be read: {problem}.")

    record = models.ProvRecord(
        id=f"import-{started}",
        kind="import",
        started_at=started,
        ended_at=format_utc(int(clock.time() * 1000)),
        tool=models.ToolRef(name=IMPORTER, version=version("debrief-io")),
        agent=agent,
        used=[source],
        notes=report.omitted or None,
    )
    plot = DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version=SCHEMA_VERSION,
        features=features,
        provenance=[record],
    )
    return plot, report


def import_rep(
    catalogue: Catalogue,
    path: Path,
    *,
    item_id: str | None = None,
    title: str | None = None,
    agent: models.AgentRef | None = None,
    allow_newer_schema: bool = False,
) -> ImportReport:
    """Import a REP file as a new plot in the catalogue."""
    path = Path(path)
    item_id = item_id or re.sub(r"[^A-Za-z0-9._-]+", "-", path.stem).strip("-.") or "plot"
    agent = agent or models.AgentRef(kind="person", name="analyst")
    catalogue.create_plot(item_id, title or path.stem, allow_newer_schema=allow_newer_schema)
    source = catalogue.add_source(item_id, path, media_type="text/plain")
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")  # legacy files are often Latin-1; every byte decodes
    plot, report = build_plot(text, source, agent)
    catalogue.write_plot(item_id, plot, allow_newer_schema=allow_newer_schema)
    report.item_id = item_id
    return report
