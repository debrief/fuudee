# debrief-tools

Debrief's tool framework and service (section 6 of the SRD), and the core tools. Scientists writing tools should start with the [tool-author guide](../../site/docs/guides/tool-author/index.md).

## Pieces

| Module | Does |
| --- | --- |
| `declare` | The `@tool` decorator, `ToolContext` and `Tool` (TL-04, TL-06) |
| `registry` | Finds libraries at runtime through the `debrief.tools` entry point. A broken library is reported and the rest still load (TL-03, TL-05). Tools naming unknown data types are not offered, with the reason (TL-09). It also offers tools for a selection (TL-08). |
| `parameters` | Checks form values against the declaration, fills defaults, and converts quantities and times (TL-07) |
| `run` | Reads the plot and runs the tool on a copy. It validates the result and refuses any output the tool didn't declare. It applies the result, records provenance and saves atomically, refusing to overwrite a change saved while the tool ran (SUB-18, SUB-19, NFR-11). |
| `worker` | Runs tool code in a separate process. A hung tool is stopped (after 120 s by default), and one that exits or crashes takes only the worker with it (TL-02, TL-03). |
| `service` | MCP over HTTP: per user, loopback only, with a per-session token (TL-01, SEC-06 to SEC-08) |
| `testing` | `sample_plot()` and `try_tool()`, so a tool's tests see exactly what Debrief would |
| `core` | Track summary, closest approach, range rings, add note |

## The service

```bash
DEBRIEF_TOOL_TOKEN=<at least 32 characters> python -m debrief_tools serve [--port N] [--library MODULE]
```

It prints `{"port": N, "tools": M}` once it is listening. The VS Code extension:

1. generates the token;
2. starts the service with the token in its environment;
3. reads the port from the service's first line of output.

**Protocol.** MCP's Streamable HTTP transport: JSON-RPC 2.0 over `POST /mcp`, with JSON responses. It supports `initialize`, `ping`, `tools/list` and `tools/call`, plus Debrief methods:

