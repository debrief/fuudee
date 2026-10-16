"""Exported images through the tool service (SUB-25, EXT-05, OUT-04), as the hosts and agents
use them: an ID for the export, the image stamped and written, the export logged in the
plot's island and never a step, and the image traced back by its file or its typed ID to
the plot, shown as it was at that revision."""

import base64
import json
import struct
import threading
import zipfile
import zlib
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from debrief_config import update_config
from debrief_stac.figures import figure_ids_in
from debrief_tools.service import RpcError, ToolService, build_app
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


def written(answer: dict, tmp_path: Path, name: str = "serial.png") -> Path:
    """The stamped image the service gave back, written as the host writes it."""
    data = answer["image"]
    target = tmp_path / name
    if name.endswith(".png"):
        target.write_bytes(base64.b64decode(data))
    else:
        target.write_text(data, encoding="utf-8")
    return target


def test_export_is_stamped_given_back_and_logged_never_a_step(client, tmp_path: Path) -> None:
    before = rpc(client, "debrief/history", WHERE)["result"]
    done = export(client, tmp_path)
    figure, answer = done["figure"], done["answer"]["result"]
    assert answer["recorded"] and answer["logged"] == "plot" and "note" not in answer
    assert answer["id"] == figure["id"] and answer["short"] == figure["short"]
    # The service writes no image file: the host writes the image it gives back.
    assert not (tmp_path / "serial.png").exists()
    stamped = written(answer, tmp_path).read_bytes()
    assert figure_ids_in(stamped).ids == [(figure["id"], "the image")]
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
    assert figure_ids_in(written(svg, tmp_path, "serial.svg").read_bytes()).ids[0][0] == svg["id"]
    view = rpc(client, "debrief/open", {**WHERE, "agent": AGENT})["result"]["view"]
    assert [e["format"] for e in view["exports"]] == ["png", "svg"]


def test_find_by_file_and_by_typed_id_then_open_that_revision(client, tmp_path: Path) -> None:
    done = export(client, tmp_path)
    figure = done["figure"]
    written(done["answer"]["result"], tmp_path)
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
    mistyped = rpc(client, "debrief/find_image_source", {"id": "DBF-2ZBP-04HM-ASW0-0B"})
    assert "character wrong" in mistyped["error"]["message"]
    nothing = tmp_path / "plain.png"
    nothing.write_bytes(png())
    said = rpc(client, "debrief/find_image_source", {"file": str(nothing)})["result"]
    assert said["images"] == [] and "footer" in said["problem"]
    other = rpc(client, "debrief/figure_id", WHERE)["result"]["id"]
    fake = rpc(
        client,
        "debrief/export_image",
        {
            **WHERE,
            "id": other,
            "image": "bm90IGEgcG5n",
            "format": "png",
            "footer": True,
        },
    )
    assert "not the PNG" in fake["error"]["message"]


def read_only(config):
    stores = [s.model_copy(update={"read_only": True}) for s in config.stores]
    return config.model_copy(update={"stores": stores})


def test_a_read_only_catalogues_export_is_in_the_analysts_own_log_and_found(
    client, tmp_path: Path, config_file: Path
) -> None:
    update_config(read_only, config_file)
    answer = export(client, tmp_path)["answer"]["result"]
    assert not answer["recorded"] and answer["logged"] == "user"
    assert "read-only" in answer["note"] and "your own export log" in answer["note"]
    view = rpc(client, "debrief/open", {**WHERE, "agent": AGENT})["result"]["view"]
    assert not (view or {}).get("exports")
    # Beside the configuration: the analyst's own log, which Find source reads.
    log = json.loads((config_file.parent / "exports.json").read_text())
    assert [e["export"]["id"] for e in log["exports"]] == [answer["id"]]
    found = rpc(client, "debrief/find_image_source", {"id": answer["short"]})["result"]
    [source] = found["images"][0]["sources"]
    assert source["export"]["id"] == answer["id"] and source["export"]["file"] == "serial.png"
    shown = rpc(
        client,
        "debrief/open_revision",
        {**WHERE, "revision": answer["revision"], "id": answer["id"]},
    )["result"]
    assert shown["export"]["viewport"] == VIEW["viewport"]


def test_a_footer_finds_its_own_export(client, tmp_path: Path) -> None:
    first = export(client, tmp_path)["answer"]["result"]
    second = export(client, tmp_path, viewport={"bbox": [-4.3, 50.2, -4.1, 50.3]})["answer"]
    second = second["result"]
    # Two exports of one revision: their footers differ (the export's own symbols).
    assert first["short"] != second["short"]
    one = rpc(client, "debrief/find_image_source", {"id": second["short"]})["result"]
    assert [s["export"]["id"] for s in one["images"][0]["sources"]] == [second["id"]]


