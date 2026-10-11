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


def test_presentation_is_kept_beside_the_plot_outside_its_history(client, catalogue) -> None:
    where = {"store": "exercise", "item": "serial"}
    first = rpc(client, "debrief/presentation", where).json()["result"]
    assert first == {
        "presentation": {"schema_version": first["presentation"]["schema_version"], "features": []},
        "hash": "",
    }
    blue = {**first["presentation"], "features": [{"id": "track-nelson", "colour": "#0064bd"}]}
    changed = rpc(
        client, "debrief/set_presentation", {**where, "presentation": blue, "hash": ""}
    ).json()
    new_hash = changed["result"]["hash"]
    assert rpc(client, "debrief/presentation", where).json()["result"]["presentation"] == blue
    stale = rpc(
        client, "debrief/set_presentation", {**where, "presentation": blue, "hash": ""}
    ).json()
    assert stale["error"]["code"] == -32001  # changed since that hash was read
    hidden = {**blue, "features": [*blue["features"], {"id": "track-late", "hidden": True}]}
    assert rpc(
        client, "debrief/set_presentation", {**where, "presentation": hidden, "hash": new_hash}
    ).json()["result"]
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert len(steps) == 1  # never recorded in the plot's history (SUB-22)
    assert "presentation" in catalogue.read_item("serial").assets


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
