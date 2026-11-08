"""The tool service: MCP over HTTP, per user, loopback only, with a session token.

The protocol is MCP's Streamable HTTP transport (JSON-RPC 2.0, one POST per
request, JSON responses), so the VS Code extension and any MCP-capable agent
use the same tools (TL-01, TL-17). Debrief adds methods of its own, named
debrief/...: the offering rule (TL-08), stores, catalogues and import, a plot's history
(SUB-21) and every change recorded in it, the plot's view (its island, SUB-22), the Tote
(CAP-06, CAP-07), collation (CAP-08 to CAP-12), narrative (CAP-19, CAP-20), sensors
(CAP-22), TMA solutions (CAP-21) and exported images (SUB-25, figures.py).

Each method is one entry in METHODS, registered by a decorator on its handler: a Method
(methods.py) naming its parameters (a Params model, method_params.py), whether it changes
the plot it names, whether it needs agent (SUB-24), whether it runs on one plot inside its
history, and its handler. handle() looks the method up there and nowhere else; the sets
the service and its tests use are read from it, and the README's method table is printed
from it (python -m debrief_tools methods). Adding a method is a decorated handler, perhaps
a Params model, and that table.

A method on one plot (history) gets a PlotCall: the plot's catalogue, its history, opened
(recovering an interrupted change), and the base the caller passed. Every such method
returns the new base, which the caller passes back with its next change, so one made
meanwhile elsewhere is never overwritten (SUB-28). The view has a hash of its own for the
same purpose: changing it never moves the base, and changing the plot never moves the
view's hash.

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
from collections.abc import Callable
from dataclasses import dataclass
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
    AlreadyInPlotError,
    Choices,
    HostNeeded,
    NoNarrativeError,
    NoSensorDataError,
    SensorReadBefore,
    import_document,
    import_dpf,
    import_narrative,
    import_rep,
    import_sensor,
    preview_narrative,
    preview_sensor,
)
from debrief_io.document_import import SUFFIXES as DOCUMENT_SUFFIXES
from debrief_io.documents import sniff
from debrief_io.importer import rep_track_names
from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity as UnitQuantity
from debrief_schemas import (
    DocumentKind,
    dump_document,
    load_document,
    models,
)
from debrief_stac import (
    Base,
    Catalogue,
    CatalogueError,
    ConfirmationNeeded,
    Conflict,
    HistoryError,
    NewerSchemaError,
    StoreBusy,
    frequencies,
    narrative,
    sensors,
)
from debrief_stac.catalogue import review_flags
from debrief_stac.fixes import describe_largest
from debrief_stac.tote import measure_groups, tote
from debrief_tools import diagnostics, figures
from debrief_tools import method_params as mp
from debrief_tools.entries import history_steps, move, offered_tools
from debrief_tools.methods import Handler, Method, Methods, Params
from debrief_tools.rpc import (
    CONFLICT,
    INTERNAL,
    INVALID_PARAMS,
    INVALID_REQUEST,
    MAPPED,
    METHOD_NOT_FOUND,
    NEEDS_CONFIRMATION,
    NEWER_SCHEMA,
    PARSE_ERROR,
    RpcError,
    agent_ref,
    base_of,
    rpc_error,
)
from debrief_tools.worker import ToolWorker

PROTOCOL_VERSION = "2025-06-18"
SUPPORTED_VERSIONS = ("2025-06-18", "2025-03-26")
MAX_BODY_BYTES = 10 * 1024 * 1024
# The most an exported image's request may be (IMAGE_METHODS).
MAX_IMAGE_BODY_BYTES = 48 * 1024 * 1024
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


CONFIRM_HOW = "To go ahead, send the change again with discard_dr_changes: true."


def _parameter_schema(param: models.ParameterDeclaration) -> dict[str, Any]:
    kind = str(param.kind)
    schema: dict[str, Any] = {
        "number": {"type": "number"},
        "integer": {"type": "integer"},
        "string": {"type": "string"},
        "boolean": {"type": "boolean"},
        "choice": {"type": "string", "enum": param.choices or []},
        "quantity": {**mp.QUANTITY, "description": f"A {param.quantity_kind} with a UCUM unit"},
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
        self.bridge = figures.Bridge()
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
        entry = METHODS.get(method)
        if entry is None:
            raise RpcError(METHOD_NOT_FOUND, f"Unknown method {method}")
        if entry.agent:
            agent_ref(params, method)  # refused before anything is read (SUB-24)
        if entry.history:
            return self._history(entry, params)
        return entry.handler(self, params, entry.read(params))

    def config(self) -> models.UserConfig:
        return load_config(self.config_path) if self.config_path else load_config()

    def store(self, store_id: Any, *, writing: bool) -> models.KnownStore:
        store = next((s for s in self.config().stores if s.id == store_id), None)
        if store is None:
            raise RpcError(
                INVALID_PARAMS, f"There is no catalogue {store_id!r} in your configuration."
            )
        if writing and store.read_only:
            raise RpcError(INVALID_PARAMS, f"{store.title} is read-only.")
        return store

    def _history(self, method: Method, params: dict[str, Any]) -> dict[str, Any]:
        """A method on one plot: the plot opened (an interrupted change recovered, unless
        it is opened to show read-only), the method's parameters checked and its handler
        run, and the plot's base and latest step returned (SUB-21, SUB-28)."""
        item = params.get("item")
        if not isinstance(item, str):
            raise RpcError(INVALID_PARAMS, f"{method.name} needs a store and an item")
        try:
            expected = base_of(params.get("base"))
        except ValueError as error:
            raise RpcError(INVALID_PARAMS, str(error)) from None
        store = self.store(params.get("store"), writing=method.writes)
        try:
            catalogue = Catalogue.open(Path(store.location))
            if item not in catalogue.item_ids():
                raise RpcError(INVALID_PARAMS, f"There is no plot {item!r} in {store.title}.")
            history = catalogue.history(item)
            # Opened to show read-only (an earlier revision): an interrupted change is not
            # recovered, which would write to the plot (expert panel, 16 Oct 2026).
            reading_only = method.name == "debrief/open" and params.get("read_only") is True
            recovered = False if reading_only else history.open()
            call = PlotCall(
                self,
                method.name,
                params,
                store,
                catalogue,
                item,
                history,
                expected,
                params.get("allow_newer_schema") is True,
            )
            out: dict[str, Any] = {"recovered": recovered}
            out.update(method.handler(call, method.read(params)))
            head = history.head()
            out["base"] = {"current": head.current, "plot_hash": head.plot_hash}
            # How many steps the history holds: with base, what tells the extension that
            # someone else changed the plot, read from the plot file alone (SUB-28).
            out["latest"] = head.latest
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
        except MAPPED as error:
            raise rpc_error(error) from None

    def other_catalogues(self, catalogue: Catalogue) -> list[Catalogue]:
        """The analyst's other catalogues, where items a plot drew from may be (CAP-10):
        each store in their configuration that holds one, other than this."""
        others = []
        for store in self.config().stores:
            try:
                other = Catalogue.open(Path(store.location))
            except (CatalogueError, OSError, ValueError):
                continue
            if getattr(other.store, "root", None) != getattr(catalogue.store, "root", None):
                others.append(other)
        return others

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

    def call(self, params: dict[str, Any], _args: None = None) -> dict[str, Any]:
        """tools/call: run one tool in the worker (TL-02, TL-03), or a method tools/list
        offers, by its tool name (debrief.x), with the arguments as its parameters."""
        name, arguments = params.get("name"), params.get("arguments")
        if not isinstance(name, str) or not isinstance(arguments, dict):
            raise RpcError(INVALID_PARAMS, "tools/call needs a name and arguments")
        method = METHODS.tool(name)  # by its tool name only: debrief.x, not debrief/x
        if method is not None:
            return self._call_method(method, arguments)
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

    def _call_method(self, method: Method, arguments: dict[str, Any]) -> dict[str, Any]:
        """A method run through tools/call: handled exactly as its own request would be
        (agent, the store's being writable, the plot's history and base all checked as
        they are there), its result as a tool's, a refusal as a tool's error, with the
        JSON-RPC code the request would have had in _meta["debrief/code"]."""
        try:
            result = self.handle(method.name, arguments)
        except RpcError as error:
            meta: dict[str, Any] = {"debrief/outcome": "refused", "debrief/code": error.code}
            if error.code == CONFLICT:
                meta["debrief/outcome"] = "conflict"
            elif error.code == NEWER_SCHEMA:
                meta["debrief/outcome"] = "needs_newer_schema_confirmed"
                meta["debrief/newer_schema"] = True
            return {**_tool_error(str(error)), "_meta": meta}
        except Exception:  # noqa: BLE001 - as the request would be: logged, never said
            log.exception("rpc_error method=%s", method.name)
            meta = {"debrief/outcome": "failed", "debrief/code": INTERNAL}
            return {**_tool_error(INTERNAL_MESSAGE), "_meta": meta}
        return {
            # Agents that read only text still get the whole result.
            "content": [{"type": "text", "text": json.dumps(result)}],
            "structuredContent": result,
            "isError": False,
        }


