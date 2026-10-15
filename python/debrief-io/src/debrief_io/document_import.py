"""A Word or PDF document imported as a plot of its own (CAP-19, EXT-04).

As a REP file of narrative alone makes a plot, a narrative document makes a plot of
its entries; an ASW data document (positions, not narrative) makes a plot of its
track. The same four steps as every import: the document kept read-only and hashed as
the plot's source, one provenance record naming the importer, its version, the source
and the dialect, and everything not imported listed, in the report and in provenance.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path

from debrief_io.documents import DocumentError, read_document
from debrief_io.importer import Clock, ImportReport, _track, store_import, wall_clock
from debrief_io.narrative import (
    MEDIA_TYPES,
    Choices,
    NoNarrativeError,
    _document_file,
    chosen_features,
    entries_note,
)
from debrief_io.word import ASW, read_dialect
from debrief_kernel.time import format_utc
from debrief_schemas import SCHEMA_VERSION, DebriefFeatureCollection, models

IMPORTER = "debrief-io.document"
SUFFIXES = (".docx", ".doc", ".pdf")


def import_document(
    catalogue,
    path: Path,
    *,
    item_id: str | None = None,
    title: str | None = None,
    agent: models.AgentRef | None = None,
    allow_newer_schema: bool = False,
    clock: Clock = wall_clock,
    choices: Choices | None = None,
    track_name: str | None = None,
) -> ImportReport:
    """Import a .docx, .doc or .pdf document as a new plot. choices as for reading
    narrative into a plot (types; the platform of entries whose document names none);
    track_name names an ASW document's track (legacy Debrief asked), by default the
    document's name."""
    path = Path(path)
    item_id = item_id or re.sub(r"[^A-Za-z0-9._-]+", "-", path.stem).strip("-.") or "plot"
    agent = agent or models.AgentRef(kind="person", name="analyst")
    choices = choices or Choices()
    data = path.read_bytes()
    try:
        doc = read_document(path.name, data)
    except DocumentError as error:
        raise NoNarrativeError(str(error)) from None
    year = datetime.fromtimestamp(clock() / 1000, UTC).year
    track = (track_name or "").strip() or path.stem
    read = read_dialect(doc, track=track, default_year=year)
    narrative = None if read.dialect == ASW else _document_file(path.name, doc.format, read)

    def build(source: models.SourceRef) -> tuple[DebriefFeatureCollection, ImportReport]:
        started = format_utc(clock())
        report = ImportReport(item_id="")
        features: list = []
        empty = DebriefFeatureCollection(
            type="FeatureCollection", schema_version=SCHEMA_VERSION, features=[], provenance=[]
        )
        if narrative is not None:
            entries, left, notes = chosen_features(narrative, empty, choices)
            if not entries:
                raise NoNarrativeError(f"nothing would be imported: {' '.join(left)}")
            features += entries
            report.narrative_entries = len(entries)
            report.omitted += narrative.omitted + left
            report.notes += [entries_note(entries), *narrative.notes, *notes]
        else:
            report.omitted += read.problems
            report.notes += read.warnings
            if len(read.fixes) < 2:
                raise NoNarrativeError(
                    f"it is ASW data, but fewer than two positions could be read. "
                    f"{' '.join(read.problems[:3])}"
                )
            features.append(_track("track-1", track, read.fixes))
            report.tracks.append(track)
            report.fixes = len(read.fixes)
        described = f"{doc.described}, read as a {read.dialect_title}"
        record = models.ProvRecord(
            id=f"import-{started}",
            kind="import",
            started_at=started,
            ended_at=format_utc(clock()),
            tool=models.ToolRef(name=IMPORTER, version=version("debrief-io")),
            agent=agent,
            used=[source],
            parameters=[
                models.ParameterValue(name="format", value=doc.format),
                models.ParameterValue(name="dialect", value=read.dialect),
                *(
                    [models.ParameterValue(name="types", value="; ".join(choices.types))]
                    if choices.types is not None
                    else []
                ),
            ],
            notes=[f"{described}.", *report.notes, *report.omitted],
        )
        plot = DebriefFeatureCollection(
            type="FeatureCollection",
            schema_version=SCHEMA_VERSION,
            features=features,
            provenance=[record],
        )
        return plot, report

    return store_import(
        catalogue,
        path,
        data,
        item_id,
        title or path.stem,
        MEDIA_TYPES[doc.format],
        build,
        allow_newer_schema=allow_newer_schema,
    )
