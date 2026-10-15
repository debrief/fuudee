"""The playground's Python: Debrief's own libraries, running in the reader's browser.

Pyodide runs this in a Web Worker. Nothing here re-implements Debrief: the
catalogue, history, tools and importers are the same packages the desktop
uses, installed from the wheels this site was built with. The sample exercise
is written into the browser's in-memory file system, so every change, undo and
crash happens there and is gone when the page is closed.
"""

from __future__ import annotations

import json
import math
import shutil
import time
from pathlib import Path
from typing import Any

import debrief_stac.store as store_module
from debrief_config import (
    load_config,
    narrative_answers,
    track_import_mode,
    update_config,
    with_narrative_answers,
    with_track_import_mode,
)
from debrief_io import (
    Choices,
    NoNarrativeError,
    import_document,
    import_dpf,
    import_narrative,
    import_rep,
    preview_narrative,
)
from debrief_io.document_import import SUFFIXES as DOCUMENT_SUFFIXES
from debrief_io.importer import rep_track_names
from debrief_kernel.geodesy import Position, destination
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import DocumentKind, dump_document, models
from debrief_stac import (
    Base,
    Catalogue,
    CatalogueError,
    Changes,
    ConfirmationNeeded,
    Conflict,
    History,
    HistoryError,
)
from debrief_stac.fixes import describe_largest
from debrief_stac.tote import tote as tote_at
from debrief_tools import Registry
from debrief_tools.registry import applies
from debrief_tools.run import ToolRunConflict, ToolRunError, run_tool

ROOT = Path("/play/catalogue")
YOU = models.AgentRef(kind="person", name="you, in the browser")
COLLEAGUE = models.AgentRef(kind="person", name="a colleague")
PLAYGROUND = models.AgentRef(kind="software_agent", name="the playground")

registry = Registry.discover()
if not registry.tools:  # no entry points in this install: load the core library by name
    registry = Registry.discover(["debrief_tools.core"])
catalogue: Catalogue | None = None


def _json(kind: DocumentKind, model: Any) -> Any:
    return json.loads(dump_document(kind, model))


def _cat() -> Catalogue:
    assert catalogue is not None
    return catalogue


def setup() -> str:
    global catalogue
    catalogue = Catalogue.open(ROOT)
    return plots()


def plots() -> str:
    return json.dumps(
        [{"id": s.item_id, "title": s.title or s.item_id} for s in _cat().summaries()]
    )


def tools() -> str:
    return json.dumps(
        [_json(DocumentKind.TOOL_DECLARATION, t.declaration) for t in registry.tools.values()]
    )


def offered(kinds_json: str) -> str:
    kinds = json.loads(kinds_json)
    return json.dumps([n for n, t in registry.tools.items() if applies(t.declaration, kinds)])


def _steps(history: History) -> list[dict[str, Any]]:
    out = []
    for step in history.steps():
        first = step.records[0]
        out.append(
            {
                "seq": step.seq,
                "status": step.status,
                "kind": str(first.kind),
                "tool": first.tool.name if first.tool else None,
                "agent": ", ".join(dict.fromkeys(r.agent.name for r in step.records)),
                "at": first.ended_at or first.started_at,
                "records": len(step.records),
                "notes": list(first.notes or []),
            }
        )
    return out


def open_plot(item: str) -> str:
    """The plot, after finishing any change a crash interrupted (NFR-10)."""
    history = _cat().history(item)
    recovered = history.recover()
    _cat().migrate_presentation(item, YOU)  # a retired presentation.json, as the service does
    head = history.head()
    _, view_hash = _cat().read_view(item)
    return json.dumps(
        {
            "item": _json(DocumentKind.STAC_ITEM, _cat().read_item(item)),
            # With its view (the island): the plot's time window, outside its history.
            "plot": _json(DocumentKind.PLOT, history.plot()),
            "base": {"current": head.current, "plot_hash": head.plot_hash},
            "view_hash": view_hash,
            "steps": _steps(history),
            "recovered": recovered,
        }
    )


