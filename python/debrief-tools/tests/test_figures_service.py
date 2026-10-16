"""Exported images through the tool service (SUB-25, EXT-05, OUT-04), as the hosts and agents
use them: an ID for the export, the image stamped and written, the export logged in the
plot's island and never a step, and the image traced back by its file or its typed ID to
the plot, shown as it was at that revision."""

import base64
import json
import struct
import zlib
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from debrief_config import update_config
from debrief_stac.figures import figure_ids_in
from debrief_tools.service import ToolService, build_app
from debrief_tools.worker import ToolWorker

TOKEN = "t" * 40
PORT = 43211
HEADERS = {"authorization": f"Bearer {TOKEN}", "host": f"127.0.0.1:{PORT}"}
AGENT = {"kind": "person", "name": "analyst"}
WHERE = {"store": "exercise", "item": "serial"}


@pytest.fixture
def client(config_file: Path, lab_library: str):
    worker = ToolWorker([lab_library], str(config_file), timeout_s=3)
    app = build_app(ToolService(worker, str(config_file)), TOKEN, PORT)
    yield TestClient(app, base_url=f"http://127.0.0.1:{PORT}")
    worker.close()


def rpc(client: TestClient, method: str, params: dict | None = None) -> dict:
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/mcp", content=json.dumps(body), headers=HEADERS).json()


def png() -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        crc = struct.pack(">I", zlib.crc32(kind + data))
        return struct.pack(">I", len(data)) + kind + data + crc

    rows = b"".join(b"\0" + b"\x20\x20\x20" * 8 for _ in range(6))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 6, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


VIEW = {
    "viewport": {"bbox": [-4.2, 50.3, -4.0, 50.4]},
    "time": {
        "current": "1995-12-12T05:10:00.000Z",
        "range": {"start": "1995-12-12T05:00:00.000Z", "end": "1995-12-12T05:20:00.000Z"},
    },
}


def export(client, tmp_path: Path, name: str = "serial.png", **given) -> dict:
    figure = rpc(client, "debrief/figure_id", WHERE)["result"]
    image_format = given.pop("format", "png")
    image = (
        base64.b64encode(png()).decode()
        if image_format == "png"
        else '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"></svg>'
    )
    params = {
        **WHERE,
        "id": figure["id"],
        "image": image,
        "file": str(tmp_path / name),
        "format": image_format,
        "footer": True,
        "preset": "slide",
        "theme": "light",
        "width": 8,
        "height": 6,
        "agent": AGENT,
        **VIEW,
        **given,
    }
    return {"figure": figure, "answer": rpc(client, "debrief/export_image", params)}


def test_export_is_stamped_written_and_logged_never_a_step(client, tmp_path: Path) -> None:
    before = rpc(client, "debrief/history", WHERE)["result"]
    done = export(client, tmp_path)
    figure, answer = done["figure"], done["answer"]["result"]
    assert answer["recorded"] and "note" not in answer
    assert answer["id"] == figure["id"] and answer["short"] == figure["short"]
    # Read back from the file written: the ID is in its metadata.
    written = (tmp_path / "serial.png").read_bytes()
    assert figure_ids_in(written).ids == [(figure["id"], "the image")]
    # The export log is in the island: no step, the same revision.
    after = rpc(client, "debrief/history", WHERE)["result"]
    assert after["base"] == before["base"] and len(after["steps"]) == len(before["steps"])
    view = rpc(client, "debrief/open", {**WHERE, "agent": AGENT})["result"]["view"]
    logged = view["exports"][0]
    assert logged["id"] == figure["id"] and logged["revision"] == before["base"]["plot_hash"]
    assert logged["file"] == "serial.png" and logged["by"] == "analyst"
    assert logged["viewport"] == VIEW["viewport"] and logged["time"] == VIEW["time"]
    assert (logged["format"], logged["footer"], logged["preset"]) == ("png", True, "slide")
    # An SVG, without its footer: logged beside the first.
    svg = export(client, tmp_path, "serial.svg", format="svg", footer=False)["answer"]["result"]
    assert figure_ids_in((tmp_path / "serial.svg").read_bytes()).ids[0][0] == svg["id"]
    view = rpc(client, "debrief/open", {**WHERE, "agent": AGENT})["result"]["view"]
    assert [e["format"] for e in view["exports"]] == ["png", "svg"]


