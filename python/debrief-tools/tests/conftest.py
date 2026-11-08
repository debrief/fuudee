"""A catalogue holding one imported plot: two crossing tracks and a third far away in time."""

import os
import tempfile
from pathlib import Path

import pytest

from debrief_config import add_store, update_config
from debrief_io import import_rep
from debrief_stac import Catalogue

# Tests, and the worker processes they start, never touch the user's log folder or log key.
os.environ.setdefault("DEBRIEF_LOG_DIR", tempfile.mkdtemp(prefix="debrief-test-logs-"))
os.environ.setdefault("DEBRIEF_LOG_KEY", "ab" * 32)

REP = """\
951212 050000.000 NELSON @C 50 20 00.00 N 004 10 00.00 W 090.0 12.0 0
951212 051000.000 NELSON @C 50 20 00.00 N 004 06 52.00 W 090.0 12.0 0
951212 052000.000 NELSON @C 50 20 00.00 N 004 03 44.00 W 090.0 12.0 0
951212 050000.000 BLUE @A 50 23 00.00 N 004 05 00.00 W 180.0 12.0 0
951212 051000.000 BLUE @A 50 21 00.00 N 004 05 00.00 W 180.0 12.0 0
951212 052000.000 BLUE @A 50 19 00.00 N 004 05 00.00 W 180.0 12.0 0
951212 070000.000 LATE @F 50 00 00.00 N 004 00 00.00 W 000.0 5.0 0
951212 071000.000 LATE @F 50 01 00.00 N 004 00 00.00 W 000.0 5.0 0
"""


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "store", "ex", "Exercise", "Test")
    source = tmp_path / "serial.rep"
    source.write_text(REP)
    import_rep(catalogue, source)
    return catalogue


@pytest.fixture
def config_file(tmp_path: Path, catalogue: Catalogue) -> Path:
    path = tmp_path / "config.json"
    update_config(
        lambda c: add_store(c, title="Exercise", location=str(catalogue.store.root))[0], path
    )
    return path


MISBEHAVING = """
import os
import sys
import time

from debrief_schemas import models
from debrief_tools import tool

COMMON = dict(version="0.0.1", explanation="Test.", applies_to=["*"], min_selected=0)


@tool(name="lab.hang", title="Hang", outputs=["non_spatial"], **COMMON)
def hang(context):
    time.sleep(60)


@tool(name="lab.exit", title="Exit", outputs=["non_spatial"], **COMMON)
def leave(context):
    sys.exit(3)


@tool(name="lab.crash", title="Crash", outputs=["non_spatial"], **COMMON)
def crash(context):
    os._exit(1)


@tool(name="lab.sneaky_delete", title="Sneaky delete", outputs=["non_spatial"], **COMMON)
def sneaky_delete(context):
    return models.ToolResult(deleted_feature_ids=[context.plot.features[0].id])


@tool(name="lab.rename_selected", title="Rename selected", outputs=["non_spatial"],
      version="0.0.1", explanation="Test.", applies_to=["track"])
def rename_selected(context):
    context.selection[0].properties.name = "HACKED"
    return models.ToolResult()
"""


@pytest.fixture
def lab_library(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    folder = tmp_path / "lab"
    folder.mkdir()
    (folder / "lab_misbehaving.py").write_text(MISBEHAVING)
    monkeypatch.syspath_prepend(str(folder))
    return "lab_misbehaving"


# Every request the service answers in these tests, through any route (a JSON-RPC request,
# tools/call, the official MCP client), is checked against its method's classes in the
# schema (rpc.yaml; review, 7 Nov 2026, finding 3): its parameters and its reply. A reply
# that differs fails the test that received it. The methods whose replies were checked are
# kept, so the run can say which typed methods no test exercised (test_rpc_schema.py).
EXERCISED: set[str] = set()


@pytest.fixture(autouse=True)
def replies_match_the_schema(monkeypatch: pytest.MonkeyPatch):
    from debrief_tools.service import METHODS, ToolService

    handle = ToolService.handle
    problems: list[str] = []

    def checked(self: ToolService, method: str, params: dict) -> dict:
        reply = handle(self, method, params)
        entry = METHODS.get(method)
        if entry is not None and entry.request is not None:
            problems.extend(f"{method}: {p}" for p in entry.problems(params, reply))
            EXERCISED.add(method)
        return reply

    monkeypatch.setattr(ToolService, "handle", checked)
    yield
    assert not problems, "replies or requests that differ from rpc.yaml:\n" + "\n".join(problems)


def pytest_terminal_summary(terminalreporter) -> None:
    """Which typed methods no test in this run exercised with a successful request."""
    from debrief_tools.service import METHODS

    typed = {name for name, method in METHODS.items() if method.request is not None}
    if not EXERCISED:
        return
    missing = sorted(typed - EXERCISED)
    terminalreporter.write_line(
        f"rpc.yaml: {len(typed & EXERCISED)} of {len(typed)} typed methods' replies checked"
        + (f"; not exercised: {', '.join(missing)}" if missing else "")
    )
