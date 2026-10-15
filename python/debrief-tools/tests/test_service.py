"""The tool service over HTTP: security checks, the MCP methods, and a real MCP client."""

import asyncio
import json
import logging
import os
import subprocess
import sys
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from debrief_schemas import models
from debrief_tools import diagnostics
from debrief_tools import service as service_module
from debrief_tools.service import ToolService, build_app
from debrief_tools.worker import ToolWorker

TOKEN = "t" * 40
PORT = 43210
HEADERS = {"authorization": f"Bearer {TOKEN}", "host": f"127.0.0.1:{PORT}"}


AGENT = {"kind": "person", "name": "analyst"}


@pytest.fixture
def client(config_file: Path, lab_library: str):
    worker = ToolWorker([lab_library], str(config_file), timeout_s=3)
    app = build_app(ToolService(worker, str(config_file)), TOKEN, PORT)
    yield TestClient(app, base_url=f"http://127.0.0.1:{PORT}")
    worker.close()


def rpc(client: TestClient, method: str, params: dict | None = None, headers=HEADERS):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/mcp", content=json.dumps(body), headers=headers)


@pytest.mark.parametrize(
    ("headers", "status"),
    [
        ({"host": f"127.0.0.1:{PORT}"}, 401),
        ({**HEADERS, "authorization": "Bearer wrong"}, 401),
        ({**HEADERS, "origin": "https://evil.example"}, 403),
        ({**HEADERS, "host": f"evil.example:{PORT}"}, 403),
    ],
    ids=["no-token", "wrong-token", "browser-origin", "rebound-host"],
)
def test_requests_without_the_session_token_or_from_elsewhere_are_refused(
    client, headers, status
) -> None:
    assert rpc(client, "ping", headers=headers).status_code == status


def test_initialize_and_notification(client) -> None:
    result = rpc(client, "initialize").json()["result"]
    assert result["serverInfo"]["name"] == "debrief-tools"
    assert "tools" in result["capabilities"]
    note = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    assert client.post("/mcp", content=json.dumps(note), headers=HEADERS).status_code == 202


def test_tools_list_carries_declarations(client) -> None:
    tools = {t["name"]: t for t in rpc(client, "tools/list").json()["result"]["tools"]}
    rings = tools["core.range_rings"]
    assert rings["title"] == "Range rings"
    assert rings["_meta"]["debrief/declaration"]["parameters"][0]["quantity_kind"] == "length"
    assert rings["inputSchema"]["required"] == ["store", "item", "selection", "agent"]


def test_tools_for_selection(client) -> None:
    result = rpc(client, "debrief/tools_for_selection", {"kinds": ["track", "track"]}).json()[
        "result"
    ]
    assert "core.closest_approach" in result["tools"] and "core.range_rings" not in result["tools"]
    assert (
        rpc(client, "debrief/tools_for_selection", {"kinds": "track"}).json()["error"]["code"]
        == -32602
    )


def test_stores_lists_configuration(client) -> None:
    assert rpc(client, "debrief/stores").json()["result"]["stores"][0]["id"] == "exercise"


def test_call_runs_and_writes(client, catalogue) -> None:
    result = call(client, "core.closest_approach", ["track-nelson", "track-blue"])["result"]
    assert result["isError"] is False and result["structuredContent"]["changed"] is True
    assert '"non_spatial"' in result["content"][0]["text"]  # agents reading only text see it
    assert catalogue.read_plot("serial").features[-1].id.startswith("cpa-")


def test_call_errors_are_results_not_crashes(client) -> None:
    no_store = call(client, "core.closest_approach", store="nowhere")["result"]
    assert no_store["isError"] and "no store 'nowhere'" in no_store["content"][0]["text"]
    wrong = call(client, "core.closest_approach", ["track-nelson"])["result"]
    assert wrong["isError"] and "does not apply" in wrong["content"][0]["text"]
    anonymous = call(client, "core.track_summary", ["track-nelson"], agent=None)["result"]
    assert anonymous["isError"] and "Say who is running the tool" in anonymous["content"][0]["text"]
    twice = call(client, "core.track_summary", ["track-nelson", "track-nelson"])["result"]
    assert twice["isError"] and "more than once" in twice["content"][0]["text"]
    assert rpc(client, "ping").json()["result"] == {}  # still serving


def test_unknown_method(client) -> None:
    assert rpc(client, "resources/list").json()["error"]["code"] == -32601


def test_service_refuses_to_start_without_a_token() -> None:
    env = {k: v for k, v in os.environ.items() if k != "DEBRIEF_TOOL_TOKEN"}
    done = subprocess.run(
        [sys.executable, "-m", "debrief_tools", "serve"],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert done.returncode != 0 and "DEBRIEF_TOOL_TOKEN" in done.stderr


def test_official_mcp_client_lists_and_calls_tools(config_file: Path, catalogue) -> None:
    """Agent parity (TL-17): a stock MCP client, over a real socket, against the real service."""
    mcp = pytest.importorskip("mcp")
    import httpx2  # the HTTP client the MCP SDK uses
    from mcp.client.streamable_http import streamable_http_client

    env = {**os.environ, "DEBRIEF_TOOL_TOKEN": TOKEN, "DEBRIEF_CONFIG": str(config_file)}
    server = subprocess.Popen(
        [sys.executable, "-m", "debrief_tools", "serve"], env=env, stdout=subprocess.PIPE, text=True
    )
    try:
        port = json.loads(server.stdout.readline())["port"]

        async def session():
            http = httpx2.AsyncClient(headers={"authorization": f"Bearer {TOKEN}"})
            async with (
                http,
                streamable_http_client(f"http://127.0.0.1:{port}/mcp", http_client=http) as (
                    read,
                    write,
                    *_,
                ),
                mcp.ClientSession(read, write) as client,
            ):
                await client.initialize()
                listed = await client.list_tools()
                called = await client.call_tool(
                    "core.track_summary",
                    {
                        "store": "exercise",
                        "item": "serial",
                        "selection": ["track-nelson"],
                        "agent": {"kind": "software_agent", "name": "test agent", "model": "none"},
                    },
                )
                return listed, called

        listed, called = asyncio.run(session())
        assert {"core.track_summary", "core.add_note"} <= {t.name for t in listed.tools}
        assert called.is_error is False
        assert called.structured_content["result"]["non_spatial"][0]["title"] == "Track summary"
    finally:
        server.terminate()
        server.wait(timeout=10)


def call(client, name, selection=(), **extra):
    arguments = {
        "store": "exercise",
        "item": "serial",
        "selection": list(selection),
        "agent": AGENT,
        **extra,
    }
    return rpc(client, "tools/call", {"name": name, "arguments": arguments}).json()


@pytest.mark.parametrize(
    ("tool", "message"),
    [
        ("lab.hang", "longer than 3 seconds"),
        ("lab.exit", "stopped unexpectedly"),
        ("lab.crash", "stopped unexpectedly"),
    ],
)
def test_a_tool_that_hangs_or_dies_fails_only_its_own_call(
    client, catalogue, tool, message
) -> None:
    before = catalogue.read_plot("serial")
    result = call(client, tool)["result"]
    assert result["isError"] is True and message in result["content"][0]["text"]
    assert rpc(client, "ping").json()["result"] == {}
    assert call(client, "core.track_summary", ["track-nelson"])["result"]["isError"] is False
    assert catalogue.read_plot("serial") == before


def test_undeclared_output_is_refused(client, catalogue) -> None:
    result = call(client, "lab.sneaky_delete")["result"]
    assert result["isError"] and "does not declare" in result["content"][0]["text"]
    assert catalogue.read_plot("serial").features[0].id == "track-nelson"


def test_changing_the_selection_in_place_changes_nothing(client, catalogue) -> None:
    assert call(client, "lab.rename_selected", ["track-nelson"])["result"]["isError"] is False
    assert catalogue.read_plot("serial").features[0].properties.name == "NELSON"


def test_tool_input_schema_lists_parameters(client) -> None:
    tools = {t["name"]: t for t in rpc(client, "tools/list").json()["result"]["tools"]}
    schema = tools["core.range_rings"]["inputSchema"]["properties"]["parameters"]
    assert schema["properties"]["rings"]["type"] == "integer"
    assert tools["core.add_note"]["inputSchema"]["properties"]["parameters"]["required"] == [
        "text",
        "at",
    ]


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"jsonrpc": "2.0", "id": 1, "method": "ping", "params": []}, -32602),
        (
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "lab.none", "arguments": {}},
            },
            -32602,
        ),
    ],
)
def test_malformed_requests_get_json_rpc_errors(client, body, expected) -> None:
    response = client.post("/mcp", content=json.dumps(body), headers=HEADERS)
    assert response.status_code == 200 and response.json()["error"]["code"] == expected