def run(item: str, request_json: str) -> str:
    """Run a tool exactly as the tool service does, and record what it changed."""
    request = json.loads(request_json)
    base = Base(**request["base"]) if request.get("base") else None
    state = None
    if request.get("state"):
        from debrief_schemas import load_document

        state = load_document(DocumentKind.SHARED_STATE, json.dumps(request["state"]))
    try:
        outcome = run_tool(
            registry,
            _cat(),
            item,
            request["name"],
            request["selection"],
            request.get("parameters") or {},
            YOU,
            on_conflict=request.get("on_conflict") or "refuse",
            base=base,
            state=state,
        )
    except ToolRunConflict as conflict:
        return json.dumps({"error": str(conflict), "conflict": {"mergeable": conflict.mergeable}})
    except ToolRunError as error:
        return json.dumps({"error": str(error)})
    return json.dumps(
        {
            "result": _json(DocumentKind.TOOL_RESULT, outcome.result),
            "changed": outcome.changed,
            "new_item": outcome.new_item,
        }
    )


def move(item: str, how: str, step: int | None = None) -> str:
    """Undo, redo or go to a step: replay to it (SUB-21)."""
    history = _cat().history(item)
    try:
        if how == "undo":
            history.undo()
        elif how == "redo":
            history.redo()
        else:
            history.goto(int(step))
    except HistoryError as error:
        return json.dumps({"error": str(error)})
    return json.dumps({"ok": True})


def restyle(item: str, request_json: str) -> str:
    """Colour tracks, or hide or show features: a recorded, undoable step like any
    change (SUB-22, decision 12 Oct), as debrief/set_colour and debrief/set_hidden do."""
    request = json.loads(request_json)
    base = Base(**request["base"]) if request.get("base") else None
    try:
        if "colour" in request:
            _cat().set_colour(
                item,
                request["features"],
                request["colour"],
                YOU,
                base,
                colour_name=request.get("colour_name"),
            )
        else:
            _cat().set_hidden(item, request["features"], bool(request["hidden"]), YOU, base)
    except Conflict:
        return json.dumps({"error": "The plot was changed elsewhere, so nothing was changed."})
    except (CatalogueError, HistoryError) as error:
        return json.dumps({"error": str(error)})
    return json.dumps({"ok": True})


def annotate(item: str, request_json: str) -> str:
    """Add, change or delete annotations, or show or remove the north arrow: each a
    recorded, undoable step (CAP-03), as debrief/add_annotation, debrief/edit_annotation,
    debrief/delete_annotations and debrief/set_north_arrow do."""
    request = json.loads(request_json)
    base = Base(**request["base"]) if request.get("base") else None
    change = request["change"]
    feature = None
    try:
        if change["kind"] == "add":
            _, feature = _cat().add_annotation(item, change["annotation"], YOU, base)
        elif change["kind"] == "edit":
            _cat().edit_annotation(item, change["feature"], change["annotation"], YOU, base)
        elif change["kind"] == "delete":
            _cat().delete_annotations(item, change["features"], YOU, base)
        else:
            _cat().set_north_arrow(item, bool(change["shown"]), YOU, base)
    except Conflict:
        return json.dumps({"error": "The plot was changed elsewhere, so nothing was changed."})
    except (CatalogueError, HistoryError) as error:
        return json.dumps({"error": str(error)})
    return json.dumps({"ok": True, "feature": feature})