- `debrief/tools_for_selection` (`{"kinds": ["track", "track"]}`), which returns the names of the tools on offer;
- `debrief/stores`, `debrief/create_catalogue` and `debrief/import` (`{"store", "path"}`: a REP file, a legacy `.dpf` plot, or a Word (`.docx`, `.doc`) or PDF narrative, a plot of its entries, or of an ASW document's track named `track_name`; returns the new item and what was not imported, `omitted`). `debrief/import_rep` is the same method under its old name;
- `debrief/add_plot_file` (`{"store", "path", "agent"}`): adds a Debrief plot file received from a colleague, with its whole history, after checking the history's checksums; returns the new `item`, its `title` and how many `steps` came with it;
- a plot's history (SUB-21), each taking `{"store", "item"}`:
  - `debrief/open` makes the plot whole (a save a crash interrupted, a history folder to move into the plot file, content edited outside Debrief) and says what it did, or what is wrong with it, in `recovered`;
  - `debrief/history` lists the steps: `seq`, `status` (applied, undone or abandoned), `kind`, `tool`, `agent`, `at`;
  - `debrief/undo`, `debrief/redo` and `debrief/goto` (`"step": n`) move through them.

  - annotations (CAP-03), each one recorded, undoable step named in the History view: `debrief/add_annotation` (`{"annotation": {...}}`, an `AnnotationSpec`: `shape`, `name`, `positions` as `[longitude, latitude]` or text in the analyst's notation, `radius` or `semi_major`, `semi_minor` and `orientation`, `time` or `time_range`, `appearance`; returns the new `feature`), `debrief/edit_annotation` (`{"feature", "annotation"}`, giving only what changes; `null` clears a member, and a time replaces a period or a period a time), `debrief/delete_annotations` (`{"features"}`) and `debrief/set_north_arrow` (`{"shown": true}`);
  - the narrative on one Zulu time axis (CAP-20): `debrief/narrative` reads it, every source's entries in one order (time, source ignoring case, the source's own order), filtered by `sources` and `types` (lists; `""` is an entry with no type), `text` (found in an entry's text, source or type, ignoring case), `start` and `end`, paged by `offset` and `limit` (at most 1,000), with `at` giving the entry current time would be at; it returns the `entries` (`id`, `time`, `source`, `entry_type`, `text`, `track_id`), how many match (`total`) and each source's and type's count. Each change is one recorded, undoable step: `debrief/add_narrative` (`{"entry": {...}}`, a `NarrativeSpec`: `time`, `source`, `entry_type`, `text`, `track_id`, left out meaning the track of the source's name; returns the new `feature`), `debrief/edit_narrative` (`{"feature", "entry"}`, giving only what changes; `null` clears a member), `debrief/delete_narrative` (`{"features"}`) and `debrief/import_narrative` (`{"path"}`: a REP file's narrative lines, or a Word or PDF document's entries in legacy Debrief's dialects, read into the plot, the file kept as a source; with the choices legacy Debrief asked for, `types` (the entry types to read, `""` for none), `within_period` (only entries within the plot's tracks' period), `tracks` (a platform's track id, or `null`) and `platform` (the source of entries whose document names none), all optional; and `duplicates`, `"skip"` or `"add"`, required when the file was read into the plot before (known by its content hash, whatever its name) or the plot has some of its entries already (the same time, source and text): without it the call is refused with code -32003 and a message saying when the file was read in and how many entries are there, nothing read; returns how many `entries`, their `sources`, what was `omitted` and `notes` on what was corrected). `debrief/preview_narrative` (`{"path"}`, and `store` and `item` for a plot) says what a file holds before it is read, changing nothing: its `format`, `dialect`, `types` and `sources` with counts (and each source's `track_id`), its period and how many entries are `outside` the plot's; whether it was read in before (`earlier`: each `step`, `at`, `by`, `how` and the source's `name`) and how many of its entries the plot has `already`;

  Each returns `base` (`{"current", "plot_hash"}`) and `latest`, how many steps the history holds. Pass it back as `base` with the next undo, redo or goto: if the plot was changed elsewhere meanwhile the call fails with code -32001 and nothing changes (SUB-28).
- the Tote (CAP-06, CAP-07), reading only: `debrief/tote` (`{"store", "item", "time", "tote"?}`, `tote` a `ToteView`: `primary`, `secondaries`, `measure_group`, `map_lines`; left out, the plot's island says) returns a `ToteResult`: the group and its measure definitions, the primary's own measures and, for each secondary, range, bearing and relative bearing from the primary and its own course, speed and depth, values in metres, degrees and metres per second, or a `status` of `no_data` or `missing` with a `note`. One call per change of current time: a plot's tracks are prepared once and kept while its file is unchanged, so a call takes a few milliseconds (NFR-04). `debrief/measure_groups` lists the groups (core, for now) and their measures. Which tracks the Tote compares is view state: set it with `debrief/set_view`, a `tote` member beside the time window.
- exported images (SUB-25, EXT-05, OUT-04), see `debrief_tools.figures`: `debrief/figure_id` (`{"store", "item", "revision"?}`) gives a fresh image ID for an export of the plot, `id` in full and its `short` form for the footer, at its current revision or the one given (an earlier revision shown read-only), reading only; `debrief/export_image` (`{"store", "item", "id", "image", "file", "format", "footer", "overwrite"?, "preset"?, "theme"?, "width"?, "height"?, "viewport"?, "time"?, "agent"}`: `image` a PNG as base 64 or an SVG's text, drawn by a host's map, or an image an agent has) puts the ID into the image's metadata (PNG iTXt and XMP, SVG metadata), writes it to `file` (ending `.png` or `.svg`; refused if a file is there, unless `overwrite`), and records the export in the plot's export log, its island, never a step (`recorded`; on a read-only catalogue the image is written but not logged, and `note` says so); `debrief/find_image_source` (`{"file"}`: an image, or a Word or PowerPoint file, read for the IDs in it; or `{"id"}`: an ID typed from a footer, in full or short) returns, for each ID, the plots in the analyst's catalogues it names (`FigureSource`: the store, the catalogue's own id, the item, its title, the revision, the `step` at it, the plot's `current` step, `copied` where only a copy has it, and the export log entry), or a `problem`; `debrief/open_revision` (`{"store", "item", "revision", "id"?}`) returns the plot as it was at that revision, rebuilt by replay and checked against the step that recorded it, with that `step`, the `current` and `latest` steps, and the export log entry for `id`. Only the ID goes into an image: never the plot's title, its catalogue's name or who exported it.

`tools/list` carries each tool's full declaration in `_meta["debrief/declaration"]`. Libraries and tools that are unavailable are listed in the result's `_meta["debrief/unavailable"]`.

A test drives the service with the official MCP Python client, so any MCP-capable agent can use the same tools (TL-17).

`tools/call` arguments:

```json
{"store": "exercise", "item": "serial-01", "selection": ["track-nelson", "track-blue"],
 "parameters": {"rings": 2}, "agent": {"kind": "software_agent", "name": "Claude", "model": "..."}}
```

`base` (optional) is the `base` from `debrief/open` or `debrief/history` for the plot the analyst is looking at; the tool then runs on that plot, and a change made elsewhere since is a conflict (SUB-28). Without it the tool runs on the plot as it is now.

`on_conflict` (optional) says what to do if the plot changes while the tool runs: `refuse` (the default) fails the call with `_meta["debrief/conflict"] = {"mergeable": bool}`; `merge` applies the result on top when the two changes touch different features; `new_plot` saves the result as a copy of the plot and names it in `structuredContent.new_item` (SUB-28, SUB-29).

`agent` is required, so provenance always says who ran a tool (SUB-24). Each tool's `inputSchema` describes its parameters, so an agent can discover them.

A failed run comes back as an MCP tool result with `isError: true` and a message for the analyst; the plot is untouched. A successful run returns `structuredContent: {"result": <ToolResult>, "changed": bool}`, with the same JSON in a text block for agents that read only text. Every result says how the run ended in `_meta["debrief/outcome"]`: `changed`, `unchanged`, `refused`, `failed`, `conflict`, `timed_out`, `crashed`, `saved_as_new_plot` or `needs_newer_schema_confirmed`, the same words the service's and the extension's logs use.

The service negotiates the protocol version (2025-06-18 or 2025-03-26), refuses bodies over 10 MB, and answers malformed requests with JSON-RPC errors.

## Security

- **Per user (SEC-06).** The service runs as the user who started it, so it can read only what they can.
- **Loopback only (SEC-07).** It listens on `127.0.0.1`.
- **Per-session token (SEC-08).** Every request needs the token, compared in constant time. The token travels in the environment, never on the command line, where other users could read it from the process list.
- **No browsers.** Requests with an `Origin` header, or whose `Host` isn't the loopback address and port, are refused. This defeats DNS rebinding from a web page.
- **Tool code never runs in the service.** Libraries are imported only in the worker process, and the token is removed from the environment before the worker starts.
- **Known stores only.** Tools act only on stores listed in the user's configuration, by id. A client can't point a tool at an arbitrary path. Stores marked read-only refuse tools that would change a plot.

## Logs (NFR-14)

The service and its worker log to `tools.log` and `tools-worker.log` in the user's log folder (`~/.local/state/debrief`, `~/Library/Logs/Debrief` or `%LOCALAPPDATA%\Debrief\Logs`; `DEBRIEF_LOG_DIR` overrides it), rotated at 1 MB. Logs hold no plot data, so they can be shared for support or an accreditation review without being read first:

- **No free text.** Lines are fixed words and codes: `tool_run tool=core.range_rings version=0.0.2 parameters=rings:integer selected=1 outcome=changed ms=41`. Parameter names and kinds are logged, never values.
- **Exceptions** are their type, a hash of their message and their frames as `file.py:line:function`; never the message, source lines or folders. A tool's message still reaches the analyst in the result.
- **Other libraries' messages** (uvicorn's, Python warnings) are logged as the logger's name and a hash only; uvicorn logs warnings and above.
- **Hashes are keyed**: HMAC-SHA256 under a 32-byte key made once per install, kept as `log-key` (mode 0600) beside the configuration file, never in the log folder, so a shared log can't be checked against a list of likely names. `DEBRIEF_LOG_KEY` (64 hex digits) overrides it; the extension passes its key that way, so its lines and the service's hash the same things alike.
- **Redaction** of quoted text (straight and curly quotes), file paths and `file://` URIs backs this up on every line. A Windows or UNC path may have spaces in its folder names, and in its last part when the path runs to `: ` or the end of the line, so the rest of such a line is hashed with it; a POSIX path ends at the first space. Python and TypeScript are held to `schemas/vectors/redaction.json`.

## Not yet

- Long-running tools, with progress and cancellation (Phase 2).
- Replay from provenance (Phase 2).
- Isolating each library in its own process. All tools currently share one worker; nothing assumes they do (TL-02).
- Tools reading sensor observation payloads (Phase 4).
- Locking a plot across processes. Writes are checked for a change saved meanwhile, but two writers can still race in the instant between that check and the save (SUB-28, Phase 2).
- Tools that read shared state, such as current time (Phase 2).