def test_find_by_file_and_by_typed_id_then_open_that_revision(client, tmp_path: Path) -> None:
    done = export(client, tmp_path)
    figure = done["figure"]
    exported = rpc(client, "debrief/history", WHERE)["result"]["base"]
    # The analyst carries on: a colour change, one more step.
    coloured = rpc(
        client,
        "debrief/set_colour",
        {
            **WHERE,
            "base": exported,
            "agent": AGENT,
            "features": ["track-nelson"],
            "colour": "#00a0a0",
        },
    )
    assert coloured["result"]["changed"], coloured
    by_file = rpc(client, "debrief/find_image_source", {"file": str(tmp_path / "serial.png")})
    image = by_file["result"]["images"][0]
    assert image["id"] == figure["id"] and image["where"] == "serial.png"
    [source] = image["sources"]
    assert (source["store"], source["item"], source["step"], source["current"]) == (
        "exercise",
        "serial",
        exported["current"],
        exported["current"] + 1,
    )
    assert source["revision"] == exported["plot_hash"] and source["export"]["id"] == figure["id"]
    typed = rpc(client, "debrief/find_image_source", {"id": figure["short"].lower()})
    assert typed["result"]["images"][0]["sources"][0]["step"] == exported["current"]
    # Shown as it was: rebuilt and checked, the colour change not in it.
    shown = rpc(
        client,
        "debrief/open_revision",
        {**WHERE, "revision": source["revision"], "id": figure["id"]},
    )["result"]
    assert (shown["step"], shown["current"]) == (exported["current"], exported["current"] + 1)
    assert shown["export"]["id"] == figure["id"]
    nelson = next(f for f in shown["plot"]["features"] if f["id"] == "track-nelson")
    assert nelson["properties"].get("style", {}).get("colour") != "#00a0a0"


def test_what_is_refused_and_said(client, tmp_path: Path) -> None:
    mistyped = rpc(client, "debrief/find_image_source", {"id": "DBF-2ZBP-04HM-ASWB"})
    assert "character wrong" in mistyped["error"]["message"]
    nothing = tmp_path / "plain.png"
    nothing.write_bytes(png())
    said = rpc(client, "debrief/find_image_source", {"file": str(nothing)})["result"]
    assert said["images"] == [] and "footer" in said["problem"]
    wrong = export(client, tmp_path, "serial.svg")["answer"]
    assert "ends .png" in wrong["error"]["message"]
    export(client, tmp_path)
    again = export(client, tmp_path)["answer"]
    assert "there already" in again["error"]["message"]
    assert export(client, tmp_path, overwrite=True)["answer"]["result"]["recorded"]
    other = rpc(client, "debrief/figure_id", WHERE)["result"]["id"]
    fake = rpc(
        client,
        "debrief/export_image",
        {
            **WHERE,
            "id": other,
            "image": "bm90IGEgcG5n",
            "file": str(tmp_path / "x.png"),
            "format": "png",
            "footer": True,
        },
    )
    assert "not the PNG" in fake["error"]["message"]


def test_a_read_only_catalogue_exports_but_does_not_log(
    client, tmp_path: Path, config_file: Path
) -> None:
    def read_only(config):
        stores = [s.model_copy(update={"read_only": True}) for s in config.stores]
        return config.model_copy(update={"stores": stores})

    update_config(read_only, config_file)
    answer = export(client, tmp_path)["answer"]["result"]
    assert not answer["recorded"] and "read-only" in answer["note"]
    assert (tmp_path / "serial.png").exists()
    view = rpc(client, "debrief/open", {**WHERE, "agent": AGENT})["result"]["view"]
    assert not (view or {}).get("exports")
