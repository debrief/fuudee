"""The playground's Python: Debrief's own libraries, running in the reader's browser.

Pyodide runs this in a Web Worker. Nothing here re-implements Debrief: the
catalogue, history, tools and importers are the same packages the desktop
uses, installed from the wheels this site was built with. The sample exercise
is written into the browser's in-memory file system, so every change, undo and
crash happens there and is gone when the page is closed.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from debrief_io import import_dpf, import_rep
from debrief_schemas import DocumentKind, dump_document, models
from debrief_stac import Base, Catalogue, Changes, HistoryError
from debrief_tools import Registry
from debrief_tools.registry import applies
from debrief_tools.run import ToolRunConflict, ToolRunError, run_tool

ROOT = Path("/play/catalogue")
YOU = models.AgentRef(kind="person", name="you, in the browser")
COLLEAGUE = models.AgentRef(kind="person", name="a colleague")

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


def _steps(item: str) -> list[dict[str, Any]]:
    out = []
    for step in _cat().history(item).steps():
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
    head = history.head()
    presentation, presentation_hash = _cat().read_presentation(item)
    return json.dumps(
        {
            "item": _json(DocumentKind.STAC_ITEM, _cat().read_item(item)),
            "plot": _json(DocumentKind.PLOT, history.plot()),
            "base": {"current": head.current, "plot_hash": head.plot_hash},
            "steps": _steps(item),
            "recovered": recovered,
            "presentation": _json(DocumentKind.PRESENTATION, presentation),
            "presentation_hash": presentation_hash,
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


def crash(item: str, at: str) -> str:
    """Save a note and die part-way: after the step is written, before it is current.

    In the browser the process can't really be killed, so the save is stopped
    at exactly that point, leaving the files as a killed process would.
    """
    store = _cat().store
    real = store.write_text_atomic

    class Killed(Exception):
        pass

    def die_before_the_head(path: str, text: str) -> None:
        if path.endswith("head.json"):
            raise Killed
        real(path, text)

    store.write_text_atomic = die_before_the_head
    try:
        _cat().commit(
            item,
            [_record(YOU, at, "saved-before-the-crash", "Note added just before a crash")],
            Changes(added=[_note(item, "note-crash", "Saved just before the crash", at)]),
        )
    except Killed:
        pass
    finally:
        store.write_text_atomic = real
    return json.dumps({"ok": True})


def colleague(item: str, at: str) -> str:
    """A colleague adds a note to the same plot, as if from another computer (SUB-28)."""
    _cat().commit(
        item,
        [_record(COLLEAGUE, at, "colleague", "Note added by a colleague")],
        Changes(added=[_note(item, "note-colleague", "A colleague's note", at)]),
    )
    return json.dumps({"ok": True})


def import_file(name: str, data: bytes) -> str:
    """Import a REP or legacy .dpf file the reader dropped in, as a new plot."""
    work = Path("/play/uploads")
    work.mkdir(parents=True, exist_ok=True)
    path = work / Path(name).name
    path.write_bytes(bytes(data))
    stem = "".join(c if c.isalnum() or c in "-_." else "-" for c in path.stem).strip("-.") or "plot"
    taken, item_id, n = set(_cat().item_ids()), stem, 2
    while item_id in taken:
        item_id, n = f"{stem}-{n}", n + 1
    importer = import_dpf if path.suffix.lower() in (".dpf", ".xml") else import_rep
    try:
        report = importer(_cat(), path, item_id=item_id, agent=YOU)
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
        }
    )