def narrative(item: str, request_json: str, data: bytes | None = None) -> str:
    """Add, change or delete narrative entries, or read a REP file's narrative lines or a
    Word or PDF document's entries into the plot, with the reader's choices: each a
    recorded, undoable step (CAP-19, CAP-20), as debrief/add_narrative,
    debrief/edit_narrative, debrief/delete_narrative and debrief/import_narrative do."""
    request = json.loads(request_json)
    base = Base(**request["base"]) if request.get("base") else None
    change = request["change"]
    out: dict[str, Any] = {"ok": True}
    try:
        if change["kind"] == "add":
            _, out["feature"] = _cat().add_narrative(item, change["entry"], YOU, base)
        elif change["kind"] == "edit":
            _cat().edit_narrative(item, change["feature"], change["entry"], YOU, base)
            out["feature"] = change["feature"]
        elif change["kind"] == "delete":
            _cat().delete_narrative(item, change["features"], YOU, base)
        else:
            done = import_narrative(
                _cat(),
                item,
                _upload(change["name"], data or b""),
                YOU,
                base,
                choices=Choices.of(change.get("choices")),
            )
            out.update(
                entries=done.entries, sources=done.sources, omitted=done.omitted, notes=done.notes
            )
    except Conflict:
        return json.dumps({"error": "The plot was changed elsewhere, so nothing was changed."})
    except (CatalogueError, HistoryError, NoNarrativeError, OSError, ValueError) as error:
        return json.dumps({"error": str(error)})
    return json.dumps(out)


def narrative_preview(item: str | None, name: str, data: bytes) -> str:
    """What a narrative file holds, before it is read in, so the reader can choose what
    legacy Debrief asked: types, the plot's period, tracks; and whether it was read into
    the plot before, or has entries the plot has already (debrief/preview_narrative)."""
    try:
        found = _upload(name, data)
        if item:
            return json.dumps(preview_narrative(found, catalogue=_cat(), item_id=item))
        return json.dumps(preview_narrative(found))
    except (CatalogueError, HistoryError, NoNarrativeError, OSError) as error:
        return json.dumps({"error": str(error)})


def track(item: str, request_json: str) -> str:
    """Move, rotate, shear, stretch, split or merge tracks, move a single fix or plot a
    track by dead reckoning: each a recorded, undoable step (CAP-01, CAP-02), as
    debrief/edit_track, debrief/split_track and debrief/merge_tracks do."""
    request = json.loads(request_json)
    base = Base(**request["base"]) if request.get("base") else None
    change = request["change"]
    out: dict[str, Any] = {"ok": True}
    try:
        if change["kind"] == "edit":
            _cat().edit_track(
                item,
                change["feature"],
                change["edit"],
                YOU,
                base,
                current_time=change.get("current_time"),
            )
        elif change["kind"] == "split":
            _, out["features"] = _cat().split_track(
                item, change["feature"], change["at"], YOU, base, names=change.get("names")
            )
        else:
            _, out["feature"], out["notes"] = _cat().merge_tracks(
                item, change["features"], YOU, base, name=change.get("name")
            )
    except Conflict:
        return json.dumps({"error": "The plot was changed elsewhere, so nothing was changed."})
    except ConfirmationNeeded as error:
        # Would lose what the reader made: they confirm, and it is sent again confirming.
        return json.dumps({"error": str(error), "confirm": True})
    except (CatalogueError, HistoryError) as error:
        return json.dumps({"error": str(error)})
    return json.dumps(out)