def test_an_archive_picture_that_cannot_be_read_is_skipped_and_said(client, tmp_path: Path) -> None:
    document = tmp_path / "report.docx"
    with zipfile.ZipFile(document, "w") as archive:
        archive.writestr("word/media/image1.png", png())
    data = bytearray(document.read_bytes())
    # The picture's local header and central record: marked encrypted.
    for signature, offset in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        at = data.index(signature)
        data[at + offset] |= 1
    document.write_bytes(bytes(data))
    said = rpc(client, "debrief/find_image_source", {"file": str(document)})
    assert "error" not in said, said
    assert said["result"]["skipped"] == [
        {"where": "report.docx: word/media/image1.png", "why": "the picture is encrypted"}
    ]
    assert "encrypted" in said["result"]["problem"]


def test_opened_read_only_an_interrupted_change_is_not_recovered(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    from debrief_stac.history import History

    calls = []
    monkeypatch.setattr(History, "open", lambda self: calls.append(1) or False)
    rpc(client, "debrief/open", {**WHERE, "agent": AGENT, "read_only": True})
    assert calls == []
    rpc(client, "debrief/open", {**WHERE, "agent": AGENT})
    assert calls == [1]


def test_only_an_exported_image_may_be_a_large_request(client) -> None:
    padding = "x" * (11 * 1024 * 1024)
    large = {**WHERE, "padding": padding}
    body = {"jsonrpc": "2.0", "id": 1, "method": "debrief/history", "params": large}
    refused = client.post("/mcp", content=json.dumps(body), headers=HEADERS)
    assert refused.status_code == 413
    body["method"] = "debrief/export_image"
    allowed = client.post("/mcp", content=json.dumps(body), headers=HEADERS)
    assert allowed.status_code == 200 and "error" in allowed.json()


def test_an_agents_export_with_no_map_open_is_refused(client, tmp_path: Path) -> None:
    said = rpc(
        client,
        "debrief/export_image",
        {
            **WHERE,
            "file": str(tmp_path / "serial.png"),
            "agent": {"kind": "software_agent", "name": "a"},
        },
    )
    assert "No Debrief map is open" in said["error"]["message"]
    assert not (tmp_path / "serial.png").exists()


def test_an_agents_export_is_drawn_by_the_open_map(
    config_file: Path, lab_library: str, tmp_path: Path
) -> None:
    worker = ToolWorker([lab_library], str(config_file), timeout_s=3)
    service = ToolService(worker, str(config_file))
    try:
        asked: list[dict] = []

        def host() -> None:
            # The host polls, is asked, draws (here: says what it was asked) and answers.
            for request in service.handle("debrief/host_poll", {"wait_s": 5})["requests"]:
                asked.append(request)
                service.handle(
                    "debrief/host_answer",
                    {"id": request["id"], "result": {"file": request["file"], "id": "X"}},
                )

        service.handle("debrief/host_poll", {"wait_s": 0})  # a map is open
        drawing = threading.Thread(target=host)
        drawing.start()
        target = str(tmp_path / "serial.svg")
        answer = service.handle(
            "debrief/export_image",
            {
                **WHERE,
                "file": target,
                "theme": "light",
                "agent": {"kind": "software_agent", "name": "a"},
            },
        )
        drawing.join(5)
        assert answer == {"file": target, "id": "X"}
        [request] = asked
        assert (request["kind"], request["format"], request["theme"]) == (
            "export_image",
            "svg",
            "light",
        )
        assert request["agent"]["name"] == "a" and "footer" not in request
        # The host's refusal is the agent's.
        drawing = threading.Thread(
            target=lambda: [
                service.handle("debrief/host_answer", {"id": r["id"], "problem": "Another plot."})
                for r in service.handle("debrief/host_poll", {"wait_s": 5})["requests"]
            ]
        )
        drawing.start()
        with pytest.raises(RpcError, match="Another plot"):
            service.handle("debrief/export_image", {**WHERE, "file": target})
        drawing.join(5)
    finally:
        worker.close()


def test_the_methods_vs_code_allows_on_a_revision_shown_read_only_are_pythons() -> None:
    """VS Code refuses, on a plot shown read-only, every method not in leaves_plot: the
    lists it holds are these, and these are Python's (expert panel, 16 Oct 2026)."""
    from debrief_tools import service

    root = Path(__file__).resolve().parents[3]
    table = json.loads((root / "schemas" / "vectors" / "service-methods.json").read_text())
    changes = set(service.WRITING_METHODS) | {"tools/call"}
    assert set(table["changes_plot"]) == changes
    assert set(table["leaves_plot"]) == set(service.KNOWN_METHODS) - changes