@dataclass(frozen=True)
class PlotCall:
    """A method's request on one plot, inside its history: what its handler works on."""

    service: ToolService
    method: str
    params: dict[str, Any]
    store: models.KnownStore
    catalogue: Catalogue
    item: str
    history: Any  # debrief_stac's PlotHistory, opened
    base: Base | None  # the base the caller passed, if any (SUB-28)
    allow: bool  # allow_newer_schema (SUB-35)

    @property
    def agent(self) -> models.AgentRef:
        return agent_ref(self.params)

    def notes(self, step: int) -> list[str]:
        """What the step's record says beyond its name."""
        return self.catalogue.history(self.item).steps()[step - 1].records[0].notes

    def view(self) -> dict[str, Any]:
        """The plot's view, its island, and the view's hash."""
        view, view_hash = self.catalogue.read_view(self.item)
        return {
            "view": view.model_dump(mode="json", exclude_none=True) if view else None,
            "view_hash": view_hash,
        }


# Every method, registered by a decorator on its handler, or below for those whose handler
# lives elsewhere (figures.py). handle() looks a method up here and nowhere else.
METHODS = Methods()


def _reads_plot(
    name: str, does: str, params: type[Params] | None = None, **schema: Any
) -> Callable[[Handler], Handler]:
    """A method that reads one plot, inside its history, and changes nothing."""
    return METHODS.register(name, does, params, history=True, **schema)


def _changes_plot(
    name: str, does: str, params: type[Params] | None = None, **schema: Any
) -> Callable[[Handler], Handler]:
    """A method that changes one plot, recorded with who made it (SUB-24): a step in its
    history, or (the view, collation's marks) a change to its island. schema: its request
    and reply classes (Method)."""
    return METHODS.register(name, does, params, writes=True, agent=True, history=True, **schema)


# Methods the service answers itself: (service, params, the params checked) -> result.


@METHODS.register("initialize", "Negotiates the protocol version.", protocol=True)
def _initialize(service: ToolService, params: dict[str, Any], _: None) -> dict[str, Any]:
    requested = params.get("protocolVersion")
    return {
        "protocolVersion": requested if requested in SUPPORTED_VERSIONS else PROTOCOL_VERSION,
        "capabilities": {"tools": {"listChanged": False}},
        "serverInfo": {"name": "debrief-tools", "version": version("debrief-tools")},
        "instructions": (
            "Debrief analysis tools. Each acts on features of one plot in one of the "
            "user's stores; list stores with debrief/stores. Say who you are in agent."
        ),
    }


@METHODS.register("ping", "Answers `{}`.", protocol=True)
def _ping(service: ToolService, params: dict[str, Any], _: None) -> dict[str, Any]:
    return {}


@METHODS.register(
    "tools/list",
    "The tools the libraries declare and every method not the protocol's, each with its "
    "input schema, and the tools unavailable.",
    protocol=True,
)
def _tools_list(service: ToolService, params: dict[str, Any], _: None) -> dict[str, Any]:
    """The tools the worker's libraries declare, then every method in METHODS that is not
    the protocol's (each marked _meta["debrief/method"]), and the tools unavailable. Each
    one runs through tools/call."""
    return {
        "tools": [_describe(d, service.raw[n]) for n, d in service.declarations.items()]
        + [method.listing() for method in METHODS.values() if not method.protocol],
        "_meta": {"debrief/unavailable": service.unavailable},
    }


@METHODS.register(
    "tools/call",
    "Runs a tool on a plot, in the worker, or a method tools/list offers; it may change the plot.",
    protocol=True,
)
def _tools_call(service: ToolService, params: dict[str, Any], _: None) -> dict[str, Any]:
    return service.call(params)


@METHODS.register(
    "debrief/tools_for_selection",
    "The tools on offer for a selection, by its feature kinds (TL-08).",
    mp.ToolsForSelection,
    request=models.ToolsForSelectionParams,
    reply=models.ToolsForSelectionReply,
)
def _tools_for_selection(
    service: ToolService, params: dict[str, Any], asked: mp.ToolsForSelection
) -> dict[str, Any]:
    return {"tools": offered_tools(service.declarations, asked.kinds)}


@METHODS.register(
    "debrief/stores",
    "The stores in the analyst's configuration.",
    request=models.NoParams,
    reply=models.StoresReply,
)
def _stores(service: ToolService, params: dict[str, Any], _: None) -> dict[str, Any]:
    return {
        "stores": [
            {"id": s.id, "title": s.title, "read_only": bool(s.read_only)}
            for s in service.config().stores
        ]
    }


@METHODS.register(
    "debrief/create_catalogue",
    "Creates an empty catalogue in a folder and adds it to the configuration.",
    mp.CreateCatalogue,
    request=models.CreateCatalogueParams,
    reply=models.CreateCatalogueReply,
)
def _create_catalogue(
    service: ToolService, params: dict[str, Any], asked: mp.CreateCatalogue
) -> dict[str, Any]:
    """Create an empty catalogue in a folder and add it to the user's configuration."""
    title = asked.title.strip()
    folder = Path(asked.location)
    if folder.exists() and any(folder.iterdir()) and not (folder / "catalog.json").exists():
        raise RpcError(INVALID_PARAMS, f"{folder} is not empty. Choose an empty folder.")
    try:
        if not (folder / "catalog.json").exists():
            folder.mkdir(parents=True, exist_ok=True)
            identifier = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "catalogue"
            Catalogue.create(folder, identifier, title, "")
        store = {}

        def add(config: models.UserConfig) -> models.UserConfig:
            changed, added = add_store(config, title=title, location=str(folder))
            store["id"] = added.id
            return changed

        update_config(add, Path(service.config_path) if service.config_path else None)
    except (CatalogueError, ConfigError, StoreBusy, OSError) as error:
        raise rpc_error(error) from None
    return {"store": store["id"]}


