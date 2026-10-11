"""The tool service over HTTP: security checks, the MCP methods, and a real MCP client."""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from starlette.testclient import TestClient

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
