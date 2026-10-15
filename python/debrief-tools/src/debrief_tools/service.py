"""The tool service: MCP over HTTP, per user, loopback only, with a session token.

The protocol is MCP's Streamable HTTP transport (JSON-RPC 2.0, one POST per
request, JSON responses), so the VS Code extension and any MCP-capable agent
use the same tools (TL-01, TL-17). Debrief adds methods of its own, named
debrief/...: debrief/tools_for_selection, so the offering rule lives in
Python (TL-08); stores, catalogues and import (REP, legacy .dpf, Word and PDF documents);
adding a plot
file received from a colleague, with its whole history (debrief/add_plot_file); a plot's history
(debrief/open, debrief/history, debrief/undo, debrief/redo, debrief/goto),
so undo is the same for the extension and an agent (SUB-21); colour and hiding,
recorded in that history like any change (debrief/set_colour, debrief/set_hidden);
annotations added, changed and deleted by hand, and the north arrow, recorded the
same way (debrief/add_annotation, debrief/edit_annotation, debrief/delete_annotations,
debrief/set_north_arrow); narrative entries on one Zulu time axis, read and filtered
(debrief/narrative) and added, changed, deleted or read in from a REP file's narrative
lines, recorded the same way (debrief/add_narrative, debrief/edit_narrative,
debrief/delete_narrative, debrief/import_narrative), Word and PDF narrative among them,
in legacy Debrief's dialects, what a file holds said first so the analyst can choose
(debrief/preview_narrative); tracks moved, rotated, sheared,
stretched, split and merged by hand, single fixes moved and tracks plotted by dead
reckoning (move_fix and set_plotting_mode), recorded the same way (debrief/edit_track,
debrief/split_track, debrief/merge_tracks); tracks cleaned,
what would change shown first (debrief/find_jumps, debrief/preview_smoothing) and then
changed, recorded the same way (debrief/remove_jumps, debrief/smooth_track), and fixes
given a colour, label or comment of their own (debrief/mark_fix);
and the plot's view, its island, kept in the plot file outside its history
(debrief/set_view; debrief/open returns it) (SUB-22, decision 12 Oct); and the Tote:
measures between a primary track and its secondaries at one time
(debrief/tote), and the measure groups it can show (debrief/measure_groups),
reading only (CAP-06, CAP-07). Which tracks the Tote compares is in the island,
set with debrief/set_view like the time window (decision, 14 Oct 2026).

Security (SEC-06 to SEC-08):
- runs as the user who started it, so it can read only what they can;
- listens on 127.0.0.1 only;
- every request needs the per-session token the extension issued at start-up,
  passed in DEBRIEF_TOOL_TOKEN (an environment variable, not an argument,
  so other users cannot read it from the process list);
- requests from a browser (any Origin header) and with an unexpected Host are
  refused, which defeats DNS rebinding;
- tools act only on stores in the user's configuration, by id;
- tool code runs in a worker process (worker.py), so a tool that hangs,
  exits or crashes fails its own call and nothing else (TL-03).
"""

from __future__ import annotations

import hmac
import json
import logging
import math
import os
import re
import socket
import sys
import time
from importlib.metadata import version
from pathlib import Path
from typing import Any

from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from debrief_config import ConfigError, add_store, load_config, update_config
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
from debrief_io.documents import sniff
from debrief_io.importer import rep_track_names
from debrief_kernel.time import parse_utc
from debrief_kernel.units import IncompatibleUnitsError, Quantity
from debrief_schemas import (
    DebriefFeatureCollection,
    DocumentKind,
    dump_document,
    load_document,
    models,
)
from debrief_schemas.documents import DocumentValidationError, load_view
from debrief_stac import (
    Base,
    Catalogue,
    CatalogueError,
    ConfirmationNeeded,
    Conflict,
    HistoryError,
    NewerSchemaError,
    narrative,
)
from debrief_stac.fixes import describe_largest
from debrief_stac.tote import measure_groups, tote
from debrief_tools import diagnostics
from debrief_tools.registry import applies
from debrief_tools.worker import ToolWorker

PROTOCOL_VERSION = "2025-06-18"
SUPPORTED_VERSIONS = ("2025-06-18", "2025-03-26")
MAX_BODY_BYTES = 10 * 1024 * 1024
DEFAULT_TIMEOUT_S = 120.0
MIN_TOKEN_LENGTH = 32
log = logging.getLogger("debrief_tools")


def _is_plot_file(path: Path) -> bool:
    """A legacy plot file: a .dpf, or an .xml file whose root element is a plot.

    Legacy Debrief also saves plots as .xml. Other XML is not sent to the plot
    importer; the first kilobyte is enough to see the root element.
    """
    suffix = path.suffix.lower()
    if suffix == ".dpf":
        return True
    if suffix != ".xml":
        return False
    with path.open("rb") as stream:
        head = stream.read(1024)
    return re.search(rb"<(?:[A-Za-z_][\w.-]*:)?plot[\s>/]", head) is not None


def _is_document(path: Path) -> bool:
    """A Word or PDF document, by its name or its first bytes."""
    if path.suffix.lower() in DOCUMENT_SUFFIXES:
        return True
    with path.open("rb") as stream:
        return sniff(stream.read(1024)) is not None


class RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL = -32600, -32601, -32602, -32603
CONFLICT = -32001  # the plot changed since the caller's base: open it again (SUB-28)
NEWER_SCHEMA = -32002  # would write a newer schema into the catalogue: ask, then allow (SUB-35)
# would lose what the analyst made: ask, then send again confirming (a track changed while
# plotted by dead reckoning, plotted over the ground: discard_dr_changes)
NEEDS_CONFIRMATION = -32003
CONFIRM_HOW = "To go ahead, send the change again with discard_dr_changes: true."
# Named groups, not slices of one list: a method added to one group cannot shift another.
READING_METHODS = ("debrief/open", "debrief/history", "debrief/narrative")
STEP_METHODS = ("debrief/undo", "debrief/redo", "debrief/goto")
PRESENTATION_METHODS = ("debrief/set_colour", "debrief/set_hidden", "debrief/set_view")
ANNOTATION_METHODS = (
    "debrief/add_annotation",
    "debrief/edit_annotation",
    "debrief/delete_annotations",
    "debrief/set_north_arrow",
)
TRACK_METHODS = ("debrief/edit_track", "debrief/split_track", "debrief/merge_tracks")
# Narrative entries, each change one step (CAP-20); and a narrative read into an open plot.
NARRATIVE_METHODS = (
    "debrief/add_narrative",
    "debrief/edit_narrative",
    "debrief/delete_narrative",
    "debrief/import_narrative",
)
# Cleaning tracks: what would change is shown first (read), then changed as one step (write).
CHECKING_METHODS = ("debrief/find_jumps", "debrief/preview_smoothing")
CLEANING_METHODS = ("debrief/remove_jumps", "debrief/smooth_track", "debrief/mark_fix")
WRITING_METHODS = (
    STEP_METHODS
    + PRESENTATION_METHODS
    + ANNOTATION_METHODS
    + NARRATIVE_METHODS
    + TRACK_METHODS
    + CLEANING_METHODS
)
HISTORY_METHODS = READING_METHODS + CHECKING_METHODS + WRITING_METHODS
# The Tote reads a plot at one time; it never changes it, and is asked again at each time.
TOTE_METHODS = ("debrief/tote", "debrief/measure_groups")
KNOWN_METHODS = frozenset(
    (
        "initialize",
        "ping",
        "tools/list",
        "tools/call",
        "debrief/tools_for_selection",
        "debrief/stores",
        "debrief/create_catalogue",
        "debrief/import_rep",
        "debrief/rep_tracks",
        "debrief/preview_narrative",
        "debrief/add_plot_file",
        *TOTE_METHODS,
        *HISTORY_METHODS,
    )
)


_QUANTITY = {
    "type": "object",
    "required": ["value", "unit"],
    "properties": {"value": {"type": "number"}, "unit": {"type": "string"}},
}


def _parameter_schema(param: models.ParameterDeclaration) -> dict[str, Any]:
    kind = str(param.kind)
    schema: dict[str, Any] = {
        "number": {"type": "number"},
        "integer": {"type": "integer"},
        "string": {"type": "string"},
        "boolean": {"type": "boolean"},
        "choice": {"type": "string", "enum": param.choices or []},
        "quantity": {**_QUANTITY, "description": f"A {param.quantity_kind} with a UCUM unit"},
        "time": {"type": "string", "description": "UTC, such as 2026-10-11T09:30:00.000Z"},
    }[kind]
    schema = {**schema, "title": param.title}
    if param.explanation:
        schema["description"] = " ".join(
            filter(None, [param.explanation, schema.get("description")])
        )
    return schema


def _input_schema(declaration: models.ToolDeclaration) -> dict[str, Any]:
    """The arguments an MCP client passes to tools/call for this tool."""
    params = declaration.parameters or []
    return {
        "type": "object",
        "required": ["store", "item", "selection", "agent"],
        "properties": {
            "store": {"type": "string", "description": "Store id, from debrief/stores."},
            "item": {"type": "string", "description": "Plot (catalogue item) id."},
            "selection": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ids of the selected features, in order.",
            },
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    p.name for p in params if p.required is not False and p.default is None
                ],
                "properties": {p.name: _parameter_schema(p) for p in params},
            },
            "agent": {
                "type": "object",
                "required": ["kind", "name"],
                "properties": {
                    "kind": {"enum": ["person", "software_agent"]},
                    "name": {"type": "string"},
                    "model": {"type": "string"},
                },
                "description": "Who is running the tool, recorded in provenance (SUB-24).",
            },
        },
    }


def _describe(declaration: models.ToolDeclaration, raw: dict[str, Any]) -> dict[str, Any]:
    description = declaration.explanation
    if declaration.judgement:
        description += f" {declaration.judgement}"
    return {
        "name": declaration.name,
        "title": declaration.title,
        "description": description,
        "inputSchema": _input_schema(declaration),
        "_meta": {"debrief/declaration": raw},
    }


