"""A narrative read into a plot already open (CAP-20, SUB-10, SUB-18).

Each platform keeps its own log; combining them on one Zulu time axis means reading
each into the same plot. A REP file's ;NARRATIVE: and ;NARRATIVE2: lines are read
here (rep.parse_narrative, ported from legacy Debrief); Word and PDF diaries follow
the same path in part B (CAP-19). The file is kept in the plot's item as a source,
read-only and hashed, and its entries are added as one recorded, undoable step whose
record names the importer, its version and that source, and lists what was not read
(fix and other lines, which belong to an import of their own, and lines that could
not be read). Each entry belongs to the plot's track of its source's name, if any.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path

from debrief_io.importer import Clock, _rep_text, narrative_features, narrative_note, wall_clock
from debrief_io.rep import parse_rep
from debrief_kernel.time import format_utc
from debrief_schemas import models
from debrief_stac import Base, Catalogue, CatalogueError, Conflict
from debrief_stac import narrative as plot_narrative

IMPORTER = "debrief-io.narrative"


class NoNarrativeError(ValueError):
    """A file in which no narrative entry could be read: nothing would be added."""


@dataclass
class NarrativeImport:
    step: int
    entries: int
    sources: list[str] = field(default_factory=list)
    # Everything not read, in words an analyst can act on.
    omitted: list[str] = field(default_factory=list)


def import_narrative(
    catalogue: Catalogue,
    item_id: str,
    path: Path,
    agent: models.AgentRef,
    base: Base | None = None,
    *,
    clock: Clock = wall_clock,
    allow_newer_schema: bool = False,
) -> NarrativeImport:
    """Read a file's narrative into the plot item_id as one step. base is the plot the
    analyst was looking at: changed since, Conflict is raised and nothing is added."""
    path = Path(path)
    started = format_utc(clock())
    parsed = parse_rep(_rep_text(path.read_bytes()))
    if not parsed.narrative:
        problems = [f"line {n}: {p}" for n, p in parsed.errors[:3]]
        why = f" ({'; '.join(problems)})" if problems else ""
        raise NoNarrativeError(f"No narrative entry could be read from {path.name}{why}.")
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
    history = catalogue.history(item_id)
    if base is not None and base != history.base():
        # Said before the source is kept, so a stale base changes nothing at all.
        raise Conflict(
            "The plot was changed elsewhere since you opened it, so nothing was read in. "
            "Open it again and read the file in again.",
            mergeable=False,
        )
    plot = history.plot()
    features = narrative_features(parsed.narrative, plot_narrative.track_names(plot))
    key = f"source-{path.name}"
    if key in catalogue.assets(item_id):
        raise CatalogueError(
            f"This plot already has a source named {path.name}. Rename the file to read it in."
        )
    source = catalogue.add_source(item_id, path)
    record = models.ProvRecord(
        id=f"import-narrative-{started}",
        kind="import",
        started_at=started,
        ended_at=format_utc(clock()),
        tool=models.ToolRef(name=IMPORTER, version=version("debrief-io")),
        agent=agent,
        used=[source],
        # The first note names the step in the History view, so it is short.
        notes=[
            f"Narrative read from {path.name}",
            narrative_note(parsed.narrative),
            *omitted,
        ],
    )
    step = catalogue.add_narrative_entries(
        item_id, features, record, base, allow_newer_schema=allow_newer_schema
    )
    sources = list(dict.fromkeys(f.properties.source for f in features))
    return NarrativeImport(step, len(features), sources, omitted)
