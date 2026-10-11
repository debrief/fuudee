"""The tool service: MCP over HTTP, per user, loopback only, with a session token.

The protocol is MCP's Streamable HTTP transport (JSON-RPC 2.0, one POST per
request, JSON responses), so the VS Code extension and any MCP-capable agent
use the same tools (TL-01, TL-17). Debrief adds one method,
debrief/tools_for_selection, so the offering rule lives in Python (TL-08).

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
from importlib.metadata import version
from pathlib import Path
from typing import Any

from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from debrief_config import ConfigError, add_store, load_config, update_config
from debrief_io import import_rep
from debrief_schemas import DocumentKind, load_document, models
from debrief_stac import Catalogue, CatalogueError
from debrief_tools.registry import applies
from debrief_tools.worker import ToolWorker

PROTOCOL_VERSION = "2025-06-18"
SUPPORTED_VERSIONS = ("2025-06-18", "2025-03-26")
MAX_BODY_BYTES = 10 * 1024 * 1024
DEFAULT_TIMEOUT_S = 120.0
MIN_TOKEN_LENGTH = 32
log = logging.getLogger("debrief_tools")


class RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL = -32600, -32601, -32602, -32603


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
        if method == "debrief/import_rep":
            return self._import_rep(params)
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

    def _import_rep(self, params: dict[str, Any]) -> dict[str, Any]:
        """Import a REP file as a new plot (EXT-01). Nothing in the file is dropped silently."""
        store_id, path = params.get("store"), params.get("path")
        store = next((s for s in self._config().stores if s.id == store_id), None)
        if store is None:
            raise RpcError(
                INVALID_PARAMS, f"There is no catalogue {store_id!r} in your configuration."
            )
        if store.read_only:
            raise RpcError(INVALID_PARAMS, f"{store.title} is read-only.")
        if not isinstance(path, str) or not Path(path).is_file():
            raise RpcError(INVALID_PARAMS, f"{path} is not a file.")
        try:
            catalogue = Catalogue.open(Path(store.location))
            stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(path).stem).strip("-.") or "plot"
            taken, item_id, n = set(catalogue.item_ids()), stem, 2
            while item_id in taken:
                item_id, n = f"{stem}-{n}", n + 1
            agent = params.get("agent") or {"kind": "person", "name": "analyst"}
            report = import_rep(
                catalogue, Path(path), item_id=item_id, agent=models.AgentRef(**agent)
            )
        except (CatalogueError, OSError, ValueError) as error:
            raise RpcError(
                INVALID_PARAMS, f"{Path(path).name} could not be imported: {error}"
            ) from None
        return {
            "item": report.item_id,
            "tracks": report.tracks,
            "fixes": report.fixes,
            "omitted": report.omitted,
        }

    def _call(self, params: dict[str, Any]) -> dict[str, Any]:
        name, arguments = params.get("name"), params.get("arguments")
        if not isinstance(name, str) or not isinstance(arguments, dict):
            raise RpcError(INVALID_PARAMS, "tools/call needs a name and arguments")
        if name not in self.declarations:
            raise RpcError(INVALID_PARAMS, f"There is no tool called {name}.")
        problem = _argument_problem(arguments)
        if problem:
            return _tool_error(problem)
        outcome = self.worker.call(name, arguments)
        if "error" in outcome:
            return _tool_error(outcome["error"])
        summary = "The plot was updated." if outcome["changed"] else "The plot was not changed."
        structured = {"result": outcome["result"], "changed": outcome["changed"]}
        return {
            # Agents that read only text still get the whole result.
            "content": [{"type": "text", "text": f"{summary}\n{json.dumps(structured)}"}],
            "structuredContent": structured,
            "isError": False,
        }


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
    return None


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
            log.exception("%s", message["method"])
            return _error(message["id"], INTERNAL, f"Internal error: {error}")
        return JSONResponse({"jsonrpc": "2.0", "id": message["id"], "result": result})

    return Starlette(routes=[Route("/mcp", mcp, methods=["POST"])])


def _error(request_id: Any, code: int, message: str) -> JSONResponse:
    return JSONResponse(
        {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
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
        log.warning("%s %s: %s", problem["library"], problem["tool"] or "", problem["reason"])
    app = build_app(service, token, port)
    print(json.dumps({"port": port, "tools": len(service.declarations)}), flush=True)
    try:
        uvicorn.Server(uvicorn.Config(app, log_level="warning")).run(sockets=[listener])
    finally:
        worker.close()
