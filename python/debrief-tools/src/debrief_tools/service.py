"""The tool service: MCP over HTTP, per user, loopback only, with a session token.

The protocol is MCP's Streamable HTTP transport (JSON-RPC 2.0, one POST per
request, JSON responses), so the VS Code extension and any MCP-capable agent
use the same tools (TL-01, TL-17). Debrief adds methods of its own, named
debrief/...: debrief/tools_for_selection, so the offering rule lives in
Python (TL-08); stores, catalogues and import (REP and legacy .dpf); a plot's history
(debrief/open, debrief/history, debrief/undo, debrief/redo, debrief/goto),
so undo is the same for the extension and an agent (SUB-21); colour and hiding,
recorded in that history like any change (debrief/set_colour, debrief/set_hidden);
and the plot's view, its island, kept in the plot file outside its history
(debrief/set_view; debrief/open returns it) (SUB-22, decision 12 Oct).

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
from debrief_io import import_dpf, import_rep
from debrief_schemas import DocumentKind, dump_document, load_document, models
from debrief_stac import (
    Base,
    Catalogue,
    CatalogueError,
    Conflict,
    HistoryError,
    NewerSchemaError,
)
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


class RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL = -32600, -32601, -32602, -32603
CONFLICT = -32001  # the plot changed since the caller's base: open it again (SUB-28)
NEWER_SCHEMA = -32002  # would write a newer schema into the catalogue: ask, then allow (SUB-35)
HISTORY_METHODS = (
    "debrief/open",
    "debrief/history",
    "debrief/undo",
    "debrief/redo",
    "debrief/goto",
    "debrief/set_colour",
    "debrief/set_hidden",
    "debrief/set_view",
)
WRITING_METHODS = HISTORY_METHODS[2:]
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
        if method in HISTORY_METHODS:
            return self._history(method, params)
        raise RpcError(METHOD_NOT_FOUND, f"Unknown method {method}")

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
            if method == "debrief/history":
                out["steps"] = [_step(s) for s in history.steps()]
            return out
        except Conflict as conflict:
            raise RpcError(CONFLICT, str(conflict)) from None
        except NewerSchemaError as error:
            raise RpcError(NEWER_SCHEMA, str(error)) from None
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

    def _import(self, params: dict[str, Any]) -> dict[str, Any]:
        """Import a REP file (EXT-01) or a legacy plot file, .dpf (EXT-14, EXT-15), as a
        new plot. Nothing in the file is dropped silently: what is not imported is listed."""
        path = params.get("path")
        store = self._store(params.get("store"), writing=True)
        if not isinstance(path, str) or not Path(path).is_file():
            raise RpcError(INVALID_PARAMS, f"{path} is not a file.")
        try:
            catalogue = Catalogue.open(Path(store.location))
            stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(path).stem).strip("-.") or "plot"
            taken, item_id, n = set(catalogue.item_ids()), stem, 2
            while item_id in taken:
                item_id, n = f"{stem}-{n}", n + 1
            importer = import_dpf if _is_plot_file(Path(path)) else import_rep
            report = importer(
                catalogue,
                Path(path),
                item_id=item_id,
                agent=_agent(params),
                allow_newer_schema=params.get("allow_newer_schema") is True,
            )
        except NewerSchemaError as error:
            raise RpcError(NEWER_SCHEMA, str(error)) from None
        except (CatalogueError, OSError, ValueError) as error:
            raise RpcError(
                INVALID_PARAMS, f"{Path(path).name} could not be imported: {error}"
            ) from None
        return {
            "item": report.item_id,
            "tracks": report.tracks,
            "fixes": report.fixes,
            "annotations": report.annotations,
            "narrative_entries": report.narrative_entries,
            "omitted": report.omitted,
        }

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
    An edit's note names it, such as "Colour of BLUE ONE set to red"."""
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
