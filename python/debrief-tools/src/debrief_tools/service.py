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
- tools act only on stores in the user's configuration, by id.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import socket
import sys
from importlib.metadata import version
from typing import Any

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from debrief_config import load_config
from debrief_schemas import DocumentKind, dump_document, models
from debrief_stac import Catalogue
from debrief_tools.declare import Tool
from debrief_tools.registry import Registry
from debrief_tools.run import ToolRunError, run_tool

PROTOCOL_VERSION = "2025-06-18"
MIN_TOKEN_LENGTH = 32
log = logging.getLogger("debrief_tools")


class RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS = -32600, -32601, -32602


def _input_schema(tool: Tool) -> dict[str, Any]:
    """The arguments an MCP client passes to tools/call for this tool."""
    return {
        "type": "object",
        "required": ["store", "item", "selection"],
        "properties": {
            "store": {"type": "string", "description": "Store id from the user's configuration."},
            "item": {"type": "string", "description": "Plot (catalogue item) id."},
            "selection": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ids of the selected features, in order.",
            },
            "parameters": {
                "type": "object",
                "description": "Values for the tool's declared parameters.",
            },
            "agent": {
                "type": "object",
                "description": "Who is running the tool, for provenance (SUB-24).",
            },
        },
    }


def _describe(tool: Tool) -> dict[str, Any]:
    declaration = tool.declaration
    description = declaration.explanation
    if declaration.judgement:
        description += f" {declaration.judgement}"
    return {
        "name": tool.name,
        "title": declaration.title,
        "description": description,
        "inputSchema": _input_schema(tool),
        "_meta": {
            "debrief/declaration": json.loads(
                dump_document(DocumentKind.TOOL_DECLARATION, declaration)
            )
        },
    }


class ToolService:
    def __init__(self, registry: Registry, config_path: str | None = None):
        self.registry = registry
        self.config_path = config_path

    def handle(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if method == "initialize":
            return {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "debrief-tools", "version": version("debrief-tools")},
                "instructions": (
                    "Debrief analysis tools. Each acts on features of one plot in one of the "
                    "user's stores; list stores with debrief/stores."
                ),
            }
        if method == "ping":
            return {}
        if method == "tools/list":
            return {
                "tools": [_describe(t) for t in self.registry.tools.values()],
                "_meta": {
                    "debrief/unavailable": [
                        {"library": u.library, "tool": u.tool, "reason": u.reason}
                        for u in self.registry.unavailable
                    ]
                },
            }
        if method == "tools/call":
            return self._call(params)
        if method == "debrief/tools_for_selection":
            kinds = params.get("kinds")
            if not isinstance(kinds, list) or not all(isinstance(k, str) for k in kinds):
                raise RpcError(INVALID_PARAMS, "kinds must be a list of feature kinds")
            return {"tools": [t.name for t in self.registry.for_selection(kinds)]}
        if method == "debrief/stores":
            return {
                "stores": [
                    {"id": s.id, "title": s.title, "read_only": bool(s.read_only)}
                    for s in self._config().stores
                ]
            }
        raise RpcError(METHOD_NOT_FOUND, f"Unknown method {method}")

    def _config(self) -> models.UserConfig:
        return load_config(self.config_path) if self.config_path else load_config()

    def _call(self, params: dict[str, Any]) -> dict[str, Any]:
        name, arguments = params.get("name"), params.get("arguments") or {}
        if not isinstance(name, str) or not isinstance(arguments, dict):
            raise RpcError(INVALID_PARAMS, "tools/call needs a name and arguments")
        try:
            store_id, item_id = arguments.get("store"), arguments.get("item")
            selection = arguments.get("selection") or []
            if not isinstance(selection, list) or not all(isinstance(s, str) for s in selection):
                raise ToolRunError("selection must be a list of feature ids")
            store = next((s for s in self._config().stores if s.id == store_id), None)
            if store is None:
                raise ToolRunError(f"There is no store {store_id!r} in your Debrief configuration.")
            agent = (
                models.AgentRef(**arguments["agent"])
                if arguments.get("agent")
                else (models.AgentRef(kind="person", name="analyst"))
            )
            outcome = run_tool(
                self.registry,
                Catalogue.open(store.location),
                str(item_id),
                name,
                selection,
                arguments.get("parameters"),
                agent,
                read_only=bool(store.read_only),
            )
        except ToolRunError as error:
            if error.detail:
                log.warning("%s\n%s", error, error.detail)
            return {"content": [{"type": "text", "text": str(error)}], "isError": True}
        except Exception as error:  # noqa: BLE001 - the service outlives any one call (TL-03)
            log.exception("tools/call %s", name)
            return {
                "content": [{"type": "text", "text": f"The tool could not run: {error}"}],
                "isError": True,
            }
        result = json.loads(dump_document(DocumentKind.TOOL_RESULT, outcome.result))
        summary = "The plot was updated." if outcome.changed else "The plot was not changed."
        return {
            "content": [{"type": "text", "text": summary}],
            "structuredContent": {"result": result, "changed": outcome.changed},
            "isError": False,
        }


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
        try:
            message = json.loads(await request.body())
        except json.JSONDecodeError:
            return _error(None, -32700, "Parse error")
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return _error(None, INVALID_REQUEST, "Not a JSON-RPC 2.0 request")
        if "id" not in message:  # a notification, such as notifications/initialized
            return Response(status_code=202)
        params = message.get("params") or {}
        try:
            result = service.handle(str(message.get("method")), params)
        except RpcError as error:
            return _error(message["id"], error.code, str(error))
        return JSONResponse({"jsonrpc": "2.0", "id": message["id"], "result": result})

    return Starlette(routes=[Route("/mcp", mcp, methods=["POST"])])


def _error(request_id: Any, code: int, message: str) -> JSONResponse:
    return JSONResponse(
        {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
    )


def serve(port: int = 0, libraries: list[str] | None = None) -> None:
    """Start the service. Prints one JSON line with the port once listening."""
    import uvicorn

    token = os.environ.get("DEBRIEF_TOOL_TOKEN", "")
    if len(token) < MIN_TOKEN_LENGTH:
        sys.exit(
            f"DEBRIEF_TOOL_TOKEN must be set to a token of at least {MIN_TOKEN_LENGTH} characters."
        )
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", port))  # loopback only (SEC-07)
    port = listener.getsockname()[1]
    registry = Registry.discover(libraries or [])
    for problem in registry.unavailable:
        log.warning(
            "%s%s: %s", problem.library, f" {problem.tool}" if problem.tool else "", problem.reason
        )
    app = build_app(ToolService(registry), token, port)
    print(json.dumps({"port": port, "tools": len(registry.tools)}), flush=True)
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning"))
    server.run(sockets=[listener])