@METHODS.register(
    "debrief/import_rep",
    "`debrief/import` under its old name.",
    mp.Import,
    agent=True,
    request=models.ImportParams,
    reply=models.ImportReply,
)
@METHODS.register(
    "debrief/import",
    "Imports a REP file, a legacy plot or a Word or PDF document as a new plot.",
    mp.Import,
    agent=True,
    request=models.ImportParams,
    reply=models.ImportReply,
)
def _import(service: ToolService, params: dict[str, Any], asked: mp.Import) -> dict[str, Any]:
    """Import a REP file (EXT-01), a legacy plot file, .dpf (EXT-14, EXT-15), or a Word
    or PDF document (CAP-19, EXT-04: its narrative, or an ASW document's track, named
    track_name; types as for import_narrative) as a new plot.
    Nothing in the file is dropped silently: what is not imported is listed.
    For a REP file, modes says how each track is plotted (otg or dr, one for all or by
    track name), as the host asked the analyst or remembered for them; remembered, the
    words saying how to change that choice. The service never reads that choice itself."""
    path = params.get("path")
    store = service.store(params.get("store"), writing=True)
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
            "agent": agent_ref(params),
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
                catalogue, Path(path), modes=asked.modes, remembered=asked.remembered, **options
            )
    except NewerSchemaError as error:
        raise RpcError(NEWER_SCHEMA, str(error)) from None
    except MAPPED as error:
        message = str(error)
        if not message.startswith(Path(path).name):
            message = f"{Path(path).name} could not be imported: {message}"
        raise rpc_error(error, message) from None
    return {
        "item": report.item_id,
        "tracks": report.tracks,
        "fixes": report.fixes,
        "annotations": report.annotations,
        "narrative_entries": report.narrative_entries,
        "omitted": report.omitted,
        "notes": report.notes,
    }


@METHODS.register(
    "debrief/add_plot_file",
    "Adds a plot file from a colleague, with its whole history.",
    agent=True,
    request=models.AddPlotFileParams,
    reply=models.AddPlotFileReply,
)
def _add_plot_file(service: ToolService, params: dict[str, Any], _: None) -> dict[str, Any]:
    """Add a plot file received from a colleague (a .geojson plot) to a catalogue,
    with its whole history, so undo, redo and provenance come with it (decision
    13 Oct). A file whose history does not match its checksums is refused."""
    path = params.get("path")
    store = service.store(params.get("store"), writing=True)
    if not isinstance(path, str) or not Path(path).is_file():
        raise RpcError(INVALID_PARAMS, f"{path} is not a file.")
    try:
        catalogue = Catalogue.open(Path(store.location))
        item = catalogue.add_plot_file(
            Path(path),
            agent_ref(params),
            allow_newer_schema=params.get("allow_newer_schema") is True,
        )
        steps = len(catalogue.history(item).steps())
        title = catalogue.read_item(item).properties.title or item
    except NewerSchemaError as error:
        raise RpcError(NEWER_SCHEMA, str(error)) from None
    except MAPPED as error:
        message = str(error)
        if not message.startswith(Path(path).name):
            message = f"{Path(path).name} could not be added: {message}"
        raise rpc_error(error, message) from None
    return {"item": item, "title": title, "steps": steps}


@METHODS.register(
    "debrief/rep_tracks",
    "The tracks a REP file would import, to ask how each is plotted.",
    mp.RepTracks,
    request=models.RepTracksParams,
    reply=models.RepTracksReply,
)
def _rep_tracks(
    service: ToolService, params: dict[str, Any], asked: mp.RepTracks
) -> dict[str, Any]:
    """The tracks a REP file would import, so the host can ask the analyst how each is
    plotted, over the ground or by dead reckoning, before importing it (CAP-01). A
    legacy plot file says for itself: none are listed. Changes nothing."""
    path = Path(asked.path)
    if _is_plot_file(path) or _is_document(path):
        return {"tracks": []}
    try:
        return {"tracks": rep_track_names(path)}
    except (OSError, ValueError) as error:
        raise rpc_error(error, f"{path.name} could not be read: {error}") from None


@METHODS.register(
    "debrief/preview_narrative",
    "What a narrative file holds, before it is read.",
    mp.PreviewNarrative,
    request=models.PreviewNarrativeParams,
    reply=models.NarrativePreview,
)
def _preview_narrative(
    service: ToolService, params: dict[str, Any], asked: mp.PreviewNarrative
) -> dict[str, Any]:
    """What a narrative file holds, before it is read, so the host can ask the analyst
    what legacy Debrief asked (CAP-19): its format and dialect, its entry types with
    counts, its sources with the track each would belong to, its period and, given a
    plot (store and item), how many entries fall outside its tracks' period, whether
    the file was read into the plot before (earlier: when, by whom, the step; known by
    its content hash, whatever its name) and how many of its entries the plot has
    already (already). An ASW data document says how many positions it holds
    instead. Changes nothing."""
    catalogue = None
    if asked.item is not None:
        store = service.store(params.get("store"), writing=False)
        try:
            catalogue = Catalogue.open(Path(store.location))
            catalogue.read_item(asked.item)
        except (CatalogueError, StoreBusy, OSError) as error:
            raise rpc_error(error) from None
    try:
        return preview_narrative(Path(asked.path), catalogue=catalogue, item_id=asked.item)
    except (NoNarrativeError, CatalogueError, HistoryError, StoreBusy, OSError) as error:
        raise rpc_error(error) from None


@METHODS.register(
    "debrief/preview_sensor",
    "What a file's sensor lines hold, before they are read.",
    mp.PreviewSensor,
    request=models.PreviewSensorParams,
    reply=models.SensorPreview,
)
def _preview_sensor(
    service: ToolService, params: dict[str, Any], asked: mp.PreviewSensor
) -> dict[str, Any]:
    """What a .dsf or REP file's sensor lines hold, before they are read into a plot
    (CAP-22), so the host can ask what legacy Debrief asked: each sensor (by track and
    name) with its cuts, ambiguous ones and period, and the plot's track that would
    carry it (null: ask, as legacy's "Sensor track not found"); the plot's tracks; what
    will not be imported (frequencies, lines with no bearing, bearing accuracies);
    whether the file was read into the plot before. Changes nothing."""
    store = service.store(params.get("store"), writing=False)
    try:
        catalogue = Catalogue.open(Path(store.location))
        catalogue.read_item(asked.item)
        return preview_sensor(Path(asked.path), catalogue=catalogue, item_id=asked.item)
    except (CatalogueError, HistoryError, StoreBusy, OSError) as error:
        raise rpc_error(error) from None


@METHODS.register(
    "debrief/tote",
    "Measures between a primary track and its secondaries at one time.",
    mp.Tote,
    request=models.ToteParams,
    reply=models.ToteResult,
)
def _tote(service: ToolService, params: dict[str, Any], asked: mp.Tote) -> dict[str, Any]:
    """The Tote at one time (CAP-06): a ToteResult. tote, a ToteView, says which
    tracks and which measure group; left out, the plot's island says. One call per
    change of current time, so it reads nothing it need not (NFR-04)."""
    store = service.store(params.get("store"), writing=False)
    try:
        catalogue = Catalogue.open(Path(store.location))
        revision = params.get("revision")
        return tote(
            catalogue,
            asked.item,
            asked.time,
            asked.tote,
            revision if isinstance(revision, str) else None,
        )
    except FileNotFoundError:
        raise RpcError(
            INVALID_PARAMS, f"There is no plot {asked.item!r} in {store.title}."
        ) from None
    except MAPPED as error:
        raise rpc_error(error) from None