def clean(item: str, request_json: str) -> str:
    """Find a track's jumps and remove those confirmed, preview smoothing and apply it, or
    colour, label or comment on a fix (CAP-01, EXT-14): finding and previewing change
    nothing; each change is one recorded, undoable step, as debrief/find_jumps,
    debrief/remove_jumps, debrief/preview_smoothing, debrief/smooth_track and
    debrief/mark_fix do."""
    request = json.loads(request_json)
    base = Base(**request["base"]) if request.get("base") else None
    change = request["change"]
    kind, feature = change["kind"], change["feature"]
    period = (change["period"]["start"], change["period"]["end"]) if change.get("period") else None
    threshold = change.get("threshold")
    speed = Quantity(float(threshold["value"]), threshold["unit"]) if threshold else None
    out: dict[str, Any] = {"ok": True}
    try:
        if kind == "find_jumps":
            used, median, jumps = _cat().find_jumps(
                item, feature, threshold=speed, period=period, base=base
            )
            out["threshold"] = {"value": used.value, "unit": used.unit}
            out["median_speed"] = {"value": median.value, "unit": median.unit} if median else None
            out["jumps"] = [
                {
                    "time": j.time,
                    "position": list(j.position),
                    "speed": None
                    if math.isinf(j.speed_kn)
                    else {"value": j.speed_kn, "unit": "[kn_i]"},
                    "since": j.since,
                }
                for j in jumps
            ]
        elif kind == "remove_jumps":
            _cat().remove_jumps(item, feature, change["times"], YOU, base, threshold=speed)
        elif kind in ("preview_smoothing", "smooth"):
            if kind == "smooth":
                done = _cat().smooth_track(
                    item, feature, int(change["window"]), YOU, base, period=period
                )
                smoothing = done[1] if done else None
            else:
                after, smoothing = _cat().smoothing_preview(
                    item, feature, int(change["window"]), period=period, base=base
                )
                out["preview"] = after.geometry.model_dump(mode="json")
            if smoothing is not None:
                out["moved"] = smoothing.moved
                out["summary"] = describe_largest(smoothing)
        else:
            _cat().mark_fix(
                item,
                feature,
                change["time"],
                change["changes"],
                YOU,
                base,
                colour_name=change.get("colour_name"),
            )
    except Conflict:
        return json.dumps({"error": "The plot was changed elsewhere, so nothing was changed."})
    except (CatalogueError, HistoryError) as error:
        return json.dumps({"error": str(error)})
    return json.dumps(out)


