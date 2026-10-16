"""Collation through the tool service (CAP-08 to CAP-12), as agents and the hosts use it."""

import json
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


def rpc(client: TestClient, method: str, params: dict | None = None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/mcp", content=json.dumps(body), headers=HEADERS)


NELSON_LOG = """\
951212 052000.000 Nelson @C 50 20 00.00 N 004 03 44.00 W 090.0 12.0 0
951212 053000.000 Nelson @C 50 20 00.00 N 004 00 36.00 W 090.0 12.0 0
951212 054000.000 Nelson @C 50 20 00.00 N 003 57 28.00 W 090.0 12.0 0
951212 055000.000 Nelson @C 50 20 00.00 N 003 54 20.00 W 090.0 12.0 0
"""


def test_collation_coverage_new_data_preference_links_and_review(client, tmp_path: Path) -> None:
    """Coverage, taking new data, choosing a source for a period, linking platforms,
    setting new data aside, and review flags."""
    where = {"store": "exercise", "item": "serial", "agent": AGENT}
    source = tmp_path / "nelson-log.rep"
    source.write_text(NELSON_LOG)
    log = rpc(
        client, "debrief/import_rep", {"store": "exercise", "path": str(source), "agent": AGENT}
    ).json()["result"]["item"]
    covered = rpc(client, "debrief/coverage", where).json()["result"]["coverage"]
    nelson = next(p for p in covered["platforms"] if p["name"] == "NELSON")
    assert [s["link"] for s in nelson["sources"]] == ["plot", "proposed"]
    marked = next(i for i in covered["items"] if i["item"] == log)
    assert marked["new_data"]["platforms"] == ["NELSON"]
    # Set aside: the island, not a step; then taken after all, as one step.
    item_ref = {"catalogue": covered["catalogue"], "item": log}
    aside = rpc(
        client,
        "debrief/dismiss_new_data",
        {**where, "source": {**item_ref, "revision": marked["revision"]}},
    ).json()["result"]
    assert aside["changed"] and aside["view"]["collation"]["dismissed"][0]["item"] == log
    opened = rpc(client, "debrief/open", where).json()["result"]
    taken = rpc(
        client,
        "debrief/take_new_data",
        {**where, "base": opened["base"], "source": {**item_ref, "revision": marked["revision"]}},
    ).json()["result"]
    assert taken["changed"] and taken["base"]["current"] == opened["base"]["current"] + 1
    steps = rpc(client, "debrief/history", where).json()["result"]["steps"]
    assert steps[-1]["notes"][:2] == ["New data from nelson-log", "NELSON 3 fixes"]
    # A period's source chosen: the log at 05:20, when both have a fix.
    covered = rpc(client, "debrief/coverage", where).json()["result"]["coverage"]
    nelson = next(p for p in covered["platforms"] if p["name"] == "NELSON")
    log_source = next(s for s in nelson["sources"] if s["item"] == log)
    ref = {k: log_source[k] for k in ("catalogue", "item", "track", "name")}
    period = {"start": "1995-12-12T05:20:00.000Z", "end": "1995-12-12T05:20:00.000Z"}
    chosen = rpc(
        client,
        "debrief/set_source_preference",
        {**where, "feature": "track-nelson", "period": period, "source": ref},
    ).json()["result"]
    assert chosen["changed"]
    unlinked = rpc(
        client,
        "debrief/link_tracks",
        {**where, "feature": "track-nelson", "source": ref, "linked": False},
    ).json()["error"]
    assert unlinked["code"] == -32602 and "Choose another source" in unlinked["message"]
    linked = rpc(
        client,
        "debrief/link_tracks",
        {**where, "feature": "track-blue", "source": ref, "linked": True},
    ).json()["result"]
    assert linked["changed"]
    # The log revised: the plot may need review, for agents and the browser alike.
    recolour = {
        "store": "exercise",
        "item": log,
        "features": ["track-nelson"],
        "colour": "#00ff00",
        "agent": AGENT,
    }
    assert rpc(client, "debrief/set_colour", recolour).json()["result"]["changed"]
    flags = rpc(client, "debrief/review_flags").json()["result"]["flags"]
    assert [(f["item"], f["store"]) for f in flags] == [("serial", "exercise")]
    cleared = rpc(client, "debrief/clear_review_flag", where).json()["result"]
    assert cleared["changed"]
    assert rpc(client, "debrief/review_flags").json()["result"]["flags"] == []
    missing = rpc(client, "debrief/take_new_data", {**where, "source": "log"}).json()["error"]
    assert missing["code"] == -32602
