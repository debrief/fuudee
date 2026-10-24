"""Sensors through the tool service (CAP-22, TL-14): a .dsf file previewed and read into
the plot, its cuts listed with where each is drawn from, and ambiguous cuts resolved one
at a time or a period at a time, each a step an agent can undo, as the analyst can."""

import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from debrief_tools.service import (
    CONFLICT,
    INVALID_PARAMS,
    NEEDS_CONFIRMATION,
    ToolService,
    build_app,
)
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


def rpc(client: TestClient, method: str, params: dict | None = None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/mcp", content=json.dumps(body), headers=HEADERS)


DSF = """\
;SENSOR2: 951212 050000 nelson @A NULL 45.0 135.0 NULL NULL TA 0500
;SENSOR2: 951212 050500 nelson @A NULL 46.0 134.0 NULL NULL TA 0505
;SENSOR2: 951212 051000 nelson @A NULL 47.0 133.0 150.1 NULL TA 0510
;SENSOR: 951212 051000 GHOST @A NULL 10 NULL Hull x
"""
WHERE = {"store": "exercise", "item": "serial", "agent": AGENT}


def test_a_dsf_is_previewed_read_in_and_resolved_by_an_agent(client, catalogue, tmp_path) -> None:
    dsf = tmp_path / "s2046.dsf"
    dsf.write_text(DSF)
    seen = rpc(client, "debrief/preview_sensor", {**WHERE, "path": str(dsf)}).json()["result"]
    by_track = {s["track"]: s for s in seen["sensors"]}
    assert by_track["nelson"]["host_track_id"] == "track-nelson"
    assert by_track["GHOST"]["host_track_id"] is None
    assert any("gave a frequency" in o for o in seen["omitted"])

    # A track that is not in the plot must be said.
    asked = rpc(client, "debrief/import_sensor", {**WHERE, "path": str(dsf)}).json()["error"]
    assert asked["code"] == NEEDS_CONFIRMATION and "'GHOST'" in asked["message"]
    base = rpc(client, "debrief/open", WHERE).json()["result"]["base"]
    read = rpc(
        client,
        "debrief/import_sensor",
        {**WHERE, "base": base, "path": str(dsf), "hosts": {"GHOST": None}},
    ).json()["result"]
    assert read["cuts"] == 3 and read["sensors"] == ["sensor-nelson-ta"]

    listed = rpc(client, "debrief/sensors", WHERE).json()["result"]["sensors"]
    assert listed == [
        {
            "id": "sensor-nelson-ta",
            "name": "TA",
            "host_track_id": "track-nelson",
            "host": "NELSON",
            "colour": "#0064bd",
            "hidden": False,
            "cuts": 3,
            "ambiguous": 3,
            "resolved": 0,
            "start": "1995-12-12T05:00:00.000Z",
            "end": "1995-12-12T05:10:00.000Z",
        }
    ]
    period = {"start": "1995-12-12T05:00:00.000Z", "end": "1995-12-12T05:05:00.000Z"}
    cuts = rpc(client, "debrief/sensors", {**WHERE, "cuts": True, "period": period}).json()
    (sensor,) = cuts["result"]["sensors"]
    first, second = sensor["cut_list"]
    assert first["bearing"] == 45.0 and first["ambiguous_bearing"] == 135.0
    assert first["side"] == "port"  # NELSON heads east: 045 is to port
    assert first["origin"][0] < second["origin"][0]  # drawn from where NELSON was

    done = rpc(
        client,
        "debrief/resolve_ambiguity",
        {**WHERE, "keep": "starboard", "sensor_ids": ["sensor-nelson-ta"], "period": period},
    ).json()["result"]
    assert done["notes"][0] == "Starboard kept: 2 TA cuts 05:00:00Z–05:05:00Z"
    listed = rpc(client, "debrief/sensors", WHERE).json()["result"]["sensors"]
    assert (listed[0]["ambiguous"], listed[0]["resolved"]) == (1, 2)
    rpc(client, "debrief/undo", WHERE)
    listed = rpc(client, "debrief/sensors", WHERE).json()["result"]["sensors"]
    assert (listed[0]["ambiguous"], listed[0]["resolved"]) == (3, 0)

    # A stale base is refused; a bad request says why.
    stale = rpc(
        client,
        "debrief/resolve_ambiguity",
        {**WHERE, "base": base, "keep": "port", "sensor_ids": ["sensor-nelson-ta"]},
    ).json()["error"]
    assert stale["code"] in (CONFLICT, INVALID_PARAMS)
    bad = rpc(
        client, "debrief/resolve_ambiguity", {**WHERE, "keep": "left", "cut_ids": ["cut-00001"]}
    ).json()["error"]
    assert bad["code"] == INVALID_PARAMS and "keep is port" in bad["message"]