@METHODS.register(
    "debrief/measure_groups",
    "The measure groups the Tote can show.",
    request=models.NoParams,
    reply=models.MeasureGroupsReply,
)
def _measure_groups(service: ToolService, params: dict[str, Any], _: None) -> dict[str, Any]:
    return measure_groups()


@METHODS.register(
    "debrief/review_flags",
    "Every plot that may need review.",
    request=models.NoParams,
    reply=models.ReviewFlagsReply,
)
def _review_flags(service: ToolService, params: dict[str, Any], _: None) -> dict[str, Any]:
    """Every plot in the analyst's catalogues that drew from an item since revised, so
    may need review (CAP-12), with the store each is in."""
    catalogues: list[tuple[models.KnownStore, Catalogue]] = []
    for store in service.config().stores:
        try:
            catalogues.append((store, Catalogue.open(Path(store.location))))
        except (CatalogueError, OSError, ValueError):
            continue
    stores = {catalogue.id: store.id for store, catalogue in catalogues}
    flags = review_flags([c for _, c in catalogues])
    return {
        "flags": [
            {**f.model_dump(mode="json", exclude_none=True), "store": stores.get(f.catalogue)}
            for f in flags
        ]
    }


# Methods on one plot, inside its history: (PlotCall, the params checked) -> what the
# method adds to {recovered, base, latest}.


@_reads_plot(
    "debrief/open",
    "Makes the plot whole and returns its base and view.",
    request=models.OpenParams,
    reply=models.OpenReply,
)
def _open(call: PlotCall, _: None) -> dict[str, Any]:
    """The plot made whole (recovered). Opening a plot that still has a retired
    presentation.json: a writer that says who it is (agent) makes it one recorded step
    and deletes it; where that cannot be done (a read-only store, or no agent) the plot
    comes back with it applied in memory, for display."""
    out: dict[str, Any] = {}
    catalogue, item = call.catalogue, call.item
    if catalogue.legacy_presentation(item) is not None:
        # Migrating is a change, recorded with who made it: only with an agent (SUB-24).
        migrated = False
        if not call.store.read_only and call.params.get("agent") is not None:
            try:
                out = {"migrated": catalogue.migrate_presentation(item, call.agent)}
                migrated = True
            except (NewerSchemaError, OSError):
                pass
        if not migrated:
            out = {"plot": json.loads(dump_document(DocumentKind.PLOT, catalogue.read_plot(item)))}
    return {**out, **call.view()}


@_reads_plot(
    "debrief/history", "The plot's steps.", request=models.HistoryParams, reply=models.HistoryReply
)
def _steps(call: PlotCall, _: None) -> dict[str, Any]:
    """The plot's steps: seq, status, kind, tool, agent, at."""
    return {"steps": history_steps(call.history)}


@METHODS.register(
    "debrief/goto",
    "Moves to a step.",
    mp.Goto,
    writes=True,
    history=True,
    request=models.GotoParams,
    reply=models.PlotReply,
)
@METHODS.register(
    "debrief/redo",
    "Redoes the step undone last.",
    writes=True,
    history=True,
    request=models.MoveParams,
    reply=models.PlotReply,
)
@METHODS.register(
    "debrief/undo",
    "Undoes the last step.",
    writes=True,
    history=True,
    request=models.MoveParams,
    reply=models.PlotReply,
)
def _move(call: PlotCall, asked: mp.Goto | None) -> dict[str, Any]:
    """Undo, redo or goto a step: recorded with no one, since the steps name theirs."""
    step = asked.step if asked else call.params.get("step")
    how = call.method.removeprefix("debrief/")
    move(call.history, how, call.base, step, allow_newer_schema=call.allow)
    return {}


@_changes_plot(
    "debrief/set_colour",
    "Colours features.",
    mp.SetColour,
    request=models.SetColourParams,
    reply=models.PlotChangeReply,
)
def _set_colour(call: PlotCall, asked: mp.SetColour) -> dict[str, Any]:
    """Colour tracks (and anything else with a colour)."""
    step = call.catalogue.set_colour(
        call.item,
        asked.features,
        asked.colour,
        call.agent,
        call.base,
        colour_name=asked.colour_name,
        allow_newer_schema=call.allow,
    )
    return {"changed": step is not None}


@_changes_plot(
    "debrief/set_hidden",
    "Hides or shows features, cuts among them.",
    mp.SetHidden,
    request=models.SetHiddenParams,
    reply=models.PlotChangeReply,
)
def _set_hidden(call: PlotCall, asked: mp.SetHidden) -> dict[str, Any]:
    """Hide or show features; cuts among them are left out of every solution's residuals
    until shown again, which notes says."""
    step = call.catalogue.set_hidden(
        call.item,
        asked.features,
        asked.hidden,
        call.agent,
        call.base,
        allow_newer_schema=call.allow,
    )
    if step is None:
        return {"changed": False}
    return {"changed": True, "notes": list(call.notes(step))}