def glitches(item: str, feature: str) -> str:
    """Put three GPS glitches into a track, to try jump removal on: two fixes in a row
    three miles off to the north, and one four miles off to the south. Recorded as a step
    of its own, by the playground, so it is never mistaken for real data and Undo takes
    it out."""
    plot = _cat().read_plot(item)
    track = next((f for f in plot.features if f.id == feature), None)
    if track is None or track.properties.kind != "track" or len(track.properties.times) < 12:
        return json.dumps({"error": "Select a track of at least 12 fixes to put glitches in."})
    n = len(track.properties.times)
    positions = [list(p) for p in track.geometry.coordinates]
    for index, bearing, metres in (
        (n // 3, 0, 3 * 1852),
        (n // 3 + 1, 0, 3 * 1852),
        (2 * n // 3, 180, 4 * 1852),
    ):
        lon, lat = positions[index]
        to = destination(Position(lon, lat), Quantity(bearing, "deg"), Quantity(metres, "m"))
        positions[index] = [to.longitude, to.latitude]
    glitched = track.model_copy(
        update={"geometry": track.geometry.model_copy(update={"coordinates": positions})}
    )
    at = format_utc(int(time.time() * 1000))
    record = models.ProvRecord(
        id=f"edit-glitches-{at}",
        kind="edit",
        started_at=at,
        agent=PLAYGROUND,
        notes=[
            f"GPS glitches put into {track.properties.name}",
            "Three fixes moved off the track, to try jump removal on",
        ],
    )
    _cat().commit(item, [record], Changes(modified=[glitched]))
    return json.dumps({"ok": True})


def set_view(item: str, request_json: str) -> str:
    """Save the plot's view (its island), as debrief/set_view does: never recorded,
    never undone (SUB-22). A view changed since hash was read is refused (SUB-28)."""
    request = json.loads(request_json)
    try:
        view_hash = _cat().write_view(item, request["view"], request["hash"], agent=YOU)
    except Conflict:
        return json.dumps({"conflict": True})
    except (CatalogueError, HistoryError, ValueError) as error:
        return json.dumps({"error": str(error)})
    head = _cat().history(item).head()
    return json.dumps(
        {"view_hash": view_hash, "base": {"current": head.current, "plot_hash": head.plot_hash}}
    )


def tote(item: str, request_json: str) -> str:
    """The Tote at one time, as debrief/tote returns it (CAP-06): asked again at each
    time, so the plot's tracks are prepared once and kept while it is unchanged. Says
    how long the computation took, for the latency check (NFR-04)."""
    request = json.loads(request_json)
    started = time.perf_counter()
    try:
        result = tote_at(_cat(), item, request["time"], request.get("tote"))
    except (CatalogueError, HistoryError, ValueError) as error:
        return json.dumps({"error": str(error)})
    return json.dumps({"tote": result, "compute_ms": (time.perf_counter() - started) * 1000})


def colleague_window(item: str) -> str:
    """A colleague narrows the time window to its last third, as if from another
    computer: the plot file changes, its history does not."""
    view, view_hash = _cat().read_view(item)
    extent = _cat().read_item(item).properties
    shown = view.time_window if view and view.time_window else None
    start = shown.start if shown else extent.start_datetime
    end = shown.end if shown else extent.end_datetime
    if start is None or end is None:
        return json.dumps({"error": "The plot has no period to set a window in."})
    first, last = parse_utc(start), parse_utc(end)
    window = {"start": format_utc(first + (last - first) * 2 // 3 // 1000 * 1000), "end": end}
    current = view.model_dump(mode="json", exclude_none=True) if view else {}
    _cat().write_view(item, {**current, "time_window": window}, view_hash, agent=COLLEAGUE)
    return json.dumps({"ok": True})


def _note(item: str, prefix: str, name: str, at: str) -> models.AnnotationFeature:
    taken = {f.id for f in _cat().read_plot(item).features}
    n = 1
    while f"{prefix}-{n}" in taken:
        n += 1
    return models.AnnotationFeature(
        type="Feature",
        id=f"{prefix}-{n}",
        geometry=None,
        properties=models.AnnotationProperties(kind="annotation", style="note", name=name, time=at),
    )


def _record(agent: models.AgentRef, at: str, what: str, note: str) -> models.ProvRecord:
    """An edit's record; its note is what the History panel calls the step."""
    return models.ProvRecord(
        id=f"edit-{what}-{at}", kind="edit", started_at=at, agent=agent, notes=[note]
    )


def crash(item: str, at: str, when: str | None = None) -> str:
    """Save a note and die part-way: the new plot file is written in full beside the
    old one, but the process dies before it replaces it (NFR-11).

    In the browser the process can't really be killed, so the save is stopped
    at exactly that point, leaving the files as a killed process would: the old
    plot file, whole, and the new one under a temporary name.
    """
    real = store_module._replace

    class Killed(Exception):
        pass

    def die_before_the_rename(temporary, target) -> None:
        # What a killed process leaves: its temporary file, which nobody cleans up.
        shutil.copyfile(temporary, f"{temporary}.left.tmp")
        raise Killed

    store_module._replace = die_before_the_rename
    try:
        _cat().commit(
            item,
            [_record(YOU, at, "saved-before-the-crash", "Note added just before a crash")],
            Changes(added=[_note(item, "note-crash", "Saved just before the crash", when or at)]),
        )
    except Killed:
        pass
    finally:
        store_module._replace = real
    return json.dumps({"ok": True})


def colleague(item: str, at: str, when: str | None = None) -> str:
    """A colleague adds a note to the same plot, as if from another computer (SUB-28).

    The change is made at, now; the note is about when, a time in the plot (the
    reader's current time), so the plot's period stays the exercise's."""
    _cat().commit(
        item,
        [_record(COLLEAGUE, at, "colleague", "Note added by a colleague")],
        Changes(added=[_note(item, "note-colleague", "A colleague's note", when or at)]),
    )
    return json.dumps({"ok": True})


# The reader's own settings, as debrief-config keeps an analyst's: here, how tracks imported
# are plotted once they chose "Use this choice for future imports". User state, held in the
# page's settings file, never in the catalogue or a plot; the importer is given the answer.
SETTINGS = Path("/play/settings/config.json")


def import_mode() -> str:
    """ask, otg or dr: how tracks imported are plotted, remembered or not."""
    return track_import_mode(load_config(SETTINGS))


def set_import_mode(mode: str) -> str:
    """Remember a choice for future imports, or, with ask, clear it."""
    SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    return track_import_mode(update_config(lambda c: with_track_import_mode(c, mode), SETTINGS))


def narrative_answers_for(dialect: str) -> str:
    """The reader's last answers for narrative documents of this dialect, as the page's
    settings keep them (debrief-config's narrative_import): {"answers": ...} or {}."""
    found = narrative_answers(load_config(SETTINGS), dialect)
    if found is None:
        return json.dumps({})
    tracks = {t.platform: t.track for t in found.tracks or []}
    answers = {
        "skipTypes": list(found.skip_types or []),
        "withinPeriod": bool(found.within_period),
        "tracks": tracks,
    }
    return json.dumps({"answers": answers})


def set_narrative_answers(dialect: str, answers_json: str) -> str:
    """Remember the reader's answers for documents of this dialect, for next time."""
    answers = json.loads(answers_json)
    SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    update_config(
        lambda c: with_narrative_answers(
            c,
            dialect,
            skip_types=answers.get("skipTypes") or [],
            within_period=bool(answers.get("withinPeriod")),
            tracks=answers.get("tracks") or {},
        ),
        SETTINGS,
    )
    return json.dumps({"ok": True})


def _upload(name: str, data: bytes) -> Path:
    work = Path("/play/uploads")
    work.mkdir(parents=True, exist_ok=True)
    path = work / Path(name).name
    path.write_bytes(bytes(data))
    return path


def rep_tracks(name: str, data: bytes) -> str:
    """The tracks a REP file would import, to ask how each is plotted; none for others."""
    path = _upload(name, data)
    if path.suffix.lower() in (".dpf", ".xml", ".geojson", ".json", *DOCUMENT_SUFFIXES):
        return json.dumps([])
    try:
        return json.dumps(rep_track_names(path))
    except Exception:  # noqa: BLE001 - the import says what is wrong with the file
        return json.dumps([])


def import_file(
    name: str,
    data: bytes,
    modes_json: str | None = None,
    remembered: str | None = None,
    track_name: str | None = None,
) -> str:
    """Import a REP or legacy .dpf file the reader dropped in, as a new plot, each REP
    track plotted as modes_json says (asked, or the reader's remembered choice); a Word or
    PDF document as a plot of its narrative (or an ASW document's track, named track_name);
    or add a Debrief plot file (.geojson) with its whole history, as a colleague would."""
    path = _upload(name, data)
    stem = "".join(c if c.isalnum() or c in "-_." else "-" for c in path.stem).strip("-.") or "plot"
    taken, item_id, n = set(_cat().item_ids()), stem, 2
    while item_id in taken:
        item_id, n = f"{stem}-{n}", n + 1
    if path.suffix.lower() in (".geojson", ".json"):
        try:
            added = _cat().add_plot_file(path, YOU)
        except Exception as error:  # noqa: BLE001 - shown to the reader as the failure
            return json.dumps({"error": f"{path.name} could not be added: {error}"})
        steps = len(_cat().history(added).steps())
        return json.dumps({"item": added, "plot_file": True, "steps": steps})
    modes = json.loads(modes_json) if modes_json else None
    try:
        if path.suffix.lower() in (".dpf", ".xml"):
            report = import_dpf(_cat(), path, item_id=item_id, agent=YOU)
        elif path.suffix.lower() in DOCUMENT_SUFFIXES:
            report = import_document(
                _cat(), path, item_id=item_id, agent=YOU, track_name=track_name
            )
        else:
            report = import_rep(
                _cat(), path, item_id=item_id, agent=YOU, modes=modes, remembered=remembered
            )
    except Exception as error:  # noqa: BLE001 - shown to the reader as the import's failure
        return json.dumps({"error": f"{path.name} could not be imported: {error}"})
    return json.dumps(
        {
            "item": report.item_id,
            "tracks": report.tracks,
            "fixes": report.fixes,
            "annotations": getattr(report, "annotations", 0),
            "narrative_entries": getattr(report, "narrative_entries", 0),
            "omitted": report.omitted,
            "notes": report.notes,
        }
    )
