"""The service's JSON-RPC errors: one code for each thing a caller does next, whatever
the method. Retry (the store busy, or not readable or writable), re-open (the history
refused or is damaged), or correct the request; the message the same whichever."""

import json
import os
import socket
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from debrief_stac import (
    CatalogueError,
    Conflict,
    HistoryError,
    NewerSchemaError,
    StoreBusy,
    store,
)
from debrief_tools import rpc
from debrief_tools.service import ToolService, build_app
from debrief_tools.worker import ToolWorker

TOKEN = "t" * 40
PORT = 43212
HEADERS = {"authorization": f"Bearer {TOKEN}", "host": f"127.0.0.1:{PORT}"}
AGENT = {"kind": "person", "name": "analyst"}
WHERE = {"store": "exercise", "item": "serial", "agent": AGENT}


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (Conflict("The plot changed.", mergeable=False), rpc.CONFLICT),
        (HistoryError("This plot's history does not match its content."), rpc.REOPEN),
        (NewerSchemaError("Newer."), rpc.NEWER_SCHEMA),
        (StoreBusy("Another Debrief process is saving this plot."), rpc.RETRY),
        (OSError(28, "No space left on device"), rpc.RETRY),
        (PermissionError(13, "Permission denied"), rpc.RETRY),
        (FileNotFoundError(2, "No such file"), rpc.INVALID_PARAMS),
        (CatalogueError("There is no feature x."), rpc.INVALID_PARAMS),
        (ValueError("window must be odd"), rpc.INVALID_PARAMS),
    ],
    ids=lambda v: type(v).__name__ if isinstance(v, Exception) else str(v),
)
def test_each_error_has_its_code_and_keeps_its_message(error: Exception, code: int) -> None:
    mapped = rpc.rpc_error(error)
    assert (mapped.code, str(mapped)) == (code, str(error))
    assert str(rpc.rpc_error(error, "serial.rep could not be read")) == (
        "serial.rep could not be read"
    )
    assert isinstance(error, rpc.MAPPED)


def test_the_new_codes_are_server_errors_of_their_own() -> None:
    codes = [rpc.CONFLICT, rpc.NEWER_SCHEMA, rpc.NEEDS_CONFIRMATION, rpc.RETRY, rpc.REOPEN]
    assert len(set(codes)) == len(codes)
    assert all(-32099 <= c <= -32000 for c in codes)


def test_the_codes_are_the_ones_the_extension_names() -> None:
    """vscode/src/service.ts names each code it branches on or shows; they are these."""
    root = Path(__file__).resolve().parents[3]
    source = (root / "vscode" / "src" / "service.ts").read_text()
    for name in ("CONFLICT", "NEWER_SCHEMA", "NEEDS_CONFIRMATION", "RETRY", "REOPEN"):
        assert f"export const {name} = {getattr(rpc, name)};" in source, name


@pytest.fixture
def client(config_file: Path, lab_library: str):
    worker = ToolWorker([lab_library], str(config_file), timeout_s=3)
    app = build_app(ToolService(worker, str(config_file)), TOKEN, PORT)
    yield TestClient(app, base_url=f"http://127.0.0.1:{PORT}")
    worker.close()


def call(client: TestClient, method: str, params: dict) -> dict:
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    return client.post("/mcp", content=json.dumps(body), headers=HEADERS).json()


def test_a_busy_store_a_refusing_history_and_a_bad_request_are_told_apart(
    client, catalogue, monkeypatch: pytest.MonkeyPatch
) -> None:
    colour = {**WHERE, "features": ["track-nelson"], "colour": "#00a000"}
    # Another process (alive, so its lock is never taken over) is saving the plot.
    lock = Path(catalogue.store.root) / "serial" / ".lock"
    lock.write_text(f"{socket.gethostname()} {os.getpid()}\n")
    monkeypatch.setattr(store, "LOCK_WAIT_S", 0.2)
    busy = call(client, "debrief/set_colour", colour)["error"]
    assert busy == {
        "code": rpc.RETRY,
        "message": "Another Debrief process is saving this plot. Try again in a moment.",
    }
    lock.unlink()
    assert call(client, "debrief/set_colour", colour)["result"]["changed"]
    # Nothing to redo: the history is not where the caller thought; open it again.
    refused = call(client, "debrief/redo", WHERE)["error"]
    assert refused == {"code": rpc.REOPEN, "message": "There is nothing to redo."}
    # A bad parameter stays INVALID_PARAMS.
    bad = call(client, "debrief/set_colour", {**colour, "colour": "green"})["error"]
    assert bad["code"] == rpc.INVALID_PARAMS
