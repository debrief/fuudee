"""Logs hold no plot data (NFR-14): redaction, and what a tool run logs."""

import json
import logging
from pathlib import Path, PurePosixPath, PureWindowsPath

import pytest

from debrief_tools import diagnostics

ROOT = Path(__file__).resolve().parents[3]
VECTORS = json.loads((ROOT / "schemas" / "vectors" / "redaction.json").read_text())["cases"]


@pytest.mark.parametrize("case", VECTORS, ids=[c["name"] for c in VECTORS])
def test_redaction_matches_the_shared_vectors(case: dict) -> None:
    assert diagnostics.redact(case["line"]) == case["expected"]


@pytest.mark.parametrize(
    ("platform", "env", "expected"),
    [
        ("linux", {}, PurePosixPath("/home/a/.local/state/debrief")),
        ("linux", {"XDG_STATE_HOME": "/srv/state"}, PurePosixPath("/srv/state/debrief")),
        ("darwin", {}, PurePosixPath("/home/a/Library/Logs/Debrief")),
        (
            "win32",
            {"LOCALAPPDATA": "C:\\Users\\a\\AppData\\Local"},
            PureWindowsPath("C:\\Users\\a\\AppData\\Local\\Debrief\\Logs"),
        ),
        ("linux", {"DEBRIEF_LOG_DIR": "/var/log/debrief"}, PurePosixPath("/var/log/debrief")),
    ],
)
def test_log_folder(platform: str, env: dict, expected) -> None:
    assert diagnostics.log_dir(env, platform, "/home/a") == expected


def test_a_tool_run_logs_parameter_names_and_kinds_never_values() -> None:
    line = diagnostics.tool_run(
        tool="core.add_note",
        version="0.0.2",
        parameter_kinds={"text": "string", "at": "time"},
        supplied={"text": "Contact lost near NELSON", "at": "1995-12-12T05:00:00Z", "x": 1},
        selected=2,
        outcome="changed",
        seconds=0.0412,
    )
    assert line == (
        "tool_run tool=core.add_note version=0.0.2 parameters=at:time,text:string "
        "undeclared_parameters=1 selected=2 outcome=changed ms=41"
    )


def test_the_log_file_is_redacted_tracebacks_included(tmp_path: Path) -> None:
    file = diagnostics.configure("test", tmp_path, to_stderr=False)
    log = logging.getLogger("debrief_tools")
    try:
        raise ValueError("no track 'NELSON' in /home/analyst/exercise/plot.geojson")
    except ValueError:
        log.exception("Reading the plot failed")
    for handler in log.handlers:
        handler.flush()
    text = file.read_text()
    assert "Reading the plot failed" in text and "ValueError" in text
    assert "NELSON" not in text and "/home/analyst" not in text


def test_logging_never_stops_debrief(tmp_path: Path) -> None:
    blocked = tmp_path / "file"
    blocked.write_text("")
    assert diagnostics.configure("test", blocked / "logs", to_stderr=False) is None