def test_protocol_version_negotiation_and_responses(client) -> None:
    assert (
        rpc(client, "initialize", {"protocolVersion": "2025-03-26"}).json()["result"][
            "protocolVersion"
        ]
        == "2025-03-26"
    )
    assert (
        rpc(client, "initialize", {"protocolVersion": "1999-01-01"}).json()["result"][
            "protocolVersion"
        ]
        == "2025-06-18"
    )
    assert (
        rpc(client, "ping", headers={**HEADERS, "mcp-protocol-version": "1999-01-01"}).status_code
        == 400
    )
    response = {"jsonrpc": "2.0", "id": 5, "result": {}}
    assert client.post("/mcp", content=json.dumps(response), headers=HEADERS).status_code == 202


def test_create_catalogue_then_import(client, tmp_path) -> None:
    folder = tmp_path / "new-cat"
    created = rpc(
        client, "debrief/create_catalogue", {"location": str(folder), "title": "Exercise two"}
    )
    store = created.json()["result"]["store"]
    assert (folder / "catalog.json").exists()
    assert store in [s["id"] for s in rpc(client, "debrief/stores").json()["result"]["stores"]]
    source = tmp_path / "serial.rep"
    params = {"store": store, "path": str(source), "agent": AGENT}
    first = rpc(client, "debrief/import_rep", params).json()["result"]
    again = rpc(client, "debrief/import_rep", params).json()["result"]
    assert (first["item"], again["item"]) == ("serial", "serial-2")
    assert first["tracks"] == ["NELSON", "BLUE", "LATE"] and first["fixes"] == 8
    # How each track is plotted: the host asks, given the tracks the file holds, and says.
    listed = rpc(client, "debrief/rep_tracks", {"path": str(source)}).json()["result"]
    assert listed == {"tracks": ["NELSON", "BLUE", "LATE"]}
    modes = {"NELSON": "dr", "BLUE": "otg", "LATE": "otg"}
    asked = rpc(client, "debrief/import_rep", {**params, "modes": modes}).json()["result"]
    assert asked["notes"][0] == "Track 'NELSON' plotted by dead reckoning (DR)."
    remembered = {**params, "modes": "dr", "remembered": "Clear it to be asked again."}
    said = rpc(client, "debrief/import_rep", remembered).json()["result"]["notes"]
    assert said[-1].endswith("as you chose for future imports. Clear it to be asked again.")
    bad = rpc(client, "debrief/import_rep", {**params, "modes": 3}).json()["error"]
    assert bad["code"] == -32602


def test_create_catalogue_refuses_a_folder_with_other_files(client, tmp_path) -> None:
    folder = tmp_path / "busy"
    folder.mkdir()
    (folder / "notes.txt").write_text("x")
    response = rpc(
        client, "debrief/create_catalogue", {"location": str(folder), "title": "X"}
    ).json()
    assert "not empty" in response["error"]["message"]


def test_history_open_list_undo_redo_and_goto(client, catalogue) -> None:
    def history(method, **params):
        return rpc(client, method, {"store": "exercise", "item": "serial", **params}).json()

    opened = history("debrief/open")["result"]
    assert opened["recovered"] == [] and opened["base"]["current"] == 1
    call(client, "core.closest_approach", ["track-nelson", "track-blue"])
    steps = history("debrief/history")["result"]["steps"]
    assert [(s["seq"], s["status"], s["kind"]) for s in steps] == [
        (1, "applied", "import"),
        (2, "applied", "tool"),
    ]
    assert steps[1]["tool"] == "core.closest_approach" and steps[1]["agent"] == "analyst"

    base = history("debrief/history")["result"]["base"]
    undone = history("debrief/undo", base=base)["result"]["base"]
    assert undone["current"] == 1
    assert not any(f.id.startswith("cpa-") for f in catalogue.read_plot("serial").features)
    stale = history("debrief/redo", base=base)["error"]
    assert stale["code"] == -32001 and "changed elsewhere" in stale["message"]
    assert history("debrief/redo", base=undone)["result"]["base"]["current"] == 2
    assert history("debrief/goto", step=1)["result"]["base"]["current"] == 1
    origin = history("debrief/undo")["error"]
    assert origin["code"] == -32602 and "as it was imported" in origin["message"]
    assert history("debrief/history", item="nothing")["error"]["code"] == -32602


def test_history_steps_carry_their_notes_for_naming(client, catalogue) -> None:
    # An edit made without a tool is named in the History view by its note.
    from debrief_stac import Changes

    at = "2024-01-01T00:00:00.000Z"
    colleague = models.AgentRef(kind="person", name="a colleague")
    note = models.ProvRecord(
        id="edit-note", kind="edit", started_at=at, agent=colleague, notes=["Note added"]
    )
    catalogue.commit("serial", [note], Changes(deleted_ids=["track-late"]))
    where = {"store": "exercise", "item": "serial"}
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert [(s["kind"], s["tool"], s["notes"]) for s in steps][-1] == ("edit", None, ["Note added"])
    assert steps[0]["kind"] == "import" and isinstance(steps[0]["notes"], list)


