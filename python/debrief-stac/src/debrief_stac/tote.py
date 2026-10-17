"""The Tote over a plot in a catalogue: measures at one time, for the Tote view and agents.

One call per change of current time (decision 11 Oct, docs/spikes/tote-latency.md):
the extension asks again for the latest time as each answer arrives. To keep a
call to a few milliseconds, each plot's tracks are prepared once
(measures.TrackMotion) and kept while the plot file is unchanged: its size,
modification time and file number, as the history's own cache checks them. A
change to the island alone (the Tote's choice of tracks, or the time window)
leaves the content's hash as it was, so the tracks are kept then too.

Which tracks the Tote compares is view state, in the plot's island (ToteView):
saved with debrief/set_view like the time window, never a step in the history
(SUB-22; decision, 14 Oct 2026). Tracks chosen that the plot no longer has are
shown as missing rather than refused.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from debrief_kernel.formatting import DEFAULT_SETTINGS, format_time
from debrief_kernel.measures import (
    CORE_GROUP,
    CORE_GROUP_ID,
    MEASURES,
    MeasureDefinition,
    MeasureGroup,
    TrackMotion,
    TrackState,
    group_measures,
    measure,
)
from debrief_kernel.time import format_utc, parse_utc
from debrief_schemas import models

if TYPE_CHECKING:
    from debrief_stac.catalogue import Catalogue

# The groups a plot can show. Part B adds the study catalogue's own groups.
GROUPS: dict[str, MeasureGroup] = {CORE_GROUP_ID: CORE_GROUP}


@dataclass
class _Tracks:
    """A plot's tracks, prepared for measuring, and what they were prepared from."""

    version: tuple[int, ...] | None
    plot_hash: str
    motions: dict[str, TrackMotion]
    names: dict[str, str]
    colours: dict[str, str | None]


# One entry per plot file, by its path in its store.
_CACHE: dict[str, _Tracks] = {}
_CACHE_LIMIT = 8


def _prepared(catalogue: Catalogue, item: str) -> _Tracks:
    path = catalogue.plot_path(item)
    key = f"{getattr(catalogue.store, 'root', id(catalogue.store))}/{path}"
    try:
        version = catalogue.store.version(path)
    except (FileNotFoundError, AttributeError):
        version = None
    cached = _CACHE.get(key)
    if cached is not None and version is not None and cached.version == version:
        return cached
    plot_hash = catalogue.history(item).head().plot_hash
    if cached is not None and cached.plot_hash == plot_hash:  # the island changed, not the plot
        cached.version = version
        return cached
    prepared = _tracks_of(catalogue.read_plot(item), version, plot_hash)
    if len(_CACHE) >= _CACHE_LIMIT and key not in _CACHE:
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[key] = prepared
    return prepared


def tote_tracks(plot: models.DebriefFeatureCollection) -> list[dict[str, Any]]:
    """The tracks the analyst can put in the Tote, in plot order."""
    out = []
    for feature in plot.features:
        if feature.properties.kind != "track":
            continue
        entry: dict[str, Any] = {"id": feature.id, "name": feature.properties.name}
        if feature.properties.style:
            entry["colour"] = feature.properties.style.colour
        out.append(entry)
    return out


def measure_groups() -> dict[str, Any]:
    """The measure groups and measures available (CAP-07), for agents and part B's editor."""
    return {
        "groups": [g.to_json() for g in GROUPS.values()],
        "measures": [m.to_json() for m in MEASURES.values()],
    }


