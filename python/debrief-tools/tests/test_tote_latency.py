"""NFR-04: Tote values update within 100 ms of a change to current time.

Plays the time slider over the sample exercise's serial 1 through the tool service
(debrief/tote over HTTP, in process) and directly (the computation alone), BLUE ONE
against every other track, and reports the numbers. The assertion is the budget
itself, far above what is measured (a few milliseconds), so a slow CI machine does
not fail it; the report says precisely what was seen. The playground test reports
the same under Pyodide, and the VS Code integration test through the real service.
Set DEBRIEF_LATENCY_REPORT to a file to keep the numbers as JSON.
"""

import json
import os
import statistics
import time
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from debrief_config import add_store, update_config
from debrief_kernel.time import format_utc, parse_utc
from debrief_sample import build
from debrief_stac import Catalogue
from debrief_stac import tote as tote_module
from debrief_stac.tote import tote, tote_tracks
from debrief_tools.service import ToolService, build_app
from debrief_tools.worker import ToolWorker

BUDGET_MS = 100.0
TOKEN = "t" * 40
PORT = 43211
HEADERS = {"authorization": f"Bearer {TOKEN}", "host": f"127.0.0.1:{PORT}"}
STEPS = 400  # a two-hour drag of the slider, a position every 18 s


def percentiles(samples: list[float]) -> dict[str, float]:
    ordered = sorted(samples)

    def at(p: float) -> float:
        return ordered[min(len(ordered) - 1, round(p * (len(ordered) - 1)))]

    return {
        "p50": round(statistics.median(ordered), 2),
        "p95": round(at(0.95), 2),
        "p99": round(at(0.99), 2),
        "max": round(ordered[-1], 2),
    }


@pytest.fixture(scope="module")
def sample(tmp_path_factory) -> tuple[Path, Path]:
    root = tmp_path_factory.mktemp("tote-latency")
    build(root / "sample")
    config = root / "config.json"
    update_config(lambda c: add_store(c, title="Sample", location=str(root / "sample"))[0], config)
    return root / "sample", config


def test_tote_keeps_pace_with_the_time_slider(sample, capsys) -> None:
    location, config = sample
    catalogue = Catalogue.open(location)
    plot = catalogue.read_plot("serial-1")
    tracks = [t["id"] for t in tote_tracks(plot)]
    view = {
        "primary": "track-blue-one",
        "secondaries": [t for t in tracks if t != "track-blue-one"],
    }
    start = parse_utc("2023-06-15T09:00:00.000Z")
    times = [format_utc(start + i * 18_000) for i in range(STEPS)]

    # The computation alone, cold (the plot's tracks prepared) and then warm.
    tote_module._CACHE.clear()
    began = time.perf_counter()
    first = tote(catalogue, "serial-1", times[0], view)
    cold_ms = (time.perf_counter() - began) * 1000
    assert all(r["status"] == "ok" for r in first["rows"][:1])
    compute = []
    for at in times:
        began = time.perf_counter()
        tote(catalogue, "serial-1", at, view)
        compute.append((time.perf_counter() - began) * 1000)

    # Through the service, one request after another, as the extension sends them.
    worker = ToolWorker(["debrief_tools.core"], str(config), timeout_s=30)
    try:
        client = TestClient(
            build_app(ToolService(worker, str(config)), TOKEN, PORT),
            base_url=f"http://127.0.0.1:{PORT}",
        )
        store = client.post(
            "/mcp",
            content=json.dumps({"jsonrpc": "2.0", "id": 0, "method": "debrief/stores"}),
            headers=HEADERS,
        ).json()["result"]["stores"][0]["id"]
        service = []
        for n, at in enumerate(times):
            body = {
                "jsonrpc": "2.0",
                "id": n + 1,
                "method": "debrief/tote",
                "params": {"store": store, "item": "serial-1", "time": at, "tote": view},
            }
            began = time.perf_counter()
            reply = client.post("/mcp", content=json.dumps(body), headers=HEADERS).json()
            service.append((time.perf_counter() - began) * 1000)
            assert reply["result"]["time"] == at
    finally:
        worker.close()

    report = {
        "scenario": f"serial 1: BLUE ONE and {len(view['secondaries'])} secondaries, "
        f"{STEPS} slider positions",
        "budget_ms": BUDGET_MS,
        "cold_first_call_ms": round(cold_ms, 2),
        "compute_ms": percentiles(compute),
        "service_ms": percentiles(service),
        "within_budget": sum(s <= BUDGET_MS for s in service) / len(service),
    }
    with capsys.disabled():
        print(f"\nTote latency (NFR-04): {json.dumps(report)}")
    if os.environ.get("DEBRIEF_LATENCY_REPORT"):
        Path(os.environ["DEBRIEF_LATENCY_REPORT"]).write_text(json.dumps(report, indent=2))
    assert report["service_ms"]["p95"] < BUDGET_MS
    assert report["compute_ms"]["p95"] < BUDGET_MS
