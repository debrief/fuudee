"""TMA solutions through the tool service (CAP-21; product owner, 24 Oct 2026): an agent
makes a solution from a sensor's cuts, reads its residuals, splits it into legs, leaves a
cut out of its RMS and counts it again, each a step it can undo; a solution is dragged as
any track is (debrief/edit_track); and a change from a plot since changed is refused."""

import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from debrief_tools.service import CONFLICT, INVALID_PARAMS, ToolService, build_app
from debrief_tools.worker import ToolWorker

TOKEN = "t" * 40
PORT = 43211
HEADERS = {"authorization": f"Bearer {TOKEN}", "host": f"127.0.0.1:{PORT}"}
AGENT = {"kind": "software_agent", "name": "test agent"}
WHERE = {"store": "exercise", "item": "serial", "agent": AGENT}

DSF = "".join(
    f";SENSOR: 951212 05{m:02d}00 nelson @A NULL {40 + m * 0.5:.1f} NULL Bow x\n"
    for m in range(0, 21)
)


@pytest.fixture
def client(config_file: Path, lab_library: str):
    worker = ToolWorker([lab_library], str(config_file), timeout_s=3)
    app = build_app(ToolService(worker, str(config_file)), TOKEN, PORT)
    yield TestClient(app, base_url=f"http://127.0.0.1:{PORT}")
    worker.close()


def rpc(client: TestClient, method: str, params: dict | None = None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/mcp", content=json.dumps(body), headers=HEADERS)


def result(client: TestClient, method: str, params: dict) -> dict:
    answer = rpc(client, method, params).json()
    assert "result" in answer, answer
    return answer["result"]


@pytest.fixture
def sensor(client, tmp_path) -> str:
    dsf = tmp_path / "bow.dsf"
    dsf.write_text(DSF)
    return result(client, "debrief/import_sensor", {**WHERE, "path": str(dsf)})["sensors"][0]


def test_an_agent_makes_a_solution_reads_its_residuals_and_changes_it(client, sensor) -> None:
    period = {"start": "1995-12-12T05:00:00.000Z", "end": "1995-12-12T05:20:00.000Z"}
    made = result(
        client,
        "debrief/tma_create",
        {
            **WHERE,
            "sensor_ids": [sensor],
            "period": period,
            "range": {"value": 4, "unit": "[nmi_i]"},
            "course": {"value": 200, "unit": "deg"},
            "speed": {"value": 6, "unit": "[kn_i]"},
        },
    )
    feature = made["feature"]
    assert made["changed"] and made["notes"][0] == (
        "Contact 1 solution made: 21 Bow cuts 05:00:00Z–05:20:00Z"
    )
    assert made["residuals"]["counted"] == 21 and made["residuals"]["rms"] > 0

    read = result(client, "debrief/tma_residuals", {**WHERE, "feature": feature})["residuals"]
    assert read == made["residuals"]
    first = read["rows"][0]
    assert first["sensor"] == "Bow" and first["used"] == "bearing" and first["leg"] == 1
    assert {"origin", "calculated", "measured", "residual", "time", "id"} <= set(first)

    split = result(
        client,
        "debrief/tma_split_leg",
        {**WHERE, "feature": feature, "at": "1995-12-12T05:10:00.000Z"},
    )
    assert split["notes"][1].startswith("Leg 1 05:00:00Z–05:09:00Z, leg 2 05:10:00Z")

    left = result(
        client,
        "debrief/tma_exclude_cut",
        {**WHERE, "feature": feature, "cut_ids": [first["id"]], "excluded": True},
    )
    assert left["changed"] and left["residuals"]["excluded"] == 1
    again = result(
        client,
        "debrief/tma_exclude_cut",
        {**WHERE, "feature": feature, "cut_ids": [first["id"]], "excluded": True},
    )
    assert again == {
        "changed": False,
        "recovered": again["recovered"],
        "base": again["base"],
        "latest": again["latest"],
    }

    # Dragged as any track: shear leg 2 alone, holding its start.
    result(
        client,
        "debrief/edit_track",
        {
            **WHERE,
            "feature": feature,
            "edit": {
                "action": "shear",
                "anchor": "start",
                "distance": {"value": 0.5, "unit": "[nmi_i]"},
                "bearing": {"value": 0, "unit": "deg"},
                "period": {"start": "1995-12-12T05:10:00.000Z", "end": "1995-12-12T05:20:00.000Z"},
            },
        },
    )
    after = result(client, "debrief/tma_residuals", {**WHERE, "feature": feature})["residuals"]
    for before, now in zip(read["rows"][:10], after["rows"][:10], strict=True):
        assert now["residual"] == pytest.approx(before["residual"], abs=1e-9)  # leg 1 stays
    assert after["rows"][15]["residual"] != pytest.approx(read["rows"][15]["residual"])

    steps = result(client, "debrief/history", WHERE)["steps"]
    assert [s["notes"][0] for s in steps[-4:-1]] == [
        "Contact 1 solution made: 21 Bow cuts 05:00:00Z–05:20:00Z",
        "Contact 1 solution split into legs at 05:10:00Z",
        "Contact 1 solution: cut at 05:00:00Z left out of the RMS",
    ]
    assert steps[-1]["notes"][0].startswith("Contact 1 solution (DR) part sheared: ")
    assert steps[-1]["agent"] == "test agent"
    # Undone like any step.
    result(client, "debrief/undo", WHERE)
    result(client, "debrief/undo", WHERE)
    undone = result(client, "debrief/tma_residuals", {**WHERE, "feature": feature})["residuals"]
    assert undone["excluded"] == 0


def test_tma_methods_refuse_what_they_cannot_do(client, sensor) -> None:
    def error(method: str, params: dict) -> dict:
        answer = rpc(client, method, {**WHERE, **params}).json()
        assert "error" in answer, answer
        return answer["error"]

    assert "needs the solution" in error("debrief/tma_residuals", {})["message"]
    nothing = error("debrief/tma_create", {"sensor_ids": ["sensor-none"]})
    assert nothing["code"] == INVALID_PARAMS and "no sensor" in nothing["message"]
    not_one = error("debrief/tma_residuals", {"feature": "track-nelson"})
    assert "not a TMA solution" in not_one["message"]
    no_cuts = error("debrief/tma_exclude_cut", {"feature": "x", "cut_ids": []})
    assert "needs cut_ids" in no_cuts["message"]
    assert "needs the time" in error("debrief/tma_split_leg", {"feature": "x"})["message"]
    base = result(client, "debrief/open", WHERE)["base"]
    result(client, "debrief/tma_create", {**WHERE, "sensor_ids": [sensor]})
    stale = error("debrief/tma_create", {"sensor_ids": [sensor], "base": base})
    assert stale["code"] == CONFLICT