def test_a_conflict_tells_the_caller_whether_it_can_merge(config_file: Path) -> None:
    class Meanwhile:
        def describe(self):
            return {"tools": [], "unavailable": []}

        def call(self, name, arguments):
            return {"error": "The plot was changed meanwhile.", "conflict": {"mergeable": True}}

    service = ToolService(Meanwhile(), str(config_file))  # type: ignore[arg-type]
    service.declarations = {
        "core.x": models.ToolDeclaration(
            name="core.x",
            version="1",
            title="X",
            explanation="E",
            applies_to=["*"],
            outputs=["non_spatial"],
        )
    }
    result = service.handle(
        "tools/call",
        {"name": "core.x", "arguments": {"selection": [], "agent": AGENT}},
    )
    assert result["isError"] and result["_meta"] == {
        "debrief/conflict": {"mergeable": True},
        "debrief/outcome": "conflict",
    }
    refused = service.handle(
        "tools/call",
        {"name": "core.x", "arguments": {"selection": [], "agent": AGENT, "on_conflict": "x"}},
    )
    assert "on_conflict must be" in refused["content"][0]["text"]


def test_shared_state_goes_to_the_tool_and_its_change_comes_back(client) -> None:
    state = {
        "time": {
            "current": "1995-12-12T05:00:00.000Z",
            "range": {"start": "1995-12-12T05:00:00.000Z", "end": "1995-12-12T07:10:00.000Z"},
        },
        "selection": {"plot": "serial", "feature_ids": ["track-nelson", "track-blue"]},
        "viewport": {"bbox": [-4.2, 50.0, -4.0, 50.4]},
    }
    pair = ["track-nelson", "track-blue"]
    result = call(client, "core.closest_approach", pair, state=state)["result"]
    change = result["structuredContent"]["result"]["state_change"]
    assert change["time"]["current"] > state["time"]["current"]
    bad = {**state, "viewport": {"bbox": [1, 2, 3]}}
    refused = call(client, "core.closest_approach", pair, state=bad)["result"]
    assert (
        refused["isError"] and "shared state passed is not valid" in refused["content"][0]["text"]
    )


def test_tool_runs_are_logged_without_plot_data(client, catalogue, caplog) -> None:
    caplog.set_level(logging.INFO, logger="debrief_tools")
    secret = {"text": "Contact lost near NELSON", "at": "1995-12-12T05:05:00.000Z"}
    call(client, "core.add_note", ["track-nelson"], parameters=secret)
    call(client, "core.closest_approach", ["track-nelson"])  # refused: does not apply
    lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("tool_run")]
    assert lines[0].startswith(
        "tool_run tool=core.add_note version=0.0.2 parameters=at:time,text:string selected=1 "
        "outcome=changed"
    )
    assert "outcome=refused" in lines[1]
    assert not any("NELSON" in line or "Contact" in line for line in lines)


def test_a_newer_schema_question_reaches_the_caller(config_file: Path) -> None:
    class Older:
        def describe(self):
            return {"tools": [], "unavailable": []}

        def call(self, name, arguments):
            return {
                "error": "This catalogue holds data-file schema 0.0.6 ...",
                "newer_schema": True,
            }

    service = ToolService(Older(), str(config_file))  # type: ignore[arg-type]
    service.declarations = {
        "core.x": models.ToolDeclaration(
            name="core.x",
            version="1",
            title="X",
            explanation="E",
            applies_to=["*"],
            outputs=["non_spatial"],
        )
    }
    result = service.handle(
        "tools/call", {"name": "core.x", "arguments": {"selection": [], "agent": AGENT}}
    )
    assert result["isError"] and result["_meta"] == {
        "debrief/newer_schema": True,
        "debrief/outcome": "needs_newer_schema_confirmed",
    }