def tote(
    catalogue: Catalogue,
    item: str,
    time: str | int,
    view: models.ToteView | dict[str, Any] | None = None,
    revision: str | None = None,
) -> dict[str, Any]:
    """The Tote at a time (a ToteResult as JSON). view says which tracks and which group;
    left out, the plot's island says (none chosen: no rows). revision, an earlier revision
    of the plot shown read-only (an image traced to its plot, SUB-25): the Tote of the plot
    as it was then, rebuilt by replay, so the traced view matches the figure (decision,
    product owner, 16 Oct 2026)."""
    time_ms = parse_utc(time) if isinstance(time, str) else int(time)
    if view is None:
        island, _ = catalogue.read_view(item)
        view = island.tote if island is not None else None
    if isinstance(view, dict):
        view = models.ToteView.model_validate(view)
    tracks = (
        _prepared(catalogue, item) if revision is None else _at_revision(catalogue, item, revision)
    )
    return evaluate(tracks, time_ms, view)


def _at_revision(catalogue: Catalogue, item: str, revision: str) -> _Tracks:
    """A plot's tracks as they were at a revision, prepared once and kept by revision."""
    key = f"{getattr(catalogue.store, 'root', id(catalogue.store))}/{item}@{revision}"
    cached = _CACHE.get(key)
    if cached is not None:
        return cached
    plot, _ = catalogue.revision_shown(item, revision)
    prepared = _tracks_of(plot, None, revision)
    if len(_CACHE) >= _CACHE_LIMIT:
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[key] = prepared
    return prepared


def _tracks_of(
    plot: models.DebriefFeatureCollection, version: tuple[int, ...] | None, plot_hash: str
) -> _Tracks:
    tracks = [f for f in plot.features if f.properties.kind == "track"]
    return _Tracks(
        version,
        plot_hash,
        {t.id: TrackMotion.from_feature(t) for t in tracks},
        {t.id: t.properties.name for t in tracks},
        {t.id: t.properties.style.colour if t.properties.style else None for t in tracks},
    )


def evaluate(tracks: _Tracks, time_ms: int, view: models.ToteView | None) -> dict[str, Any]:
    """The Tote for prepared tracks at a time."""
    chosen = view.measure_group if view is not None and view.measure_group else CORE_GROUP_ID
    group = GROUPS.get(chosen, CORE_GROUP)
    definitions = group_measures(group)
    result: dict[str, Any] = {
        "time": format_utc(time_ms),
        "group": group.to_json(),
        "measures": [d.to_json() for d in definitions],
    }
    if chosen not in GROUPS:
        result["note"] = (
            f"This plot's study has no measure group {chosen!r}, so the Tote shows "
            f"{CORE_GROUP.title}."
        )
    primary_id = view.primary if view is not None else None
    primary_state: TrackState | None = None
    if primary_id:
        row, primary_state = _row(tracks, primary_id, time_ms, definitions, None, own_only=True)
        result["primary"] = row
    result["rows"] = [
        _row(tracks, track, time_ms, definitions, primary_state)[0]
        for track in (view.secondaries or [] if view is not None else [])
        if track != primary_id
    ]
    return result


def _row(
    tracks: _Tracks,
    track: str,
    time_ms: int,
    definitions: list[MeasureDefinition],
    primary: TrackState | None,
    *,
    own_only: bool = False,
) -> tuple[dict[str, Any], TrackState | None]:
    row: dict[str, Any] = {"track": track}
    motion = tracks.motions.get(track)
    if motion is None:
        row.update(status="missing", note="No longer in the plot")
        return row, None
    row["name"] = tracks.names[track]
    if tracks.colours.get(track):
        row["colour"] = tracks.colours[track]
    state = motion.state_at(time_ms)
    if state is None:
        when = motion.start_ms if time_ms < motion.start_ms else motion.end_ms
        verb = "Starts" if time_ms < motion.start_ms else "Ended"
        row.update(status="no_data", note=f"{verb} {format_time(when, DEFAULT_SETTINGS)}")
        return row, None
    row["status"] = "ok"
    values = []
    for definition in definitions:
        if own_only and definition.subject != "own":
            continue
        value = measure(definition, state, primary)
        entry: dict[str, Any] = {"measure": definition.id}
        if value is not None:
            entry.update(value=value, unit=definition.unit)
        values.append(entry)
    row["values"] = values
    return row, state