class ToolService:
    def __init__(self, worker: ToolWorker, config_path: str | None = None):
        self.worker = worker
        self.config_path = config_path
        self.refresh()

    def refresh(self) -> None:
        """Ask the worker which tools its libraries declare."""
        described = self.worker.describe()
        self.raw = {d["name"]: d for d in described["tools"]}
        self.declarations = {
            name: load_document(DocumentKind.TOOL_DECLARATION, raw)
            for name, raw in self.raw.items()
        }
        self.unavailable = described["unavailable"]

    def handle(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if method == "initialize":
            requested = params.get("protocolVersion")
            return {
                "protocolVersion": requested
                if requested in SUPPORTED_VERSIONS
                else PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "debrief-tools", "version": version("debrief-tools")},
                "instructions": (
                    "Debrief analysis tools. Each acts on features of one plot in one of the "
                    "user's stores; list stores with debrief/stores. Say who you are in agent."
                ),
            }
        if method == "ping":
            return {}
        if method == "tools/list":
            return {
                "tools": [_describe(d, self.raw[n]) for n, d in self.declarations.items()],
                "_meta": {"debrief/unavailable": self.unavailable},
            }
        if method == "tools/call":
            return self._call(params)
        if method == "debrief/tools_for_selection":
            kinds = params.get("kinds")
            if not isinstance(kinds, list) or not all(isinstance(k, str) for k in kinds):
                raise RpcError(INVALID_PARAMS, "kinds must be a list of feature kinds")
            return {"tools": [n for n, d in self.declarations.items() if applies(d, kinds)]}
        if method == "debrief/stores":
            config = self._config()
            return {
                "stores": [
                    {"id": s.id, "title": s.title, "read_only": bool(s.read_only)}
                    for s in config.stores
                ]
            }
        if method == "debrief/create_catalogue":
            return self._create_catalogue(params)
        if method in ("debrief/import", "debrief/import_rep"):
            return self._import(params)
        if method == "debrief/add_plot_file":
            return self._add_plot_file(params)
        if method == "debrief/rep_tracks":
            return self._rep_tracks(params)
        if method == "debrief/preview_narrative":
            return self._preview_narrative(params)
        if method == "debrief/measure_groups":
            return measure_groups()
        if method == "debrief/tote":
            return self._tote(params)
        if method in HISTORY_METHODS:
            return self._history(method, params)
        raise RpcError(METHOD_NOT_FOUND, f"Unknown method {method}")

    def _tote(self, params: dict[str, Any]) -> dict[str, Any]:
        """The Tote at one time (CAP-06): a ToteResult. tote, a ToteView, says which
        tracks and which measure group; left out, the plot's island says. One call per
        change of current time, so it reads nothing it need not (NFR-04)."""
        item, time, view = params.get("item"), params.get("time"), params.get("tote")
        if not isinstance(item, str) or not isinstance(time, str):
            raise RpcError(INVALID_PARAMS, "tote needs a store, an item and a time")
        try:
            time_ms = parse_utc(time)
        except ValueError as error:
            raise RpcError(INVALID_PARAMS, f"time: {error}") from None
        if view is not None:
            if not isinstance(view, dict):
                raise RpcError(INVALID_PARAMS, "tote must be {primary, secondaries, measure_group}")
            try:
                view = load_view({"tote": view}).tote
            except DocumentValidationError as error:
                raise RpcError(INVALID_PARAMS, "; ".join(error.problems)) from None
        store = self._store(params.get("store"), writing=False)
        try:
            catalogue = Catalogue.open(Path(store.location))
            return tote(catalogue, item, time_ms, view)
        except FileNotFoundError:
            raise RpcError(INVALID_PARAMS, f"There is no plot {item!r} in {store.title}.") from None
        except (CatalogueError, HistoryError, OSError, ValueError) as error:
            raise RpcError(INVALID_PARAMS, str(error)) from None

    def _config(self) -> models.UserConfig:
        return load_config(self.config_path) if self.config_path else load_config()

    def _create_catalogue(self, params: dict[str, Any]) -> dict[str, Any]:
        """Create an empty catalogue in a folder and add it to the user's configuration."""
        location, title = params.get("location"), params.get("title")
        if not isinstance(location, str) or not isinstance(title, str) or not title.strip():
            raise RpcError(INVALID_PARAMS, "create_catalogue needs a location and a title")
        folder = Path(location)
        if folder.exists() and any(folder.iterdir()) and not (folder / "catalog.json").exists():
            raise RpcError(INVALID_PARAMS, f"{folder} is not empty. Choose an empty folder.")
        try:
            if not (folder / "catalog.json").exists():
                folder.mkdir(parents=True, exist_ok=True)
                identifier = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "catalogue"
                Catalogue.create(folder, identifier, title.strip(), "")
            store = {}

            def add(config: models.UserConfig) -> models.UserConfig:
                changed, added = add_store(config, title=title.strip(), location=str(folder))
                store["id"] = added.id
                return changed

            update_config(add, Path(self.config_path) if self.config_path else None)
        except (CatalogueError, ConfigError, OSError) as error:
            raise RpcError(INVALID_PARAMS, str(error)) from None
        return {"store": store["id"]}

    def _store(self, store_id: Any, *, writing: bool) -> models.KnownStore:
        store = next((s for s in self._config().stores if s.id == store_id), None)
        if store is None:
            raise RpcError(
                INVALID_PARAMS, f"There is no catalogue {store_id!r} in your configuration."
            )
        if writing and store.read_only:
            raise RpcError(INVALID_PARAMS, f"{store.title} is read-only.")
        return store

    def _history(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """A plot's history and view: open (recovering an interrupted change), list,
        undo, redo, goto, colour, hide; and set_view, which changes the plot's island.

        Every change returns the new base, which the caller passes back with its
        next change, so one made meanwhile elsewhere is never overwritten (SUB-28).
        The view has a hash of its own for the same purpose: changing it never
        moves the base, and changing the plot never moves the view's hash.
        """
        item, base = params.get("item"), params.get("base")
        if not isinstance(item, str):
            raise RpcError(INVALID_PARAMS, f"{method} needs a store and an item")
        if base is not None and not (
            isinstance(base, dict)
            and type(base.get("current")) is int
            and isinstance(base.get("plot_hash"), str)
        ):
            raise RpcError(INVALID_PARAMS, "base must be {current, plot_hash}")
        store = self._store(params.get("store"), writing=method in WRITING_METHODS)
        try:
            catalogue = Catalogue.open(Path(store.location))
            if item not in catalogue.item_ids():
                raise RpcError(INVALID_PARAMS, f"There is no plot {item!r} in {store.title}.")
            history = catalogue.history(item)
            recovered = history.open()
            expected = Base(base["current"], base["plot_hash"]) if base else None
            allow = params.get("allow_newer_schema") is True
            out: dict[str, Any] = {"recovered": recovered}
            if method == "debrief/open":
                out.update(self._open(catalogue, store, item, params))
            elif method == "debrief/undo":
                history.undo(expected, allow_newer_schema=allow)
            elif method == "debrief/redo":
                history.redo(expected, allow_newer_schema=allow)
            elif method == "debrief/goto":
                step = params.get("step")
                if type(step) is not int:
                    raise RpcError(INVALID_PARAMS, "goto needs the step to return to")
                history.goto(step, expected, allow_newer_schema=allow)
            elif method in ("debrief/set_colour", "debrief/set_hidden"):
                out["changed"] = self._restyle(catalogue, item, method, params, expected, allow)
            elif method in ANNOTATION_METHODS:
                out.update(self._annotate(catalogue, item, method, params, expected, allow))
            elif method in NARRATIVE_METHODS:
                out.update(self._narrate(catalogue, item, method, params, expected, allow))
            elif method == "debrief/narrative":
                out.update(_narrative_query(history.plot(), params))
            elif method in TRACK_METHODS:
                out.update(self._track(catalogue, item, method, params, expected, allow))
            elif method in CHECKING_METHODS + CLEANING_METHODS:
                out.update(self._clean(catalogue, item, method, params, expected, allow))
            elif method == "debrief/set_view":
                view, given = params.get("view"), params.get("hash")
                if not isinstance(given, str) or not (view is None or isinstance(view, dict)):
                    raise RpcError(INVALID_PARAMS, "set_view needs the view and the hash last read")
                catalogue.write_view(
                    item, view, given, agent=_agent(params), allow_newer_schema=allow
                )
            if method in ("debrief/open", "debrief/set_view"):
                view, view_hash = catalogue.read_view(item)
                out["view"] = view.model_dump(mode="json", exclude_none=True) if view else None
                out["view_hash"] = view_hash
            head = history.head()
            out["base"] = {"current": head.current, "plot_hash": head.plot_hash}
            # How many steps the history holds: with base, what tells the extension that
            # someone else changed the plot, read from the plot file alone (SUB-28).
            out["latest"] = head.latest
            if method == "debrief/history":
                out["steps"] = [_step(s) for s in history.steps()]
            return out
        except Conflict as conflict:
            raise RpcError(CONFLICT, str(conflict)) from None
        except NewerSchemaError as error:
            raise RpcError(NEWER_SCHEMA, str(error)) from None
        except ConfirmationNeeded as error:
            raise RpcError(
                NEEDS_CONFIRMATION,
                f"{error} Nothing was changed. {CONFIRM_HOW}",
            ) from None
        except (CatalogueError, HistoryError, OSError, ValueError) as error:
            raise RpcError(INVALID_PARAMS, str(error)) from None

    def _open(
        self, catalogue: Catalogue, store: models.KnownStore, item: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        """Opening a plot that still has a retired presentation.json: a writer makes it
        one recorded step and deletes it; where that cannot be done (a read-only
        store, say) the plot comes back with it applied in memory, for display."""
        if catalogue.legacy_presentation(item) is None:
            return {}
        if not store.read_only:
            try:
                return {"migrated": catalogue.migrate_presentation(item, _agent(params))}
            except (NewerSchemaError, OSError):
                pass
        return {"plot": json.loads(dump_document(DocumentKind.PLOT, catalogue.read_plot(item)))}

    def _restyle(
        self,
        catalogue: Catalogue,
        item: str,
        method: str,
        params: dict[str, Any],
        base: Base | None,
        allow: bool,
    ) -> bool:
        """Colour tracks or hide features: recorded and undoable, like any change."""
        features = params.get("features")
        if not isinstance(features, list) or not all(isinstance(f, str) for f in features):
            raise RpcError(INVALID_PARAMS, f"{method} needs the features to change")
        agent = _agent(params)
        if method == "debrief/set_colour":
            colour, name = params.get("colour"), params.get("colour_name")
            if not isinstance(colour, str) or not (name is None or isinstance(name, str)):
                raise RpcError(INVALID_PARAMS, "set_colour needs a colour, such as #e01c3e")
            step = catalogue.set_colour(
                item, features, colour, agent, base, colour_name=name, allow_newer_schema=allow
            )
        else:
            hidden = params.get("hidden")
            if not isinstance(hidden, bool):
                raise RpcError(INVALID_PARAMS, "set_hidden needs hidden, true or false")
            step = catalogue.set_hidden(
                item, features, hidden, agent, base, allow_newer_schema=allow
            )
        return step is not None

    def _annotate(
        self,
        catalogue: Catalogue,
        item: str,
        method: str,
        params: dict[str, Any],
        base: Base | None,
        allow: bool,
    ) -> dict[str, Any]:
        """Add, change or delete annotations, or show the north arrow: each one
        recorded, undoable step, named like "Circle 'Exclusion zone' added" (CAP-03).

        An annotation is described as an AnnotationSpec (the forms' description);
        its positions may be numbers or text in any notation the analyst types.
        edit_annotation may give only the members that change.
        """
        agent = _agent(params)
        if method == "debrief/add_annotation":
            annotation = params.get("annotation")
            if not isinstance(annotation, dict):
                raise RpcError(INVALID_PARAMS, "add_annotation needs the annotation to add")
            _, feature = catalogue.add_annotation(
                item, annotation, agent, base, allow_newer_schema=allow
            )
            return {"changed": True, "feature": feature}
        if method == "debrief/edit_annotation":
            feature, annotation = params.get("feature"), params.get("annotation")
            if not isinstance(feature, str) or not isinstance(annotation, dict):
                raise RpcError(INVALID_PARAMS, "edit_annotation needs the feature and its changes")
            step = catalogue.edit_annotation(
                item, feature, annotation, agent, base, allow_newer_schema=allow
            )
            return {"changed": step is not None, "feature": feature}
        if method == "debrief/delete_annotations":
            features = params.get("features")
            if not isinstance(features, list) or not all(isinstance(f, str) for f in features):
                raise RpcError(INVALID_PARAMS, "delete_annotations needs the features to delete")
            catalogue.delete_annotations(item, features, agent, base, allow_newer_schema=allow)
            return {"changed": True}
        shown = params.get("shown")
        if not isinstance(shown, bool):
            raise RpcError(INVALID_PARAMS, "set_north_arrow needs shown, true or false")
        step = catalogue.set_north_arrow(item, shown, agent, base, allow_newer_schema=allow)
        return {"changed": step is not None}

    def _narrate(
        self,
        catalogue: Catalogue,
        item: str,
        method: str,
        params: dict[str, Any],
        base: Base | None,
        allow: bool,
    ) -> dict[str, Any]:
        """Add, change or delete narrative entries, or read a file's narrative into the
        plot: each one recorded, undoable step, named like "Narrative entry by BLUE ONE at
        08:40:00Z added" (CAP-20).

        An entry is described as a NarrativeSpec: time (UTC to the millisecond), source,
        entry_type, text and track_id; left out on adding, the track is the one named as
        its source. edit_narrative may give only the members that change, and None clears
        one. import_narrative reads the narrative of a REP file or a Word (.docx, .doc) or
        PDF document (path) into the plot, with the analyst's choices as legacy Debrief
        asked them (see debrief_io.Choices): types, the entry types to read ("" for none;
        left out, all); within_period, only entries within the plot's tracks' period;
        tracks, the track id (or null) of a platform; platform, the source of entries
        whose document names none.
        """
        agent = _agent(params)
        if method == "debrief/add_narrative":
            entry = params.get("entry")
            if not isinstance(entry, dict):
                raise RpcError(INVALID_PARAMS, "add_narrative needs the entry to add")
            _, feature = catalogue.add_narrative(item, entry, agent, base, allow_newer_schema=allow)
            return {"changed": True, "feature": feature}
        if method == "debrief/edit_narrative":
            feature, entry = params.get("feature"), params.get("entry")
            if not isinstance(feature, str) or not isinstance(entry, dict):
                raise RpcError(INVALID_PARAMS, "edit_narrative needs the feature and its changes")
            step = catalogue.edit_narrative(
                item, feature, entry, agent, base, allow_newer_schema=allow
            )
            return {"changed": step is not None, "feature": feature}
        if method == "debrief/delete_narrative":
            features = params.get("features")
            if not isinstance(features, list) or not all(isinstance(f, str) for f in features):
                raise RpcError(INVALID_PARAMS, "delete_narrative needs the entries to delete")
            catalogue.delete_narrative(item, features, agent, base, allow_newer_schema=allow)
            return {"changed": True}
        path = params.get("path")
        if not isinstance(path, str):
            raise RpcError(INVALID_PARAMS, "import_narrative needs the path of the file to read")
        try:
            choices = Choices.of(params)
        except ValueError as error:
            raise RpcError(INVALID_PARAMS, str(error)) from None
        try:
            done = import_narrative(
                catalogue, item, Path(path), agent, base, allow_newer_schema=allow, choices=choices
            )
        except NoNarrativeError as error:
            raise RpcError(INVALID_PARAMS, str(error)) from None
        return {
            "changed": True,
            "entries": done.entries,
            "sources": done.sources,
            "omitted": done.omitted,
            "notes": done.notes,
        }

    def _track(
        self,
        catalogue: Catalogue,
        item: str,
        method: str,
        params: dict[str, Any],
        base: Base | None,
        allow: bool,
    ) -> dict[str, Any]:
        """Move, rotate, shear, stretch, split or merge tracks by hand: each one
        recorded, undoable step, named like "BLUE ONE moved 1.20 nmi 045.0°T" or
        "BLUE ONE sheared: 087.2°T 12.4 kn" (CAP-01, CAP-02, CAP-21).

        edit_track takes the feature and the edit (a TrackEdit: move with distance and
        bearing; rotate with angle and perhaps pivot; shear with anchor and either
        distance and bearing for the dragged end or course and speed; stretch with
        anchor and speed; each for a period or the whole track) and, for a
        rotation's default pivot, current_time. split_track
        takes the feature, the time (at) and perhaps names for the two parts;
        merge_tracks the features and perhaps a name, and says in notes what was not
        kept (speeds, courses or depths some of the tracks had not).
        """
        agent = _agent(params)
        if method == "debrief/edit_track":
            feature, edit = params.get("feature"), params.get("edit")
            current = params.get("current_time")
            if not isinstance(feature, str) or not isinstance(edit, dict):
                raise RpcError(INVALID_PARAMS, "edit_track needs the feature and the edit")
            if current is not None and not isinstance(current, str):
                raise RpcError(INVALID_PARAMS, "current_time must be a UTC time")
            step = catalogue.edit_track(
                item, feature, edit, agent, base, current_time=current, allow_newer_schema=allow
            )
            return {"changed": step is not None, "feature": feature}
        if method == "debrief/split_track":
            feature, at, names = params.get("feature"), params.get("at"), params.get("names")
            if not isinstance(feature, str) or not isinstance(at, str):
                raise RpcError(INVALID_PARAMS, "split_track needs the feature and the time (at)")
            if names is not None and not (
                isinstance(names, list)
                and len(names) == 2
                and all(isinstance(n, str) for n in names)
            ):
                raise RpcError(INVALID_PARAMS, "names must be two names, one for each part")
            _, parts = catalogue.split_track(
                item, feature, at, agent, base, names=names, allow_newer_schema=allow
            )
            return {"changed": True, "features": parts}
        features, name = params.get("features"), params.get("name")
        if not isinstance(features, list) or not all(isinstance(f, str) for f in features):
            raise RpcError(INVALID_PARAMS, "merge_tracks needs the tracks to merge")
        if name is not None and not isinstance(name, str):
            raise RpcError(INVALID_PARAMS, "name must be text")
        _, merged, lost = catalogue.merge_tracks(
            item, features, agent, base, name=name, allow_newer_schema=allow
        )
        return {"changed": True, "feature": merged, "notes": lost}

    def _clean(
        self,
        catalogue: Catalogue,
        item: str,
        method: str,
        params: dict[str, Any],
        base: Base | None,
        allow: bool,
    ) -> dict[str, Any]:
        """Clean a track: find its jumps and show them, then remove those the analyst
        confirms; preview smoothing, then apply it; colour, label or comment on a fix.
        Finding and previewing change nothing; each change is one recorded, undoable step
        (CAP-01, EXT-14).

        Each takes the feature (a track). find_jumps takes a threshold (a speed, such as
        {"value": 30, "unit": "[kn_i]"}; left out, three times the track's median speed,
        at least 10 kn) and a period ({start, end}); remove_jumps the times to remove and
        the threshold they were found at, for the record. preview_smoothing and
        smooth_track take the window (an odd number of fixes) and a period. mark_fix takes
        the time of the fix and changes ({colour, label, comment}; null or "" takes one
        away), and colour_name for the step's name.
        """
        feature = params.get("feature")
        if not isinstance(feature, str):
            raise RpcError(INVALID_PARAMS, f"{method} needs the track (feature)")
        period = _period(params.get("period"))
        agent = _agent(params) if method in CLEANING_METHODS else None
        if method == "debrief/find_jumps":
            threshold = _speed(params.get("threshold"))
            used, median, jumps = catalogue.find_jumps(
                item, feature, threshold=threshold, period=period, base=base
            )
            return {
                "feature": feature,
                "threshold": _quantity(used),
                "median_speed": _quantity(median) if median else None,
                "jumps": [
                    {
                        "time": j.time,
                        "position": list(j.position),
                        # None when it is at the same time as the fix before, somewhere else.
                        "speed": None
                        if math.isinf(j.speed_kn)
                        else {"value": j.speed_kn, "unit": "[kn_i]"},
                        "since": j.since,
                        # A DR track's jump: its logged speed, on to the fix at since.
                        **({"logged": True} if j.logged else {}),
                    }
                    for j in jumps
                ],
            }
        if method == "debrief/remove_jumps":
            times = params.get("times")
            if not isinstance(times, list) or not all(isinstance(t, str) for t in times):
                raise RpcError(
                    INVALID_PARAMS, "remove_jumps needs the times of the fixes to remove"
                )
            threshold = _speed(params.get("threshold"))
            catalogue.remove_jumps(
                item, feature, times, agent, base, threshold=threshold, allow_newer_schema=allow
            )
            return {"changed": True, "feature": feature}
        if method in ("debrief/preview_smoothing", "debrief/smooth_track"):
            window = params.get("window")
            if type(window) is not int:
                raise RpcError(INVALID_PARAMS, f"{method} needs the window: an odd number of fixes")
            if method == "debrief/preview_smoothing":
                after, smoothing = catalogue.smoothing_preview(
                    item, feature, window, period=period, base=base
                )
                return {
                    "feature": feature,
                    "preview": after.geometry.model_dump(mode="json"),
                    **_smoothing(smoothing),
                }
            done = catalogue.smooth_track(
                item, feature, window, agent, base, period=period, allow_newer_schema=allow
            )
            return {
                "changed": done is not None,
                "feature": feature,
                **(_smoothing(done[1]) if done else {}),
            }
        time, changes = params.get("time"), params.get("changes")
        name = params.get("colour_name")
        if not isinstance(time, str) or not isinstance(changes, dict):
            raise RpcError(INVALID_PARAMS, "mark_fix needs the time of the fix and its changes")
        if name is not None and not isinstance(name, str):
            raise RpcError(INVALID_PARAMS, "colour_name must be text")
        step = catalogue.mark_fix(
            item, feature, time, changes, agent, base, colour_name=name, allow_newer_schema=allow
        )
        return {"changed": step is not None, "feature": feature}

    def _rep_tracks(self, params: dict[str, Any]) -> dict[str, Any]:
        """The tracks a REP file would import, so the host can ask the analyst how each is
        plotted, over the ground or by dead reckoning, before importing it (CAP-01). A
        legacy plot file says for itself: none are listed. Changes nothing."""
        path = params.get("path")
        if not isinstance(path, str) or not Path(path).is_file():
            raise RpcError(INVALID_PARAMS, f"{path} is not a file.")
        if _is_plot_file(Path(path)) or _is_document(Path(path)):
            return {"tracks": []}
        try:
            return {"tracks": rep_track_names(Path(path))}
        except (OSError, ValueError) as error:
            raise RpcError(
                INVALID_PARAMS, f"{Path(path).name} could not be read: {error}"
            ) from None

    def _preview_narrative(self, params: dict[str, Any]) -> dict[str, Any]:
        """What a narrative file holds, before it is read, so the host can ask the analyst
        what legacy Debrief asked (CAP-19): its format and dialect, its entry types with
        counts, its sources with the track each would belong to, its period and, given a
        plot (store and item), how many entries fall outside its tracks' period. An ASW
        data document says how many positions it holds instead. Changes nothing."""
        path, item = params.get("path"), params.get("item")
        if not isinstance(path, str) or not Path(path).is_file():
            raise RpcError(INVALID_PARAMS, f"{path} is not a file.")
        plot = None
        if item is not None:
            if not isinstance(item, str):
                raise RpcError(INVALID_PARAMS, "item is the plot's id")
            store = self._store(params.get("store"), writing=False)
            try:
                plot = Catalogue.open(Path(store.location)).read_plot(item)
            except (CatalogueError, OSError) as error:
                raise RpcError(INVALID_PARAMS, str(error)) from None
        try:
            return preview_narrative(Path(path), plot)
        except (NoNarrativeError, OSError) as error:
            raise RpcError(INVALID_PARAMS, str(error)) from None

    def _import(self, params: dict[str, Any]) -> dict[str, Any]:
        """Import a REP file (EXT-01), a legacy plot file, .dpf (EXT-14, EXT-15), or a Word
        or PDF document (CAP-19, EXT-04: its narrative, or an ASW document's track, named
        track_name; types as for import_narrative) as a new plot.
        Nothing in the file is dropped silently: what is not imported is listed.
        For a REP file, modes says how each track is plotted (otg or dr, one for all or by
        track name), as the host asked the analyst or remembered for them; remembered, the
        words saying how to change that choice. The service never reads that choice itself."""
        path = params.get("path")
        modes = params.get("modes")
        remembered = params.get("remembered")
        if not (modes is None or isinstance(modes, (str, dict))) or not (
            remembered is None or isinstance(remembered, str)
        ):
            raise RpcError(INVALID_PARAMS, "modes is otg or dr, or one of them for each track.")
        store = self._store(params.get("store"), writing=True)
        if not isinstance(path, str) or not Path(path).is_file():
            raise RpcError(INVALID_PARAMS, f"{path} is not a file.")
        try:
            catalogue = Catalogue.open(Path(store.location))
            stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(path).stem).strip("-.") or "plot"
            taken, item_id, n = set(catalogue.item_ids()), stem, 2
            while item_id in taken:
                item_id, n = f"{stem}-{n}", n + 1
            options = {
                "item_id": item_id,
                "agent": _agent(params),
                "allow_newer_schema": params.get("allow_newer_schema") is True,
            }
            if _is_plot_file(Path(path)):
                report = import_dpf(catalogue, Path(path), **options)
            elif _is_document(Path(path)):
                track_name = params.get("track_name")
                if track_name is not None and not isinstance(track_name, str):
                    raise ValueError("track_name is the name of an ASW document's track")
                report = import_document(
                    catalogue,
                    Path(path),
                    choices=Choices.of(params),
                    track_name=track_name,
                    **options,
                )
            else:
                report = import_rep(
                    catalogue, Path(path), modes=modes, remembered=remembered, **options
                )
        except NewerSchemaError as error:
            raise RpcError(NEWER_SCHEMA, str(error)) from None
        except (CatalogueError, OSError, ValueError) as error:
            message = str(error)
            if not message.startswith(Path(path).name):
                message = f"{Path(path).name} could not be imported: {message}"
            raise RpcError(INVALID_PARAMS, message) from None
        return {
            "item": report.item_id,
            "tracks": report.tracks,
            "fixes": report.fixes,
            "annotations": report.annotations,
            "narrative_entries": report.narrative_entries,
            "omitted": report.omitted,
            "notes": report.notes,
        }

    def _add_plot_file(self, params: dict[str, Any]) -> dict[str, Any]:
        """Add a plot file received from a colleague (a .geojson plot) to a catalogue,
        with its whole history, so undo, redo and provenance come with it (decision
        13 Oct). A file whose history does not match its checksums is refused."""
        path = params.get("path")
        store = self._store(params.get("store"), writing=True)
        if not isinstance(path, str) or not Path(path).is_file():
            raise RpcError(INVALID_PARAMS, f"{path} is not a file.")
        try:
            catalogue = Catalogue.open(Path(store.location))
            item = catalogue.add_plot_file(
                Path(path),
                _agent(params),
                allow_newer_schema=params.get("allow_newer_schema") is True,
            )
            steps = len(catalogue.history(item).steps())
            title = catalogue.read_item(item).properties.title or item
        except NewerSchemaError as error:
            raise RpcError(NEWER_SCHEMA, str(error)) from None
        except (CatalogueError, HistoryError, OSError, ValueError) as error:
            message = str(error)
            if not message.startswith(Path(path).name):
                message = f"{Path(path).name} could not be added: {message}"
            raise RpcError(INVALID_PARAMS, message) from None
        return {"item": item, "title": title, "steps": steps}

    def _log_run(
        self, name: str, arguments: dict[str, Any], outcome: dict[str, Any], seconds: float
    ) -> None:
        """One line per run, with no plot data in it (NFR-14)."""
        declaration = self.declarations[name]
        supplied = arguments.get("parameters")
        log.info(
            "%s",
            diagnostics.tool_run(
                tool=name,
                version=declaration.version,
                parameter_kinds={p.name: str(p.kind) for p in declaration.parameters or []},
                supplied=supplied if isinstance(supplied, dict) else None,
                selected=len(arguments.get("selection") or []),
                outcome=_outcome(outcome),
                seconds=seconds,
            ),
        )

    def _call(self, params: dict[str, Any]) -> dict[str, Any]:
        name, arguments = params.get("name"), params.get("arguments")
        if not isinstance(name, str) or not isinstance(arguments, dict):
            raise RpcError(INVALID_PARAMS, "tools/call needs a name and arguments")
        if name not in self.declarations:
            raise RpcError(INVALID_PARAMS, f"There is no tool called {name}.")
        problem = _argument_problem(arguments)
        if problem:
            return {**_tool_error(problem), "_meta": {"debrief/outcome": "refused"}}
        started = time.monotonic()
        outcome = self.worker.call(name, arguments)
        self._log_run(name, arguments, outcome, time.monotonic() - started)
        # How the run ended, in the words both logs use (diagnostics.OUTCOMES).
        meta: dict[str, Any] = {"debrief/outcome": _outcome(outcome)}
        if "error" in outcome:
            error = _tool_error(outcome["error"])
            if "conflict" in outcome:
                # The caller chooses: run again with on_conflict "merge" (when
                # mergeable) or "new_plot" (SUB-28, SUB-29).
                meta["debrief/conflict"] = outcome["conflict"]
            if outcome.get("newer_schema"):
                # The caller asks the analyst, then runs again with allow_newer_schema (SUB-35).
                meta["debrief/newer_schema"] = True
            return {**error, "_meta": meta}
        if outcome.get("new_item"):
            summary = f"The plot had changed, so the result was saved as {outcome['new_item']}."
        elif outcome["changed"]:
            summary = "The plot was updated."
        else:
            summary = "The plot was not changed."
        structured = {"result": outcome["result"], "changed": outcome["changed"]}
        if outcome.get("new_item"):
            structured["new_item"] = outcome["new_item"]
        return {
            # Agents that read only text still get the whole result.
            "content": [{"type": "text", "text": f"{summary}\n{json.dumps(structured)}"}],
            "structuredContent": structured,
            "isError": False,
            "_meta": meta,
        }


def _outcome(outcome: dict[str, Any]) -> str:
    if "conflict" in outcome:
        return "conflict"
    if outcome.get("newer_schema"):
        return "needs_newer_schema_confirmed"
    if "error" in outcome:
        return str(outcome.get("failure", "failed"))
    if outcome.get("new_item"):
        return "saved_as_new_plot"
    return "changed" if outcome["changed"] else "unchanged"


def _argument_problem(arguments: dict[str, Any]) -> str | None:
    selection = arguments.get("selection")
    if not isinstance(selection, list) or not all(isinstance(s, str) for s in selection):
        return "selection must be a list of feature ids"
    agent = arguments.get("agent")
    if not (
        isinstance(agent, dict)
        and agent.get("kind") in ("person", "software_agent")
        and isinstance(agent.get("name"), str)
        and agent["name"].strip()
    ):
        return (
            "Say who is running the tool: agent needs kind (person or software_agent) and a "
            "name, which provenance records (SUB-24)."
        )
    if not isinstance(arguments.get("parameters", {}), dict):
        return "parameters must be an object"
    if arguments.get("on_conflict", "refuse") not in ("refuse", "merge", "new_plot"):
        return "on_conflict must be refuse, merge or new_plot"
    return None


NARRATIVE_LIMIT = 1000


def _narrative_query(plot: DebriefFeatureCollection, params: dict[str, Any]) -> dict[str, Any]:
    """debrief/narrative: the plot's narrative on one Zulu time axis (CAP-20), all its
    sources merged in one order, with what agents filter by: sources and types (lists;
    "" is an entry with no type), text (found in an entry's text, source or type,
    ignoring case), start and end (UTC, ends included); offset and limit page through
    (at most NARRATIVE_LIMIT a call). at, a UTC time, also gives the entry current time
    would be at among those matching: the last at or before it. Returns the entries,
    how many match in all, and each source's and type's count over the whole narrative."""

    def names(member: str) -> frozenset[str] | None:
        value = params.get(member)
        if value is None:
            return None
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise RpcError(INVALID_PARAMS, f"{member} must be a list of names")
        return frozenset(value)

    def time_of(member: str) -> int | None:
        value = params.get(member)
        if value is None:
            return None
        problem = f"{member} must be a UTC time, such as 2026-10-11T09:30:00.000Z"
        if not isinstance(value, str):
            raise RpcError(INVALID_PARAMS, problem)
        try:
            return parse_utc(value)
        except ValueError:
            raise RpcError(INVALID_PARAMS, problem) from None

    text = params.get("text")
    if text is not None and not isinstance(text, str):
        raise RpcError(INVALID_PARAMS, "text must be text to find")
    offset, limit = params.get("offset", 0), params.get("limit", NARRATIVE_LIMIT)
    if type(offset) is not int or type(limit) is not int or offset < 0 or limit < 0:
        raise RpcError(INVALID_PARAMS, "offset and limit must be whole numbers, not negative")
    asked = narrative.Query(
        sources=names("sources"),
        types=names("types"),
        text=text or None,
        start_ms=time_of("start"),
        end_ms=time_of("end"),
    )
    at = time_of("at")
    every = narrative.order(narrative.entries(plot))
    matching = [f for f in every if asked.matches(f, parse_utc(f.properties.time))]
    page = matching[offset : offset + min(limit, NARRATIVE_LIMIT)]
    out: dict[str, Any] = {
        "entries": [narrative.as_json(f) for f in page],
        "total": len(matching),
        "offset": offset,
        **narrative.summary(every),
    }
    if at is not None:
        times = [parse_utc(f.properties.time) for f in matching]
        index = narrative.current_index(times, at)
        out["current"] = matching[index].id if index >= 0 else None
    return out


def _period(value: Any) -> tuple[str, str] | None:
    """A period given as {start, end}, UTC times; None if not given."""
    if value is None:
        return None
    if not (
        isinstance(value, dict)
        and isinstance(value.get("start"), str)
        and isinstance(value.get("end"), str)
    ):
        raise RpcError(INVALID_PARAMS, "period must be {start, end}, each a UTC time")
    return value["start"], value["end"]


def _speed(value: Any) -> Quantity | None:
    """A speed given as {value, unit}; None if not given."""
    if value is None:
        return None
    try:
        quantity = Quantity(float(value["value"]), str(value["unit"]))
        quantity.to("m/s")
    except (KeyError, TypeError, ValueError, IncompatibleUnitsError):
        raise RpcError(
            INVALID_PARAMS, 'threshold must be a speed, such as {"value": 30, "unit": "[kn_i]"}'
        ) from None
    return quantity


def _quantity(quantity: Quantity) -> dict[str, Any]:
    return {"value": quantity.value, "unit": quantity.unit}


def _smoothing(smoothing: Any) -> dict[str, Any]:
    """What smoothing did, or would do, and the words that say it."""
    return {
        "moved": smoothing.moved,
        "largest": {"value": smoothing.largest_m, "unit": "m"},
        "largest_time": smoothing.largest_time,
        "summary": describe_largest(smoothing),
    }


def _agent(params: dict[str, Any]) -> models.AgentRef:
    """Who is making a change, for its provenance record (SUB-24)."""
    agent = params.get("agent") or {"kind": "person", "name": "analyst"}
    if not isinstance(agent, dict):
        raise RpcError(INVALID_PARAMS, "agent must be {kind, name}")
    try:
        return models.AgentRef(**agent)
    except ValueError:
        raise RpcError(INVALID_PARAMS, "agent must be {kind, name}") from None


def _step(step: Any) -> dict[str, Any]:
    """One history step as the History view shows it: what made it, when, by whom.

    The notes name an edit made without a tool, such as "Colour of BLUE ONE set
    to red"; the playground (vscode/play/play.py)
    lists the same fields, so both name steps alike.
    """
    first = step.records[0]
    return {
        "seq": step.seq,
        "status": step.status,
        "kind": str(first.kind),
        "tool": first.tool.name if first.tool else None,
        "agent": ", ".join(dict.fromkeys(r.agent.name for r in step.records)),
        "at": first.ended_at or first.started_at,
        "records": len(step.records),
        "notes": list(first.notes or []),
        # What undoing it goes back to, and whether undo takes it with the step before.
        "after": step.after,
        "records_only": step.records_only,
    }


def _tool_error(message: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": message}], "isError": True}


def build_app(service: ToolService, token: str, port: int) -> Starlette:
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
    expected = f"Bearer {token}".encode()

    async def mcp(request: Request) -> Response:
        if "origin" in request.headers:
            return Response("Requests from web pages are not accepted.", status_code=403)
        if request.headers.get("host") not in allowed_hosts:
            return Response("Unexpected host.", status_code=403)
        if not hmac.compare_digest(request.headers.get("authorization", "").encode(), expected):
            return Response(status_code=401)
        header_version = request.headers.get("mcp-protocol-version")
        if header_version is not None and header_version not in SUPPORTED_VERSIONS:
            return Response(f"Unsupported MCP protocol version {header_version}.", status_code=400)
        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            return Response("Request too large.", status_code=413)
        try:
            message = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return _error(None, -32700, "Parse error")
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return _error(None, INVALID_REQUEST, "Not a JSON-RPC 2.0 request")
        if "id" not in message or "method" not in message:
            return Response(status_code=202)  # a notification, or a response to us
        params = message.get("params", {})
        if not isinstance(params, dict) or not isinstance(message["method"], str):
            return _error(message["id"], INVALID_PARAMS, "params must be an object")
        try:
            # Tool calls block on the worker; keep the event loop free for everything else.
            result = await run_in_threadpool(service.handle, message["method"], params)
        except RpcError as error:
            return _error(message["id"], error.code, str(error))
        except Exception as error:  # noqa: BLE001 - the service outlives any one request
            # The method's name only if it is one of ours; the formatter leaves out the message.
            method = message["method"] if message["method"] in KNOWN_METHODS else "-"
            log.exception("rpc_error method=%s", method)
            return _error(message["id"], INTERNAL, f"Internal error: {error}")
        return JSONResponse({"jsonrpc": "2.0", "id": message["id"], "result": result})

    return Starlette(routes=[Route("/mcp", mcp, methods=["POST"])])


def _error(request_id: Any, code: int, message: str) -> JSONResponse:
    return JSONResponse(
        {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
    )


def log_unavailable(problem: dict[str, Any]) -> None:
    """A library or tool that could not load. Why is free text (often an import
    error), so it is logged only as a hash (NFR-14)."""
    log.warning(
        "tool_unavailable library=%s tool=%s reason=<text:%s>",
        problem["library"],
        problem["tool"] or "-",
        diagnostics.keyed_hash(str(problem["reason"])),
    )


def serve(
    port: int = 0, libraries: list[str] | None = None, timeout_s: float = DEFAULT_TIMEOUT_S
) -> None:
    """Start the service. Prints one JSON line with the port once listening."""
    import uvicorn

    token = os.environ.pop("DEBRIEF_TOOL_TOKEN", "")  # not inherited by the worker
    if len(token) < MIN_TOKEN_LENGTH:
        sys.exit(
            f"DEBRIEF_TOOL_TOKEN must be set to a token of at least {MIN_TOKEN_LENGTH} characters."
        )
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", port))  # loopback only (SEC-07)
    listener.listen(128)  # listening before the port is announced, so the first request connects
    port = listener.getsockname()[1]
    worker = ToolWorker(libraries or [], os.environ.get("DEBRIEF_CONFIG"), timeout_s)
    service = ToolService(worker)
    for problem in service.unavailable:
        log_unavailable(problem)
    app = build_app(service, token, port)
    print(json.dumps({"port": port, "tools": len(service.declarations)}), flush=True)
    try:
        # log_config=None: uvicorn's loggers keep the redacting handlers diagnostics set up.
        config = uvicorn.Config(app, log_level="warning", log_config=None, access_log=False)
        uvicorn.Server(config).run(sockets=[listener])
    finally:
        worker.close()