def test_colour_and_hiding_are_recorded_steps_undone_like_any_other(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    coloured = rpc(
        client,
        "debrief/set_colour",
        {**where, "base": base, "features": ["track-nelson"], "colour": "#00a000"}
        | {"colour_name": "green"},
    ).json()["result"]
    assert coloured["changed"] and coloured["base"]["current"] == 2
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert steps[-1]["kind"] == "edit" and steps[-1]["notes"] == ["Colour of NELSON set to green"]
    hidden = rpc(
        client,
        "debrief/set_hidden",
        {**where, "base": coloured["base"], "features": ["track-late"], "hidden": True},
    ).json()["result"]
    assert hidden["base"]["current"] == 3
    plot = catalogue.read_plot("serial")
    assert next(f for f in plot.features if f.id == "track-late").properties.hidden
    # A stale base is refused, as for any change (SUB-28).
    stale = rpc(
        client,
        "debrief/set_hidden",
        {**where, "base": base, "features": ["track-nelson"], "hidden": True},
    ).json()["error"]
    assert stale["code"] == -32001
    # Ctrl+Z is just history undo.
    rpc(client, "debrief/undo", {**where, "base": hidden["base"]})
    rpc(client, "debrief/undo", where)
    nelson = next(f for f in catalogue.read_plot("serial").features if f.id == "track-nelson")
    assert nelson.properties.style is None or nelson.properties.style.colour != "#00a000"
    bad = rpc(
        client, "debrief/set_colour", {**where, "features": ["track-nelson"], "colour": "green"}
    )
    assert bad.json()["error"]["code"] == -32602


def test_annotations_are_added_restyled_and_deleted_as_recorded_steps(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    circle = {
        "shape": "circle",
        "name": "Exclusion zone",
        # Positions in the analyst's notation, as an agent may give them.
        "positions": ["50°19.800'N 004°07.200'W"],
        "radius": {"value": 2, "unit": "[nmi_i]"},
    }
    added = rpc(
        client, "debrief/add_annotation", {**where, "base": base, "annotation": circle}
    ).json()["result"]
    assert added["feature"] == "annotation-exclusion-zone" and added["changed"]
    restyled = rpc(
        client,
        "debrief/edit_annotation",
        {
            **where,
            "base": added["base"],
            "feature": added["feature"],
            "annotation": {"appearance": {"colour": "#0064bd", "line_style": "solid"}},
        },
    ).json()["result"]
    assert restyled["changed"]
    arrow = rpc(
        client, "debrief/set_north_arrow", {**where, "base": restyled["base"], "shown": True}
    ).json()["result"]
    deleted = rpc(
        client,
        "debrief/delete_annotations",
        {**where, "base": arrow["base"], "features": [added["feature"]]},
    ).json()["result"]
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert [s["notes"][0] for s in steps[-4:]] == [
        "Circle 'Exclusion zone' added",
        "Style of Circle 'Exclusion zone' changed",
        "North arrow added",
        "Circle 'Exclusion zone' deleted",
    ]
    # Undo, as for any step, brings it back with its style.
    rpc(client, "debrief/undo", {**where, "base": deleted["base"]})
    zone = next(f for f in catalogue.read_plot("serial").features if f.id == added["feature"])
    assert zone.properties.appearance.colour == "#0064bd"
    # A description that cannot be made is refused plainly, and nothing changes.
    refused = rpc(
        client, "debrief/add_annotation", {**where, "annotation": {**circle, "radius": None}}
    ).json()["error"]
    assert refused["code"] == -32602 and "radius" in refused["message"]
    stale = rpc(
        client, "debrief/add_annotation", {**where, "base": base, "annotation": circle}
    ).json()["error"]
    assert stale["code"] == -32001


def test_narrative_is_read_filtered_and_changed_as_recorded_steps(
    client, catalogue, tmp_path
) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    log = tmp_path / "blue-log.rep"
    log.write_text(
        ";NARRATIVE2: 951212 050000 BLUE Sonar Contact gained, bearing 090.\n"
        ";NARRATIVE2: 951212 050000 CONTROL Order Serial started.\n"
        ";NARRATIVE: 951212 051000 BLUE Contact lost.\n"
    )
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    read = rpc(
        client, "debrief/import_narrative", {**where, "base": base, "path": str(log)}
    ).json()["result"]
    assert (read["entries"], read["sources"]) == (3, ["BLUE", "CONTROL"])
    added = rpc(
        client,
        "debrief/add_narrative",
        {
            **where,
            "base": read["base"],
            "entry": {"time": "1995-12-12T05:05:00.000Z", "source": "NELSON", "text": "Turning."},
        },
    ).json()["result"]
    feature = added["feature"]
    # One axis: every source, in time order; BLUE's entries belong to the BLUE track.
    listed = rpc(client, "debrief/narrative", where).json()["result"]
    assert [(e["source"], e["text"]) for e in listed["entries"]] == [
        ("BLUE", "Contact gained, bearing 090."),
        ("CONTROL", "Serial started."),
        ("NELSON", "Turning."),
        ("BLUE", "Contact lost."),
    ]
    assert listed["entries"][0]["track_id"] == "track-blue"
    assert listed["entries"][2]["track_id"] == "track-nelson"
    assert listed["total"] == 4 and listed["sources"][0] == {"name": "BLUE", "entries": 2}
    # Filtered by source, type and text; and the entry current time is at.
    found = rpc(
        client,
        "debrief/narrative",
        {**where, "sources": ["BLUE"], "text": "CONTACT", "at": "1995-12-12T05:09:00.000Z"},
    ).json()["result"]
    assert found["total"] == 2 and found["current"] == listed["entries"][0]["id"]
    typed = rpc(client, "debrief/narrative", {**where, "types": [""]}).json()["result"]
    assert [e["text"] for e in typed["entries"]] == ["Turning.", "Contact lost."]
    paged = rpc(client, "debrief/narrative", {**where, "offset": 3, "limit": 5}).json()["result"]
    assert [e["text"] for e in paged["entries"]] == ["Contact lost."]
    edited = rpc(
        client,
        "debrief/edit_narrative",
        {**where, "base": added["base"], "feature": feature, "entry": {"text": "Turning to 270."}},
    ).json()["result"]
    deleted = rpc(
        client,
        "debrief/delete_narrative",
        {**where, "base": edited["base"], "features": [feature]},
    ).json()["result"]
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert [s["notes"][0] for s in steps[-3:]] == [
        "Narrative entry by NELSON at 05:05:00Z added",
        "Narrative entry by NELSON at 05:05:00Z: text changed",
        "Narrative entry by NELSON at 05:05:00Z deleted",
    ]
    assert steps[-4]["notes"][:2] == [
        "Narrative read from blue-log.rep",
        "3 narrative entries read, from BLUE, CONTROL.",
    ]
    rpc(client, "debrief/undo", {**where, "base": deleted["base"]})
    back = next(f for f in catalogue.read_plot("serial").features if f.id == feature)
    assert back.properties.text == "Turning to 270."
    refused = rpc(
        client, "debrief/add_narrative", {**where, "entry": {"source": "X", "text": "No time."}}
    ).json()["error"]
    assert refused["code"] == -32602 and "time" in refused["message"]
    bad = rpc(client, "debrief/narrative", {**where, "at": "noon"}).json()["error"]
    assert bad["code"] == -32602 and "UTC" in bad["message"]


def test_the_view_is_set_with_its_hash_and_never_recorded(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    opened = rpc(client, "debrief/open", where).json()["result"]
    # An imported plot starts with a window over its whole period.
    assert opened["view"] == {
        "time_window": {"start": "1995-12-12T05:00:00.000Z", "end": "1995-12-12T07:10:00.000Z"}
    }
    window = {
        "time_window": {"start": "2026-10-11T09:30:00.000Z", "end": "2026-10-11T09:31:00.000Z"}
    }
    first = rpc(
        client, "debrief/set_view", {**where, "view": window, "hash": opened["view_hash"]}
    ).json()["result"]
    assert first["view"] == window
    assert first["base"] == opened["base"]  # the view is not content: the base never moves
    later = {"time_window": {**window["time_window"], "start": "2026-10-11T09:30:30.000Z"}}
    second = rpc(
        client, "debrief/set_view", {**where, "view": later, "hash": first["view_hash"]}
    ).json()["result"]
    assert second["base"] == first["base"]
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert len(steps) == 1  # and nothing is recorded
    stale = rpc(client, "debrief/set_view", {**where, "view": window, "hash": first["view_hash"]})
    assert stale.json()["error"]["code"] == -32001
    reopened = rpc(client, "debrief/open", where).json()["result"]
    assert reopened["view"] == later and reopened["view_hash"] == second["view_hash"]
    backwards = {
        "time_window": {"start": "2026-10-11T09:31:00.000Z", "end": "2026-10-11T09:30:00.000Z"}
    }
    refused = rpc(
        client, "debrief/set_view", {**where, "view": backwards, "hash": second["view_hash"]}
    ).json()["error"]
    assert refused["code"] == -32602 and "starts after it ends" in refused["message"]
    assert rpc(client, "debrief/presentation", where).json()["error"]["code"] == -32601
    # How tracks outside the window are drawn is view state too (CAP-29).
    faint = {**later, "context_tracks": "faint"}
    third = rpc(
        client, "debrief/set_view", {**where, "view": faint, "hash": second["view_hash"]}
    ).json()["result"]
    assert third["view"] == faint and third["base"] == second["base"]
    unknown = {**later, "context_tracks": "dim"}
    refused = rpc(
        client, "debrief/set_view", {**where, "view": unknown, "hash": third["view_hash"]}
    ).json()["error"]
    assert refused["code"] == -32602
    assert len(rpc(client, "debrief/history", where).json()["result"]["steps"]) == 1


def test_opening_migrates_a_retired_presentation(client, catalogue) -> None:
    folder = Path(catalogue.store.root) / "serial"
    (folder / "presentation.json").write_text(
        json.dumps({"schema_version": "0.0.7", "features": [{"id": "track-late", "hidden": True}]})
    )
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    opened = rpc(client, "debrief/open", where).json()["result"]
    assert opened["migrated"] and opened["base"]["current"] == 2
    assert not (folder / "presentation.json").exists()
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert steps[-1]["notes"] == ["Hidden features kept from presentation.json"]
    assert steps[-1]["agent"] == "analyst"


def test_a_legacy_plot_file_imports_with_its_omissions_listed(client) -> None:
    shapes = Path(__file__).parents[2] / "debrief-io" / "tests" / "data" / "shapes.dpf"
    params = {"store": "exercise", "path": str(shapes), "agent": AGENT}
    report = rpc(client, "debrief/import", params).json()["result"]
    assert report["item"] == "shapes" and report["omitted"]
    steps = rpc(client, "debrief/history", {"store": "exercise", "item": "shapes"}).json()
    assert [s["kind"] for s in steps["result"]["steps"]] == ["import"]


def test_only_plot_xml_goes_to_the_plot_importer(client, tmp_path: Path) -> None:
    shapes = Path(__file__).parents[2] / "debrief-io" / "tests" / "data" / "shapes.dpf"
    saved_as_xml = tmp_path / "saved.xml"
    saved_as_xml.write_bytes(shapes.read_bytes())
    params = {"store": "exercise", "path": str(saved_as_xml), "agent": AGENT}
    report = rpc(client, "debrief/import", params).json()["result"]
    assert report["tracks"] and report["annotations"]
    # Other XML is not a plot file: it goes to the REP importer, which finds no tracks
    # in it and refuses it, quoting the lines it could not read.
    other = tmp_path / "route.xml"
    other.write_text('<?xml version="1.0"?>\n<gpx version="1.1"><rte/></gpx>\n')
    params = {"store": "exercise", "path": str(other), "agent": AGENT}
    error = rpc(client, "debrief/import", params).json()["error"]
    assert "route.xml could not be imported: no tracks could be read" in error["message"]
    assert "Line 1 could not be read" in error["message"]


def test_a_failing_tool_logs_no_names_from_its_message(client, catalogue) -> None:
    # The tool's message names the tracks, unquoted: the analyst sees it, the log never does.
    result = call(client, "core.closest_approach", ["track-nelson", "track-late"])["result"]
    assert result["isError"] and "do not overlap" in result["content"][0]["text"]
    assert result["_meta"] == {"debrief/outcome": "failed"}
    text = (Path(os.environ["DEBRIEF_LOG_DIR"]) / "tools-worker.log").read_text()
    assert "tool_failed tool=core.closest_approach" in text
    assert "ValueError message=<text:" in text and "core.py:" in text
    assert "NELSON" not in text and "LATE" not in text and "overlap" not in text


def test_every_tool_call_says_how_it_ended(client, catalogue) -> None:
    note = {"text": "x", "at": "1995-12-12T05:05:00.000Z"}
    changed = call(client, "core.add_note", ["track-nelson"], parameters=note)
    assert changed["result"]["_meta"] == {"debrief/outcome": "changed"}
    unchanged = call(client, "core.track_summary", ["track-nelson"])
    assert unchanged["result"]["_meta"] == {"debrief/outcome": "unchanged"}
    refused = call(client, "core.closest_approach", ["track-nelson"])
    assert refused["result"]["_meta"] == {"debrief/outcome": "refused"}
    for result in (changed, unchanged, refused):
        assert result["result"]["_meta"]["debrief/outcome"] in diagnostics.OUTCOMES


def test_the_service_logs_no_free_text_from_requests_or_libraries(tmp_path, caplog) -> None:
    class Unavailable:
        def describe(self):
            reason = "ImportError: No module named 'nelson_tools' at /home/a/NELSON.py"
            return {
                "tools": [],
                "unavailable": [{"library": "lab", "tool": None, "reason": reason}],
            }

    caplog.set_level(logging.INFO, logger="debrief_tools")
    service = ToolService(Unavailable())  # type: ignore[arg-type]
    for problem in service.unavailable:
        service_module.log_unavailable(problem)
    app = build_app(service, TOKEN, PORT)
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}", raise_server_exceptions=False) as c:
        service.handle = lambda method, params: 1 / 0  # type: ignore[method-assign]
        rpc(c, "NELSON was here")
        rpc(c, "tools/list")
    lines = [r.getMessage() for r in caplog.records]
    assert "rpc_error method=-" in lines and "rpc_error method=tools/list" in lines
    assert any(
        line.startswith("tool_unavailable library=lab tool=- reason=<text:") for line in lines
    )
    assert not any("NELSON" in line or "nelson" in line for line in lines)


def test_a_plot_file_from_a_colleague_is_added_with_its_history(
    client, catalogue, tmp_path: Path
) -> None:
    """One file, history included (decision 13 Oct): undo works on what the sender did."""
    call(client, "core.closest_approach", ["track-nelson", "track-blue"])  # the sender's step
    received = tmp_path / "inbox" / "serial-from-ian.geojson"
    received.parent.mkdir()
    received.write_bytes((catalogue.store.root / "serial" / "plot.geojson").read_bytes())
    params = {"store": "exercise", "path": str(received), "agent": {"kind": "person", "name": "jo"}}
    added = rpc(client, "debrief/add_plot_file", params).json()["result"]
    assert added["item"] == "serial-from-ian" and added["steps"] == 3
    where = {"store": "exercise", "item": "serial-from-ian"}
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert [(s["kind"], s["tool"], s["agent"]) for s in steps] == [
        ("import", "debrief-io.rep", "analyst"),
        ("tool", "core.closest_approach", "analyst"),
        ("import", None, "jo"),
    ]
    assert steps[-1]["notes"] == [
        "Added from the plot file serial-from-ian.geojson",
        "Added to the catalogue Exercise",
    ]
    # The arrival changes only the records: undo takes it with the sender's tool run.
    assert [(s["after"], s["records_only"]) for s in steps] == [(0, False), (1, False), (2, True)]
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    rpc(client, "debrief/undo", {**where, "base": base})
    assert rpc(client, "debrief/open", where).json()["result"]["base"]["current"] == 1
    rpc(client, "debrief/goto", {**where, "step": 1})  # back before the sender's tool run
    plot = catalogue.read_plot("serial-from-ian")
    assert not any(f.id.startswith("cpa-") for f in plot.features)
    # A file whose history was changed outside Debrief is refused, and says why.
    raw = json.loads(received.read_text())
    raw["history"]["steps"][1]["records"][0]["agent"]["name"] = "someone else"
    received.write_text(json.dumps(raw))
    error = rpc(client, "debrief/add_plot_file", params).json()["error"]
    assert error["code"] == -32602
    assert "history has been changed outside Debrief" in error["message"]


def test_tracks_are_moved_rotated_split_and_merged_as_recorded_steps(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    move = {
        "action": "move",
        "distance": {"value": 1.2, "unit": "[nmi_i]"},
        "bearing": {"value": 45, "unit": "deg"},
    }
    moved = rpc(
        client,
        "debrief/edit_track",
        {**where, "base": base, "feature": "track-nelson", "edit": move},
    ).json()["result"]
    assert moved["changed"]
    rotate = {"action": "rotate", "angle": {"value": 10, "unit": "deg"}}
    rotated = rpc(
        client,
        "debrief/edit_track",
        {
            **where,
            "base": moved["base"],
            "feature": "track-nelson",
            "edit": rotate,
            "current_time": "1995-12-12T05:10:00.000Z",
        },
    ).json()["result"]
    late = {"feature": "track-late", "at": "1995-12-12T07:05:00.000Z"}
    split = rpc(client, "debrief/split_track", {**where, "base": rotated["base"], **late}).json()
    # LATE has two fixes: neither part would have the two a track needs.
    assert split["error"]["code"] == -32602
    assert "each part needs at least 2" in split["error"]["message"]
    together = {"features": ["track-late", "track-nelson"], "name": "NELSON"}
    merged = rpc(
        client, "debrief/merge_tracks", {**where, "base": rotated["base"], **together}
    ).json()["result"]
    assert merged["feature"] == "track-nelson"
    # What was not kept is said to the caller, not only in the step's notes: here, nothing.
    assert merged["notes"] == []
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert [s["notes"][0] for s in steps[-3:]] == [
        "NELSON moved 1.20 nmi 045.0°T",
        "NELSON rotated 10.0° clockwise",
        "NELSON and LATE merged",
    ]
    assert steps[-2]["notes"][1].startswith("About 50°")
    # Overlapping tracks are refused, saying where; a stale base is a conflict.
    both = {"features": ["track-nelson", "track-blue"]}
    overlap = rpc(client, "debrief/merge_tracks", {**where, "base": merged["base"], **both}).json()[
        "error"
    ]
    assert overlap["code"] == -32602
    assert "from 05:00:00Z to 05:20:00Z" in overlap["message"]
    stale = rpc(
        client, "debrief/edit_track", {**where, "base": base, "feature": "track-blue", "edit": move}
    ).json()["error"]
    assert stale["code"] == -32001
    incomplete = {"feature": "track-blue", "edit": {"action": "move"}}
    bad = rpc(client, "debrief/edit_track", {**where, **incomplete}).json()["error"]
    assert bad["code"] == -32602 and "distance and a bearing" in bad["message"]
    rpc(client, "debrief/undo", {**where, "base": merged["base"]})
    assert "track-late" in {f.id for f in catalogue.read_plot("serial").features}


def test_tracks_are_sheared_and_stretched_as_recorded_steps(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    shear = {
        "action": "shear",
        "anchor": "start",
        "course": {"value": 80, "unit": "deg"},
        "speed": {"value": 9, "unit": "[kn_i]"},
    }
    sheared = rpc(
        client,
        "debrief/edit_track",
        {**where, "base": base, "feature": "track-nelson", "edit": shear},
    ).json()["result"]
    assert sheared == {**sheared, "changed": True, "feature": "track-nelson"}
    stretch = {"action": "stretch", "anchor": "end", "speed": {"value": 12, "unit": "[kn_i]"}}
    stretched = rpc(
        client,
        "debrief/edit_track",
        {**where, "base": sheared["base"], "feature": "track-nelson", "edit": stretch},
    ).json()["result"]
    assert stretched["changed"]
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert [s["notes"][0] for s in steps[-2:]] == [
        "NELSON sheared: 080.0°T 9.0 kn",
        "NELSON stretched: 12.0 kn",
    ]
    assert steps[-2]["notes"][1] == "Held at the start, 05:00:00Z"
    # A shear says which end it holds; a stale base is a conflict.
    unheld = {**where, "feature": "track-nelson", "edit": {**shear, "anchor": None}}
    bad = rpc(client, "debrief/edit_track", unheld).json()["error"]
    assert bad["code"] == -32602 and "the end it holds" in bad["message"]
    stale = {**where, "base": base, "feature": "track-nelson", "edit": stretch}
    assert rpc(client, "debrief/edit_track", stale).json()["error"]["code"] == -32001


def test_a_fix_is_moved_and_a_track_dead_reckoned_as_recorded_steps(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    nelson = next(f for f in catalogue.read_plot("serial").features if f.id == "track-nelson")
    second = nelson.properties.times[1]
    move_fix = {
        "action": "move_fix",
        "fix_time": second,
        "distance": {"value": 0.42, "unit": "[nmi_i]"},
        "bearing": {"value": 45, "unit": "deg"},
    }
    moved = rpc(
        client,
        "debrief/edit_track",
        {**where, "base": base, "feature": "track-nelson", "edit": move_fix},
    ).json()["result"]
    assert moved == {**moved, "changed": True, "feature": "track-nelson"}
    reckoned = rpc(
        client,
        "debrief/edit_track",
        {
            **where,
            "base": moved["base"],
            "feature": "track-nelson",
            "edit": {"action": "set_plotting_mode", "plotting_mode": "dr"},
        },
    ).json()["result"]
    assert reckoned["changed"]
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert steps[-2]["notes"][0].startswith("NELSON fix at ")
    assert steps[-2]["notes"][0].endswith(" moved 0.42 nmi 045.0°T")
    assert steps[-1]["notes"][0] == "NELSON plotted by dead reckoning"
    # A fix the track does not have; a stale base is a conflict.
    missing = {**move_fix, "fix_time": "2001-01-01T00:00:00.000Z"}
    bad = rpc(
        client, "debrief/edit_track", {**where, "feature": "track-nelson", "edit": missing}
    ).json()["error"]
    assert bad["code"] == -32602 and "NELSON has no fix at" in bad["message"]
    stale = {**where, "base": base, "feature": "track-nelson", "edit": move_fix}
    assert rpc(client, "debrief/edit_track", stale).json()["error"]["code"] == -32001


def test_over_the_ground_after_a_change_made_while_dr_needs_confirming(client) -> None:
    """Decision, product owner, 14 Oct 2026: plotting a track over the ground again after
    it was changed while plotted by dead reckoning loses that change, so the service
    refuses, saying why and how to go ahead; sent again confirming, it is one step."""
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    edit = {**where, "feature": "track-nelson"}
    as_dr = {"action": "set_plotting_mode", "plotting_mode": "dr"}
    rpc(client, "debrief/edit_track", {**edit, "edit": as_dr})
    moved = {
        "action": "move",
        "distance": {"value": 2, "unit": "[nmi_i]"},
        "bearing": {"value": 90, "unit": "deg"},
    }
    rpc(client, "debrief/edit_track", {**edit, "edit": moved})
    # On a DR track a move of the whole track moves where dead reckoning starts.
    last = rpc(client, "debrief/history", where).json()["result"]["steps"][-1]
    assert last["notes"][0] == "NELSON (DR) moved 2.00 nmi 090.0°T"
    assert last["notes"][1].startswith("Dead reckoning now starts from ")
    count = len(rpc(client, "debrief/history", where).json()["result"]["steps"])
    as_otg = {"action": "set_plotting_mode", "plotting_mode": "otg"}
    refused = rpc(client, "debrief/edit_track", {**edit, "edit": as_otg}).json()["error"]
    assert refused["code"] == -32003
    assert refused["message"].startswith("NELSON was changed while plotted by dead reckoning")
    assert (
        "Nothing was changed. To go ahead, send the change again with discard_dr_changes: true."
        in refused["message"]
    )
    assert len(rpc(client, "debrief/history", where).json()["result"]["steps"]) == count
    confirmed = {**as_otg, "discard_dr_changes": True}
    done = rpc(client, "debrief/edit_track", {**edit, "edit": confirmed}).json()["result"]
    assert done["changed"]
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert len(steps) == count + 1
    assert steps[-1]["notes"][:2] == [
        "NELSON plotted over the ground",
        "Changes made while plotted by dead reckoning discarded",
    ]


def test_tracks_are_cleaned_what_would_change_shown_first(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    steps = len(rpc(client, "debrief/history", where).json()["result"]["steps"])
    # Finding jumps changes nothing, and says the threshold it used.
    found = rpc(
        client,
        "debrief/find_jumps",
        {**where, "base": base, "feature": "track-nelson"},
    ).json()["result"]
    assert found["jumps"] == []
    assert found["threshold"]["value"] == pytest.approx(36, abs=0.5)
    assert found["threshold"]["unit"] == "[kn_i]"
    assert found["median_speed"]["value"] == pytest.approx(12, abs=0.1)
    assert found["base"] == base
    slow = {"value": 5, "unit": "[kn_i]"}
    found = rpc(
        client,
        "debrief/find_jumps",
        {**where, "feature": "track-nelson", "threshold": slow, "period": None},
    ).json()["result"]
    assert found["threshold"] == slow
    # Removing what the analyst confirmed is one step, with the threshold for the record.
    removed = rpc(
        client,
        "debrief/remove_jumps",
        {
            **where,
            "base": base,
            "feature": "track-nelson",
            "times": ["1995-12-12T05:10:00.000Z"],
            "threshold": slow,
        },
    ).json()["result"]
    assert removed["changed"]
    # Smoothing previewed (nothing changes), then applied.
    preview = rpc(
        client,
        "debrief/preview_smoothing",
        {**where, "base": removed["base"], "feature": "track-blue", "window": 3},
    ).json()["result"]
    assert preview["preview"]["type"] == "LineString"
    assert len(preview["preview"]["coordinates"]) == 3
    assert preview["moved"] == 1 and preview["largest"]["unit"] == "m"
    assert preview["summary"].startswith("1 fix moved; the most a fix moved: ")
    assert preview["base"] == removed["base"]
    smoothed = rpc(
        client,
        "debrief/smooth_track",
        {**where, "base": removed["base"], "feature": "track-blue", "window": 3},
    ).json()["result"]
    assert smoothed["changed"] and smoothed["summary"] == preview["summary"]
    # A fix labelled, coloured and commented, each a step.
    base = smoothed["base"]
    for changes, name in (
        ({"label": "Turn"}, None),
        ({"colour": "#e01c3e"}, "red"),
        ({"comment": "Wheel over"}, None),
    ):
        marked = rpc(
            client,
            "debrief/mark_fix",
            {
                **where,
                "base": base,
                "feature": "track-blue",
                "time": "1995-12-12T05:10:00.000Z",
                "changes": changes,
                **({"colour_name": name} if name else {}),
            },
        ).json()["result"]
        assert marked["changed"]
        base = marked["base"]
    history = rpc(client, "debrief/history", where).json()["result"]["steps"]
    notes = [(s["notes"] or [""])[0] for s in history]
    assert notes[steps:] == [
        "NELSON: 1 jump removed",
        "BLUE smoothed over 3 fixes",
        "BLUE fix at 05:10:00Z labelled 'Turn'",
        "BLUE fix at 05:10:00Z coloured red",
        "BLUE fix at 05:10:00Z: comment added",
    ]
    blue = next(f for f in catalogue.read_plot("serial").features if f.id == "track-blue")
    (mark,) = blue.properties.fix_marks
    assert (mark.label, mark.colour, mark.comment) == ("Turn", "#e01c3e", "Wheel over")
    # Refusals say why; a stale base is a conflict.
    stale = rpc(
        client,
        "debrief/mark_fix",
        {
            **where,
            "base": removed["base"],
            "feature": "track-blue",
            "time": mark.time,
            "changes": {"label": "x"},
        },
    ).json()["error"]
    assert stale["code"] == -32001
    for method, extra, says in (
        ("debrief/find_jumps", {"threshold": {"value": 5, "unit": "deg"}}, "must be a speed"),
        ("debrief/find_jumps", {"period": "today"}, "period must be"),
        ("debrief/preview_smoothing", {"window": 4}, "odd number of fixes"),
        ("debrief/smooth_track", {"window": "5"}, "needs the window"),
        ("debrief/remove_jumps", {"times": "05:10"}, "needs the times"),
        ("debrief/mark_fix", {"time": mark.time, "changes": {"colour": "red"}}, "not a colour"),
        (
            "debrief/mark_fix",
            {"time": "1995-12-12T05:11:00.000Z", "changes": {"label": "x"}},
            "no fix at 05:11:00Z",
        ),
    ):
        error = rpc(client, method, {**where, "feature": "track-blue", **extra}).json()["error"]
        assert error["code"] == -32602 and says in error["message"], (method, error)
    nothing = rpc(client, "debrief/find_jumps", {**where}).json()["error"]
    assert "needs the track" in nothing["message"]


def test_every_method_that_writes_is_known_and_reading_ones_do_not_write() -> None:
    from debrief_tools import service

    groups = (
        service.STEP_METHODS,
        service.PRESENTATION_METHODS,
        service.ANNOTATION_METHODS,
        service.NARRATIVE_METHODS,
        service.TRACK_METHODS,
        service.CLEANING_METHODS,
    )
    assert set(service.WRITING_METHODS) == {m for g in groups for m in g}
    assert set(service.HISTORY_METHODS) <= service.KNOWN_METHODS
    assert not set(service.READING_METHODS) & set(service.WRITING_METHODS)
    assert not set(service.CHECKING_METHODS) & set(service.WRITING_METHODS)
    assert "debrief/mark_fix" in service.CLEANING_METHODS
    assert "debrief/merge_tracks" in service.TRACK_METHODS
    assert "debrief/set_north_arrow" in service.ANNOTATION_METHODS
    assert "debrief/narrative" in service.READING_METHODS
    assert not set(service.TOTE_METHODS) & set(service.WRITING_METHODS)


def test_the_tote_at_a_time_and_its_choice_in_the_island(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial"}
    chosen = {"primary": "track-nelson", "secondaries": ["track-blue", "track-late"]}
    at = "1995-12-12T05:10:00.000Z"
    result = rpc(client, "debrief/tote", {**where, "time": at, "tote": chosen}).json()["result"]
    models.ToteResult.model_validate(result)
    assert result["primary"]["track"] == "track-nelson"
    blue, late = result["rows"]
    measured = {v["measure"]: v.get("value") for v in blue["values"]}
    assert measured["course"] == pytest.approx(180.0)
    assert measured["relative_bearing"] == pytest.approx(measured["bearing"] - 90.0, abs=1e-6)
    assert late["status"] == "no_data" and late["note"] == "Starts 07:00:00Z"
    # Without a choice, the plot's island says; saving it there is never a step.
    assert rpc(client, "debrief/tote", {**where, "time": at}).json()["result"]["rows"] == []
    opened = rpc(client, "debrief/open", {**where, "agent": AGENT}).json()["result"]
    view = {**opened["view"], "tote": chosen}
    saved = rpc(
        client,
        "debrief/set_view",
        {**where, "agent": AGENT, "view": view, "hash": opened["view_hash"]},
    ).json()["result"]
    assert saved["base"] == opened["base"]
    from_island = rpc(client, "debrief/tote", {**where, "time": at}).json()["result"]
    assert [r["track"] for r in from_island["rows"]] == ["track-blue", "track-late"]
    groups = rpc(client, "debrief/measure_groups").json()["result"]
    assert [g["id"] for g in groups["groups"]] == ["core"]


@pytest.mark.parametrize(
    ("params", "says"),
    [
        ({"time": "noon"}, "time"),
        (
            {"time": "1995-12-12T05:10:00.000Z", "tote": {"primary": "a", "secondaries": ["a"]}},
            "also",
        ),
        ({"time": "1995-12-12T05:10:00.000Z", "tote": "track-nelson"}, "tote must be"),
        ({"time": "1995-12-12T05:10:00.000Z", "item": "nowhere"}, "nowhere"),
        ({}, "needs"),
    ],
)
def test_the_tote_refuses_what_it_cannot_read(client, params, says) -> None:
    error = rpc(client, "debrief/tote", {"store": "exercise", "item": "serial", **params}).json()[
        "error"
    ]
    assert error["code"] == -32602 and says in error["message"]


def _word_log(path: Path) -> Path:
    """A synthetic narrative document (DEV-05): an entry a paragraph, its metadata hidden."""
    import docx

    document = docx.Document()
    document.add_paragraph("Exercise B narrative")
    for shown, hidden, text in [
        ("120505", ",12,12,95,HMS NELSON,OOW COMMENT,", "Came to 090."),
        ("120506", ",12,12,95,HMS NELSON,COMMS,", "Signal from C."),
        ("121130", ",12,12,95,RED THREE,OOW COMMENT,", "After the plot's period."),
    ]:
        paragraph = document.add_paragraph(shown)
        paragraph.add_run(hidden).font.hidden = True
        paragraph.add_run(text)
    document.save(path)
    return path


def test_word_narrative_is_previewed_then_read_in_with_the_analysts_choices(
    client, catalogue, tmp_path
) -> None:
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    log = _word_log(tmp_path / "nelson-log.docx")
    preview = rpc(client, "debrief/preview_narrative", {**where, "path": str(log)}).json()
    preview = preview["result"]
    assert (preview["dialect"], preview["entries"], preview["outside"]) == (
        "narrative-document",
        3,
        1,
    )
    assert preview["types"] == [
        {"name": "OOW COMMENT", "count": 2},
        {"name": "COMMS", "count": 1},
    ]
    assert preview["sources"][0] == {"name": "HMS NELSON", "count": 2, "track_id": "track-nelson"}
    # A preview needs no plot, for a document imported as a plot of its own.
    alone = rpc(client, "debrief/preview_narrative", {"path": str(log)}).json()["result"]
    assert alone["outside"] == 0 and alone["plot_start"] is None
    base = rpc(client, "debrief/open", where).json()["result"]["base"]
    read = rpc(
        client,
        "debrief/import_narrative",
        {
            **where,
            "base": base,
            "path": str(log),
            "types": ["OOW COMMENT"],
            "within_period": True,
            "tracks": {"RED THREE": None},
        },
    ).json()["result"]
    assert (read["entries"], read["sources"]) == (1, ["HMS NELSON"])
    assert any("types not chosen" in o for o in read["omitted"])
    assert any("outside the plot's period" in o for o in read["omitted"])
    bad = rpc(
        client, "debrief/import_narrative", {**where, "path": str(log), "types": "OOW"}
    ).json()["error"]
    assert bad["code"] == -32602 and "types" in bad["message"]


def test_a_word_document_imports_as_a_plot_and_is_not_asked_about_modes(client, tmp_path) -> None:
    log = _word_log(tmp_path / "nelson-log.docx")
    tracks = rpc(client, "debrief/rep_tracks", {"path": str(log)}).json()["result"]
    assert tracks == {"tracks": []}
    report = rpc(
        client, "debrief/import", {"store": "exercise", "path": str(log), "agent": AGENT}
    ).json()["result"]
    assert report["narrative_entries"] == 3 and report["tracks"] == []
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"%PDF-1.4\nnot really")
    refused = rpc(
        client, "debrief/import", {"store": "exercise", "path": str(broken), "agent": AGENT}
    ).json()["error"]
    assert refused["code"] == -32602 and refused["message"].startswith("broken.pdf")
