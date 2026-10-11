# debrief-tools

Debrief's tool framework and service (section 6 of the SRD), and the core tools. Scientists writing tools should start with the [tool-author guide](../../site/docs/guides/tool-author/index.md).

## Pieces

| Module | Does |
| --- | --- |
| `declare` | The `@tool` decorator, `ToolContext` and `Tool` (TL-04, TL-06) |
| `registry` | Finds libraries at runtime through the `debrief.tools` entry point. A broken library is reported and the rest still load (TL-03, TL-05). Tools naming unknown data types are not offered, with the reason (TL-09). It also offers tools for a selection (TL-08). |
| `parameters` | Checks form values against the declaration, fills defaults, and converts quantities and times (TL-07) |
| `run` | Reads the plot and runs the tool on a copy. It validates the result, applies it, records provenance and saves atomically (SUB-18, SUB-19, NFR-11). |
| `service` | MCP over HTTP: per user, loopback only, with a per-session token (TL-01, SEC-06 to SEC-08) |
| `core` | Track summary, closest approach, range rings, add note |

## The service

```bash
DEBRIEF_TOOL_TOKEN=<at least 32 characters> python -m debrief_tools serve [--port N] [--library MODULE]
```

It prints `{"port": N, "tools": M}` once it is listening. The VS Code extension:

1. generates the token;
2. starts the service with the token in its environment;
3. reads the port from the service's first line of output.

**Protocol.** MCP's Streamable HTTP transport: JSON-RPC 2.0 over `POST /mcp`, with JSON responses. It supports `initialize`, `ping`, `tools/list` and `tools/call`, plus two Debrief methods:

- `debrief/tools_for_selection` (`{"kinds": ["track", "track"]}`), which returns the names of the tools on offer;
- `debrief/stores`.

`tools/list` carries each tool's full declaration in `_meta["debrief/declaration"]`. Libraries and tools that are unavailable are listed in the result's `_meta["debrief/unavailable"]`.

A test drives the service with the official MCP Python client, so any MCP-capable agent can use the same tools (TL-17).

`tools/call` arguments:

```json
{"store": "exercise", "item": "serial-01", "selection": ["track-nelson", "track-blue"],
 "parameters": {"rings": 2}, "agent": {"kind": "person", "name": "J Smith"}}
```

A failed run comes back as an MCP tool result with `isError: true` and a message for the analyst; the plot is untouched. A successful run returns `structuredContent: {"result": <ToolResult>, "changed": bool}`.

## Security

- **Per user (SEC-06).** The service runs as the user who started it, so it can read only what they can.
- **Loopback only (SEC-07).** It listens on `127.0.0.1`.
- **Per-session token (SEC-08).** Every request needs the token, compared in constant time. The token travels in the environment, never on the command line, where other users could read it from the process list.
- **No browsers.** Requests with an `Origin` header, or whose `Host` isn't the loopback address and port, are refused. This defeats DNS rebinding from a web page.
- **Known stores only.** Tools act only on stores listed in the user's configuration, by id. A client can't point a tool at an arbitrary path. Stores marked read-only refuse tools that would change a plot.

## Not yet

- Long-running tools, with progress and cancellation (Phase 2).
- Replay from provenance (Phase 2).
- Isolating each library in its own process. The framework already allows it, since nothing assumes tools share a process (TL-02).
- Tools that read shared state, such as current time (Phase 2).