@_changes_plot(
    "debrief/set_track_frequencies",
    "How often tracks are labelled, marked and arrowed.",
    mp.SetTrackFrequencies,
    request=models.SetTrackFrequenciesParams,
    reply=models.PlotChangeReply,
)
def _set_track_frequencies(call: PlotCall, asked: mp.SetTrackFrequencies) -> dict[str, Any]:
    """How often tracks are labelled, marked with a symbol and given a direction arrow
    (CAP-32): each of label_interval, symbol_interval and arrow_interval given."""
    changes = {f: call.params[f] for f in frequencies.FIELDS if f in call.params}
    step = call.catalogue.set_track_frequencies(
        call.item, asked.features, changes, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": step is not None}


@_changes_plot(
    "debrief/set_view",
    "Changes the plot's view, outside its history.",
    mp.SetView,
    request=models.SetViewParams,
    reply=models.IslandReply,
)
def _set_view(call: PlotCall, asked: mp.SetView) -> dict[str, Any]:
    """The plot's view, its island, kept outside its history (SUB-22, decision 12 Oct):
    changed only if hash is the view's hash as last read."""
    call.catalogue.write_view(
        call.item, asked.view, asked.hash, agent=call.agent, allow_newer_schema=call.allow
    )
    return call.view()


@_changes_plot(
    "debrief/add_annotation",
    "Adds an annotation.",
    mp.AddAnnotation,
    request=models.AddAnnotationParams,
    reply=models.PlotChangeReply,
)
def _add_annotation(call: PlotCall, asked: mp.AddAnnotation) -> dict[str, Any]:
    """An annotation, described as an AnnotationSpec (the forms' description; its
    positions numbers or text in any notation the analyst types), added as one step
    named like "Circle 'Exclusion zone' added" (CAP-03)."""
    _, feature = call.catalogue.add_annotation(
        call.item, asked.annotation, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": True, "feature": feature}


@_changes_plot(
    "debrief/edit_annotation",
    "Changes an annotation.",
    mp.EditAnnotation,
    request=models.EditAnnotationParams,
    reply=models.PlotChangeReply,
)
def _edit_annotation(call: PlotCall, asked: mp.EditAnnotation) -> dict[str, Any]:
    """An annotation changed: only the members that change need be given."""
    step = call.catalogue.edit_annotation(
        call.item,
        asked.feature,
        asked.annotation,
        call.agent,
        call.base,
        allow_newer_schema=call.allow,
    )
    return {"changed": step is not None, "feature": asked.feature}


@_changes_plot(
    "debrief/delete_annotations",
    "Deletes annotations.",
    mp.DeleteAnnotations,
    request=models.DeleteFeaturesParams,
    reply=models.PlotChangeReply,
)
def _delete_annotations(call: PlotCall, asked: mp.DeleteAnnotations) -> dict[str, Any]:
    call.catalogue.delete_annotations(
        call.item, asked.features, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": True}


@_changes_plot(
    "debrief/set_north_arrow",
    "Shows or hides the north arrow.",
    mp.SetNorthArrow,
    request=models.SetNorthArrowParams,
    reply=models.PlotChangeReply,
)
def _set_north_arrow(call: PlotCall, asked: mp.SetNorthArrow) -> dict[str, Any]:
    step = call.catalogue.set_north_arrow(
        call.item, asked.shown, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": step is not None}


@_changes_plot(
    "debrief/add_narrative",
    "Adds a narrative entry.",
    mp.AddNarrative,
    request=models.AddNarrativeParams,
    reply=models.PlotChangeReply,
)
def _add_narrative(call: PlotCall, asked: mp.AddNarrative) -> dict[str, Any]:
    """A narrative entry, described as a NarrativeSpec: time (UTC to the millisecond),
    source, entry_type, text and track_id (left out, the track named as its source),
    added as one step named like "Narrative entry by BLUE ONE at 08:40:00Z added"
    (CAP-20)."""
    _, feature = call.catalogue.add_narrative(
        call.item, asked.entry, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": True, "feature": feature}


@_changes_plot(
    "debrief/edit_narrative",
    "Changes a narrative entry.",
    mp.EditNarrative,
    request=models.EditNarrativeParams,
    reply=models.PlotChangeReply,
)
def _edit_narrative(call: PlotCall, asked: mp.EditNarrative) -> dict[str, Any]:
    """An entry changed: only the members that change need be given; None clears one."""
    step = call.catalogue.edit_narrative(
        call.item, asked.feature, asked.entry, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": step is not None, "feature": asked.feature}


@_changes_plot(
    "debrief/delete_narrative",
    "Deletes narrative entries.",
    mp.DeleteNarrative,
    request=models.DeleteFeaturesParams,
    reply=models.PlotChangeReply,
)
def _delete_narrative(call: PlotCall, asked: mp.DeleteNarrative) -> dict[str, Any]:
    call.catalogue.delete_narrative(
        call.item, asked.features, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": True}


@_changes_plot(
    "debrief/import_narrative",
    "Reads a file's narrative into the plot.",
    mp.ImportNarrative,
    request=models.ImportNarrativeParams,
    reply=models.NarrativeImportReply,
)
def _import_narrative(call: PlotCall, asked: mp.ImportNarrative) -> dict[str, Any]:
    """The narrative of a REP file or a Word (.docx, .doc) or PDF document (path) read
    into the plot as one step, with the analyst's choices as legacy Debrief asked them
    (see debrief_io.Choices): types, the entry types to read ("" for none; left out,
    all); within_period, only entries within the plot's tracks' period; tracks, the
    track id (or null) of a platform; platform, the source of entries whose document
    names none. A file read into the plot before (known by its content, whatever its
    name) or with entries the plot has already (the same time, source and text) is
    refused (NEEDS_CONFIRMATION, the message saying when it was read in and how many
    entries are there) unless duplicates says "skip" (read only the entries not in the
    plot) or "add" (read them all again)."""
    try:
        choices = Choices.of(call.params)
    except ValueError as error:
        raise RpcError(INVALID_PARAMS, str(error)) from None
    try:
        done = import_narrative(
            call.catalogue,
            call.item,
            Path(asked.path),
            call.agent,
            call.base,
            allow_newer_schema=call.allow,
            choices=choices,
        )
    except AlreadyInPlotError as error:
        raise RpcError(NEEDS_CONFIRMATION, str(error)) from None
    except NoNarrativeError as error:
        raise RpcError(INVALID_PARAMS, str(error)) from None
    return {
        "changed": True,
        "entries": done.entries,
        "sources": done.sources,
        "omitted": done.omitted,
        "notes": done.notes,
    }


@_reads_plot(
    "debrief/narrative",
    "The plot's narrative entries, filtered and paged.",
    mp.NarrativeQuery,
    request=models.NarrativeParams,
    reply=models.NarrativeReply,
)
def _narrative(call: PlotCall, asked: mp.NarrativeQuery) -> dict[str, Any]:
    """The plot's narrative on one Zulu time axis (CAP-20), all its sources merged in one
    order, with what agents filter by: sources and types (lists; "" is an entry with no
    type), text (found in an entry's text, source or type, ignoring case), start and end
    (UTC, ends included); offset and limit page through (at most NARRATIVE_LIMIT a call).
    at, a UTC time, also gives the entry current time would be at among those matching:
    the last at or before it. Returns the entries, how many match in all, and each
    source's and type's count over the whole narrative."""
    plot = call.history.plot()
    wanted = narrative.Query(
        sources=frozenset(asked.sources) if asked.sources is not None else None,
        types=frozenset(asked.types) if asked.types is not None else None,
        text=asked.text or None,
        start_ms=asked.start,
        end_ms=asked.end,
    )
    every = narrative.order(narrative.entries(plot))
    matching = [f for f in every if wanted.matches(f, parse_utc(f.properties.time))]
    page = matching[asked.offset : asked.offset + min(asked.limit, mp.NARRATIVE_LIMIT)]
    out: dict[str, Any] = {
        "entries": [narrative.as_json(f) for f in page],
        "total": len(matching),
        "offset": asked.offset,
        **narrative.summary(every),
    }
    if asked.at is not None:
        times = [parse_utc(f.properties.time) for f in matching]
        index = narrative.current_index(times, asked.at)
        out["current"] = matching[index].id if index >= 0 else None
    return out


# The most cuts debrief/sensors lists in one call.
CUT_LIMIT = 20_000


@_reads_plot(
    "debrief/sensors",
    "The plot's sensors, and perhaps their cuts.",
    mp.SensorQuery,
    request=models.SensorsParams,
    reply=models.SensorsReply,
)
def _sensors(call: PlotCall, asked: mp.SensorQuery) -> dict[str, Any]:
    """The plot's sensors (CAP-22), each with its host track, colour, whether it is
    hidden, how many cuts it has, how many are still ambiguous and how many resolved,
    and its first and last cut's time. sensor_ids narrows them; cuts true also lists
    each sensor's cuts within period ({start, end}, ends included; at most CUT_LIMIT in
    all), each with its time, bearing, ambiguous bearing and which was kept, the side
    its first bearing is on, its range, label and comment, and where it is drawn from
    (the host's position then, as the map places it; null outside the host's span):
    what a TMA solution (CAP-21) is rooted in."""
    found = sensors.describe(
        call.history.plot(),
        sensor_ids=asked.sensor_ids,
        period=asked.period,
        with_cuts=asked.cuts,
    )
    if asked.cuts:
        total = sum(len(s["cut_list"]) for s in found)
        if total > CUT_LIMIT:
            raise RpcError(
                INVALID_PARAMS,
                f"{total:,} cuts match: ask for at most {CUT_LIMIT:,}, by a shorter period or "
                "fewer sensors.",
            )
    return {"sensors": found}


@_changes_plot(
    "debrief/resolve_ambiguity",
    "Keeps one side of ambiguous cuts, or makes them ambiguous again.",
    request=models.ResolveAmbiguityParams,
    reply=models.PlotChangeReply,
)
def _resolve_ambiguity(call: PlotCall, _: None) -> dict[str, Any]:
    """Keep one side of ambiguous cuts, or make them ambiguous again: keep is port or
    starboard (of the course logged where the sensor was at each cut's time, as legacy
    Debrief's Keep port bearing), bearing or ambiguous_bearing (the bearing recorded
    first, or its twin), or ambiguous; the cuts are cut_ids, or sensor_ids and perhaps a
    period ({start, end}: the time window, say), hidden cuts left out unless named. One
    step, named like "Port kept: 42 Towed array cuts 09:00:00Z–09:59:30Z"."""
    asked = {k: call.params[k] for k in mp.RESOLVE_ASKED if k in call.params}
    step = call.catalogue.resolve_ambiguity(
        call.item, asked, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": True, "notes": call.notes(step)}


@_changes_plot(
    "debrief/import_sensor",
    "Reads a file's sensor lines into the plot.",
    mp.ImportSensor,
    request=models.ImportSensorParams,
    reply=models.SensorImportReply,
)
def _import_sensor(call: PlotCall, asked: mp.ImportSensor) -> dict[str, Any]:
    """A .dsf (or REP) file's ;SENSOR:, ;SENSOR2: and ;SENSOR3: lines read into the plot
    (path), the file kept as its source, as one step. hosts gives, for a track name the
    lines give, the id of the plot's track that carries its sensors (or null: not read);
    names matching a track (ignoring case, or by their first six letters) need not be
    said. A sensor whose track is neither is refused (NEEDS_CONFIRMATION, naming the
    plot's tracks), as is a file read in before unless again is true.
    debrief/preview_sensor says what a file holds first."""
    try:
        done = import_sensor(
            call.catalogue,
            call.item,
            Path(asked.path),
            call.agent,
            call.base,
            hosts=asked.hosts,
            again=asked.again,
            allow_newer_schema=call.allow,
        )
    except (HostNeeded, SensorReadBefore) as error:
        raise RpcError(NEEDS_CONFIRMATION, str(error)) from None
    except NoSensorDataError as error:
        raise RpcError(INVALID_PARAMS, str(error)) from None
    return {
        "changed": True,
        "sensors": done.sensors,
        "cuts": done.cuts,
        "omitted": done.omitted,
        "notes": done.notes,
    }


@_changes_plot(
    "debrief/set_array_offset",
    "How far astern a towed array is, and how it follows.",
    mp.SetArrayOffset,
    request=models.SetArrayOffsetParams,
    reply=models.PlotChangeReply,
)
def _set_array_offset(call: PlotCall, asked: mp.SetArrayOffset) -> dict[str, Any]:
    """How far astern a towed array is (offset {value, unit}, or null for at the ship)
    and how it follows (mode worm_in_hole, legacy's default, or plain), for sensor_ids;
    the cuts are then drawn, and their sides told, from the array. One step, named like
    "Towed array: 300 yd astern, worm in the hole"; changed false if the sensors were so
    already."""
    step = call.catalogue.set_array_offset(
        call.item,
        asked.sensor_ids,
        asked.offset,
        call.agent,
        call.base,
        mode=asked.mode,
        allow_newer_schema=call.allow,
    )
    if step is None:
        return {"changed": False}
    return {"changed": True, "notes": call.notes(step)}


@_changes_plot(
    "debrief/delete_cuts",
    "Deletes cuts.",
    mp.DeleteCuts,
    request=models.CutsParams,
    reply=models.PlotChangeReply,
)
def _delete_cuts(call: PlotCall, asked: mp.DeleteCuts) -> dict[str, Any]:
    """Cuts deleted as one step, the solutions rooted in them dropping them, which notes
    says (product owner, 27 Oct 2026)."""
    step = call.catalogue.delete_cuts(
        call.item, asked.cut_ids, call.agent, call.base, allow_newer_schema=call.allow
    )
    return {"changed": True, "notes": call.notes(step)}


@_reads_plot(
    "debrief/tma_residuals",
    "A solution's bearing residuals and RMS error.",
    mp.TmaResiduals,
    request=models.TmaResidualsParams,
    reply=models.TmaResidualsReply,
)
def _tma_residuals(call: PlotCall, asked: mp.TmaResiduals) -> dict[str, Any]:
    """A TMA solution's bearing residuals and RMS error (CAP-21)."""
    return {"residuals": call.catalogue.tma_residuals(call.item, asked.feature, call.base)}


@_changes_plot(
    "debrief/tma_create",
    "Makes a TMA solution from a sensor's cuts.",
    mp.TmaCreate,
    request=models.TmaCreateParams,
    reply=models.TmaCreateReply,
)
def _tma_create(call: PlotCall, asked: mp.TmaCreate) -> dict[str, Any]:
    """A TMA solution (CAP-21; product owner, 24 Oct 2026) as one step, from the cuts
    (sensor_ids and perhaps a period, or cut_ids), perhaps a contact, a name and a
    colour, and a first guess: range, course and speed (and, for an ambiguous first cut,
    first_bearing), or first_position and last_position (on or near the first cut's
    line and the last's); with none, Debrief's (10,000 yd along the first cut's bearing,
    across it, 8 kn). A TmaRequest, in request or as the params themselves. Returns the
    solution's id and its residuals."""
    request = asked.request
    if request is None:
        request = {k: v for k, v in call.params.items() if k in mp.TMA_ASKED}
    step, feature = call.catalogue.create_tma(
        call.item, request, call.agent, call.base, allow_newer_schema=call.allow
    )
    notes = call.notes(step)
    residuals = call.catalogue.tma_residuals(call.item, feature)
    return {"changed": True, "feature": feature, "notes": notes, "residuals": residuals}


@_changes_plot(
    "debrief/tma_split_leg",
    "Splits a solution into legs, or joins two.",
    mp.TmaSplitLeg,
    request=models.TmaSplitLegParams,
    reply=models.PlotChangeReply,
)
def _tma_split_leg(call: PlotCall, asked: mp.TmaSplitLeg) -> dict[str, Any]:
    """A solution (feature) split into legs at a time (at), or before or after the fix
    there (side); join true joins the leg starting then to the one before."""
    step = call.catalogue.tma_split_leg(
        call.item,
        asked.feature,
        asked.at,
        call.agent,
        call.base,
        join=asked.join,
        side=asked.side,
        allow_newer_schema=call.allow,
    )
    return {"changed": True, "notes": call.notes(step)}


@_changes_plot(
    "debrief/tma_exclude_cut",
    "Leaves cuts out of a solution's RMS error, or counts them again.",
    mp.TmaExcludeCut,
    request=models.TmaExcludeCutParams,
    reply=models.TmaChangeReply,
)
def _tma_exclude_cut(call: PlotCall, asked: mp.TmaExcludeCut) -> dict[str, Any]:
    """A solution's cuts (cut_ids) left out of its RMS error (excluded true) or counted
    again (false); changed is false if none would change."""
    step = call.catalogue.tma_exclude(
        call.item,
        asked.feature,
        asked.cut_ids,
        asked.excluded,
        call.agent,
        call.base,
        allow_newer_schema=call.allow,
    )
    if step is None:
        return {"changed": False}
    return {
        "changed": True,
        "notes": call.notes(step),
        "residuals": call.catalogue.tma_residuals(call.item, asked.feature),
    }


@_changes_plot(
    "debrief/edit_track",
    "Moves, rotates, shears or stretches a track, moves a fix, or plots it by dead reckoning.",
    mp.EditTrack,
    request=models.EditTrackParams,
    reply=models.PlotChangeReply,
)
def _edit_track(call: PlotCall, asked: mp.EditTrack) -> dict[str, Any]:
    """A track moved, rotated, sheared or stretched by hand as one step, named like
    "BLUE ONE moved 1.20 nmi 045.0°T" (CAP-01, CAP-02, CAP-21). edit is a TrackEdit: move
    with distance and bearing; rotate with angle and perhaps pivot; shear with anchor and
    either distance and bearing for the dragged end or course and speed; stretch with
    anchor and speed; each for a period or the whole track; a single fix moved
    (move_fix) or the track plotted by dead reckoning (set_plotting_mode). current_time
    is a rotation's default pivot. A TMA solution is a track, so it is dragged here."""
    step = call.catalogue.edit_track(
        call.item,
        asked.feature,
        asked.edit,
        call.agent,
        call.base,
        current_time=asked.current_time,
        allow_newer_schema=call.allow,
    )
    return {"changed": step is not None, "feature": asked.feature}


@_changes_plot(
    "debrief/split_track",
    "Splits a track in two.",
    mp.SplitTrack,
    request=models.SplitTrackParams,
    reply=models.PlotChangeReply,
)
def _split_track(call: PlotCall, asked: mp.SplitTrack) -> dict[str, Any]:
    """A track split in two at a time (at), with perhaps names for the parts."""
    _, parts = call.catalogue.split_track(
        call.item,
        asked.feature,
        asked.at,
        call.agent,
        call.base,
        names=asked.names,
        allow_newer_schema=call.allow,
    )
    return {"changed": True, "features": parts}


@_changes_plot(
    "debrief/merge_tracks",
    "Merges tracks into one.",
    mp.MergeTracks,
    request=models.MergeTracksParams,
    reply=models.PlotChangeReply,
)
def _merge_tracks(call: PlotCall, asked: mp.MergeTracks) -> dict[str, Any]:
    """Tracks merged into one, perhaps named; notes says what was not kept (speeds,
    courses or depths some of the tracks had not)."""
    _, merged, lost = call.catalogue.merge_tracks(
        call.item,
        asked.features,
        call.agent,
        call.base,
        name=asked.name,
        allow_newer_schema=call.allow,
    )
    return {"changed": True, "feature": merged, "notes": lost}


@_reads_plot(
    "debrief/find_jumps",
    "A track's jumps.",
    mp.FindJumps,
    request=models.FindJumpsParams,
    reply=models.JumpsReply,
)
def _find_jumps(call: PlotCall, asked: mp.FindJumps) -> dict[str, Any]:
    """A track's jumps, shown before any is removed (CAP-01, EXT-14): fixes reached
    faster than threshold (a speed; left out, three times the track's median speed, at
    least 10 kn), within period. Changes nothing."""
    used, median, jumps = call.catalogue.find_jumps(
        call.item, asked.feature, threshold=asked.threshold, period=asked.period, base=call.base
    )
    return {
        "feature": asked.feature,
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


@_changes_plot(
    "debrief/remove_jumps",
    "Removes fixes found as jumps.",
    mp.RemoveJumps,
    request=models.RemoveJumpsParams,
    reply=models.PlotChangeReply,
)
def _remove_jumps(call: PlotCall, asked: mp.RemoveJumps) -> dict[str, Any]:
    """The fixes at times removed as one step; threshold, what they were found at, for
    the record."""
    call.catalogue.remove_jumps(
        call.item,
        asked.feature,
        asked.times,
        call.agent,
        call.base,
        threshold=asked.threshold,
        allow_newer_schema=call.allow,
    )
    return {"changed": True, "feature": asked.feature}


@_reads_plot(
    "debrief/preview_smoothing",
    "A track as smoothing would leave it.",
    mp.Smoothing,
    request=models.SmoothingPreviewParams,
    reply=models.SmoothingPreviewReply,
)
def _preview_smoothing(call: PlotCall, asked: mp.Smoothing) -> dict[str, Any]:
    """The track as smoothing over window (an odd number of fixes) within period would
    leave it. Changes nothing."""
    after, smoothing = call.catalogue.smoothing_preview(
        call.item, asked.feature, asked.window, period=asked.period, base=call.base
    )
    return {
        "feature": asked.feature,
        "preview": after.geometry.model_dump(mode="json"),
        **_smoothing(smoothing),
    }


@_changes_plot(
    "debrief/smooth_track",
    "Smooths a track.",
    mp.Smoothing,
    request=models.SmoothTrackParams,
    reply=models.SmoothingReply,
)
def _smooth_track(call: PlotCall, asked: mp.Smoothing) -> dict[str, Any]:
    """The track smoothed over window within period, as one step."""
    done = call.catalogue.smooth_track(
        call.item,
        asked.feature,
        asked.window,
        call.agent,
        call.base,
        period=asked.period,
        allow_newer_schema=call.allow,
    )
    return {
        "changed": done is not None,
        "feature": asked.feature,
        **(_smoothing(done[1]) if done else {}),
    }


@_changes_plot(
    "debrief/mark_fix",
    "Gives a fix a colour, label or comment of its own.",
    mp.MarkFix,
    request=models.MarkFixParams,
    reply=models.PlotChangeReply,
)
def _mark_fix(call: PlotCall, asked: mp.MarkFix) -> dict[str, Any]:
    """A fix (at time) given a colour, label or comment of its own (changes: null or ""
    takes one away; show_label, show_symbol: true to always show its time label or
    symbol, false to stop), as one step; colour_name for the step's name."""
    step = call.catalogue.mark_fix(
        call.item,
        asked.feature,
        asked.time,
        asked.changes,
        call.agent,
        call.base,
        colour_name=asked.colour_name,
        allow_newer_schema=call.allow,
    )
    return {"changed": step is not None, "feature": asked.feature}


@_reads_plot(
    "debrief/coverage",
    "The plot's coverage: its platforms and the items with data for each.",
    request=models.CoverageParams,
    reply=models.CoverageReply,
)
def _coverage(call: PlotCall, _: None) -> dict[str, Any]:
    """The plot's coverage (CAP-08 to CAP-12): its platforms and every catalogue item with
    data for each, the items marked as new data for it, and whether it may need review."""
    report = call.catalogue.coverage(call.item, call.service.other_catalogues(call.catalogue))
    return {"coverage": report.model_dump(mode="json", exclude_none=True)}


@_changes_plot(
    "debrief/take_new_data",
    "Takes an item's new data into the plot.",
    mp.TakeNewData,
    request=models.TakeNewDataParams,
    reply=models.TakeNewDataReply,
)
def _take_new_data(call: PlotCall, asked: mp.TakeNewData) -> dict[str, Any]:
    """A catalogue item's data taken into the plot (source: {catalogue, item}, the
    catalogue by its own id, and revision, the revision the analyst saw, if any), one
    step naming it. No step when the plot has the item's data as it is now already:
    changed false, and a message saying so."""
    source = asked.source
    revision = source.get("revision")
    step = call.catalogue.take_new_data(
        call.item,
        source["catalogue"],
        source["item"],
        call.agent,
        call.base,
        others=call.service.other_catalogues(call.catalogue),
        revision=revision if isinstance(revision, str) and revision else None,
        allow_newer_schema=call.allow,
    )
    if step is None:
        # Nothing to take: the plot has the item's data as it is now already.
        return {
            "changed": False,
            "message": "The plot already has this item's data as it is now: nothing "
            "was taken, and it is marked as reviewed against this revision.",
        }
    return {"changed": True, "step": step}


@_changes_plot(
    "debrief/set_source_preference",
    "Chooses which item supplies a period of a track.",
    mp.SetSourcePreference,
    request=models.SetSourcePreferenceParams,
    reply=models.PlotChangeReply,
)
def _set_source_preference(call: PlotCall, asked: mp.SetSourcePreference) -> dict[str, Any]:
    """Which item supplies a period of a track (feature, period {start, end}, source
    {catalogue, item, track, name}), one step."""
    step = call.catalogue.set_source_preference(
        call.item,
        asked.feature,
        asked.period,
        asked.source,
        call.agent,
        call.base,
        others=call.service.other_catalogues(call.catalogue),
        allow_newer_schema=call.allow,
    )
    return {"changed": step is not None}


@_changes_plot(
    "debrief/link_tracks",
    "Links or unlinks a track in another item as a platform.",
    mp.LinkTracks,
    request=models.LinkTracksParams,
    reply=models.PlotChangeReply,
)
def _link_tracks(call: PlotCall, asked: mp.LinkTracks) -> dict[str, Any]:
    """A track in another item (source) confirmed or linked (linked true), or refused or
    unlinked (false), as the platform of the plot's track (feature), one step."""
    step = call.catalogue.link_tracks(
        call.item,
        asked.feature,
        asked.source,
        asked.linked,
        call.agent,
        call.base,
        others=call.service.other_catalogues(call.catalogue),
        allow_newer_schema=call.allow,
    )
    return {"changed": step is not None}


@_changes_plot(
    "debrief/dismiss_new_data",
    "Sets an item's new data aside, in the plot's island.",
    mp.DismissNewData,
    request=models.DismissNewDataParams,
    reply=models.IslandChangeReply,
)
def _dismiss_new_data(call: PlotCall, asked: mp.DismissNewData) -> dict[str, Any]:
    """An item's new data set aside (source with its revision): in the plot's island,
    never a step, with who answered and when."""
    source = asked.source
    call.catalogue.dismiss_new_data(
        call.item, source["catalogue"], source["item"], source["revision"], call.agent
    )
    return {"changed": True, **call.view()}


@_changes_plot(
    "debrief/clear_review_flag",
    "Clears the plot's review flag, in its island.",
    request=models.ClearReviewFlagParams,
    reply=models.IslandChangeReply,
)
def _clear_review_flag(call: PlotCall, _: None) -> dict[str, Any]:
    """The plot's review flag cleared: in the plot's island, never a step, with who
    answered and when."""
    others = call.service.other_catalogues(call.catalogue)
    changed = call.catalogue.clear_review_flag(call.item, others, call.agent) > 0
    return {"changed": changed, **call.view()}


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


# Exported images (SUB-25), and a host (VS Code) waiting for what the service asks of it
# (an agent's export, drawn by an open map) and answering: see figures.py.
for _method in (
    Method(
        "debrief/figure_id",
        "A fresh image ID for an export of the plot.",
        figures.figure_id,
        request=models.FigureIdParams,
        reply=models.FigureIdReply,
    ),
    Method(
        "debrief/export_image",
        "Stamps and logs a host's image, or has an open map draw an agent's.",
        figures.export_image,
        agent=True,
        large=True,
        request=models.ExportImageParams,
        reply=(models.StampedImage, models.ExportedImage),
    ),
    Method(
        "debrief/find_image_source",
        "The plots an image came from, by its file or its ID.",
        figures.find_image_source,
        request=models.FindImageSourceParams,
        reply=models.ImageSources,
    ),
    Method(
        "debrief/open_revision",
        "The plot as it was at a revision, to show read-only.",
        figures.open_revision,
        request=models.OpenRevisionParams,
        reply=models.OpenRevisionReply,
    ),
    Method(
        "debrief/host_poll",
        "A host waits here for what the service asks of it.",
        figures.host_poll,
        protocol=True,
        request=models.HostPollParams,
        reply=models.HostPollReply,
    ),
    Method(
        "debrief/host_answer",
        "A host's answer to one such request.",
        figures.host_answer,
        protocol=True,
        request=models.HostAnswerParams,
        reply=models.EmptyReply,
    ),
):
    METHODS.add(_method)

# Read from METHODS, never kept by hand.
KNOWN_METHODS = frozenset(METHODS)
# Change the plot they name (SUB-25: VS Code refuses them on a revision shown read-only).
WRITING_METHODS = METHODS.names(writes=True)
# Run on one plot, inside its history.
HISTORY_METHODS = METHODS.names(history=True)
READING_METHODS = METHODS.names(history=True, writes=False)
# Refused without agent, never attributed to the analyst by default (SUB-24). Undo, redo
# and goto record no one: they return to steps that already name theirs.
AGENT_METHODS = METHODS.names(agent=True)
# Only an exported image travels in its request (debrief/export_image): an A4 PNG at twice
# its size on screen is a few megabytes, as base 64 a third more. Every other method keeps
# MAX_BODY_BYTES (expert panel, 16 Oct 2026).
IMAGE_METHODS = METHODS.names(large=True)


def _quantity(quantity: UnitQuantity) -> dict[str, Any]:
    return {"value": quantity.value, "unit": quantity.unit}


def _smoothing(smoothing: Any) -> dict[str, Any]:
    """What smoothing did, or would do, and the words that say it."""
    return {
        "moved": smoothing.moved,
        "largest": {"value": smoothing.largest_m, "unit": "m"},
        "largest_time": smoothing.largest_time,
        "summary": describe_largest(smoothing),
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
        if len(body) > MAX_IMAGE_BODY_BYTES:
            return Response("Request too large.", status_code=413)
        try:
            message = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return _error(None, PARSE_ERROR, "Parse error")
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return _error(None, INVALID_REQUEST, "Not a JSON-RPC 2.0 request")
        if len(body) > MAX_BODY_BYTES and _named(message) not in IMAGE_METHODS:
            return Response("Request too large.", status_code=413)
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
        except Exception:  # noqa: BLE001 - the service outlives any one request
            # The method's name only if it is one of ours; the formatter leaves out the message.
            method = message["method"] if message["method"] in KNOWN_METHODS else "-"
            log.exception("rpc_error method=%s", method)
            # Never the exception's text: it may hold plot data or paths the log leaves
            # out, and the client may keep it (NFR-14). The log has its type and frames.
            return _error(message["id"], INTERNAL, INTERNAL_MESSAGE)
        return JSONResponse({"jsonrpc": "2.0", "id": message["id"], "result": result})

    return Starlette(routes=[Route("/mcp", mcp, methods=["POST"])])


def _named(message: dict[str, Any]) -> Any:
    """The method a request runs: its own, or the one tools/call names."""
    params = message.get("params")
    if message.get("method") == "tools/call" and isinstance(params, dict):
        method = METHODS.tool(params.get("name")) if isinstance(params.get("name"), str) else None
        return method.name if method else None
    return message.get("method")


INTERNAL_MESSAGE = (
    "Internal error: the tool service could not complete this request. Nothing in it is "
    "said here; the service's log (tools.log) records what went wrong."
)


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
