"""The tool service over HTTP: security checks, the MCP methods, and a real MCP client."""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from debrief_tools import Registry
from debrief_tools.service import ToolService, build_app

TOKEN = "t" * 40
PORT = 43210
HEADERS = {"authorization": f"Bearer {TOKEN}", "host": f"127.0.0.1:{PORT}"}


@pytest.fixture
def client(config_file: Path) -> TestClient:
    app = build_app(ToolService(Registry.discover(), str(config_file)), TOKEN, PORT)
    return TestClient(app, base_url=f"http://127.0.0.1:{PORT}")


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
    assert rings["inputSchema"]["required"] == ["store", "item", "selection"]


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
    arguments = {"store": "exercise", "item": "serial", "selection": ["track-nelson", "track-blue"]}
    result = rpc(
        client, "tools/call", {"name": "core.closest_approach", "arguments": arguments}
    ).json()["result"]
    assert result["isError"] is False and result["structuredContent"]["changed"] is True
    assert catalogue.read_plot("serial").features[-1].id.startswith("cpa-")


def test_call_errors_are_results_not_crashes(client) -> None:
    for arguments in (
        {"store": "nowhere", "item": "serial", "selection": []},
        {"store": "exercise", "item": "serial", "selection": ["track-nelson"]},
    ):
        result = rpc(
            client, "tools/call", {"name": "core.closest_approach", "arguments": arguments}
        ).json()
        assert result["result"]["isError"] is True
    assert (
        "no store 'nowhere'"
        in rpc(
            client,
            "tools/call",
            {
                "name": "core.closest_approach",
                "arguments": {"store": "nowhere", "item": "x", "selection": []},
            },
        ).json()["result"]["content"][0]["text"]
    )
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
                    {"store": "exercise", "item": "serial", "selection": ["track-nelson"]},
                )
                return listed, called

        listed, called = asyncio.run(session())
        assert {"core.track_summary", "core.add_note"} <= {t.name for t in listed.tools}
        assert called.is_error is False
        assert called.structured_content["result"]["non_spatial"][0]["title"] == "Track summary"
    finally:
        server.terminate()
        server.wait(timeout=10)
