"""Logs hold no plot data (NFR-14): no free text, keyed hashes, redaction, what a tool run logs."""

import json
import logging
import os
import stat
import sys
import warnings
from pathlib import Path, PurePosixPath, PureWindowsPath

import pytest

from debrief_tools import diagnostics

ROOT = Path(__file__).resolve().parents[3]
VECTORS = json.loads((ROOT / "schemas" / "vectors" / "redaction.json").read_text())
KEY = bytes.fromhex(VECTORS["key"])


@pytest.fixture
def log_file(tmp_path: Path):
    """Logging set up as the service sets it up, into a file read back by the test."""
    file = diagnostics.configure("test", tmp_path, to_stderr=False)
    assert file is not None

    def read() -> str:
        for handler in logging.getLogger().handlers:
            handler.flush()
        return file.read_text()

    yield read
    root = logging.getLogger()
    for handler in list(root.handlers):
        if getattr(handler, "_debrief", False):
            root.removeHandler(handler)
            handler.close()
    logging.captureWarnings(False)


@pytest.mark.parametrize("case", VECTORS["cases"], ids=[c["name"] for c in VECTORS["cases"]])
def test_redaction_matches_the_shared_vectors(case: dict) -> None:
    assert diagnostics.redact(case["line"], KEY) == case["expected"]


def test_redacting_twice_changes_nothing() -> None:
    for case in VECTORS["cases"]:
        assert diagnostics.redact(case["expected"], KEY) == case["expected"]


def test_hashes_are_keyed() -> None:
    other = bytes(32)
    assert diagnostics.keyed_hash("NELSON", KEY) != diagnostics.keyed_hash("NELSON", other)
    assert len(diagnostics.keyed_hash("NELSON", KEY)) == 8


def test_the_key_is_made_once_beside_the_configuration(tmp_path: Path) -> None:
    env = {"DEBRIEF_CONFIG": str(tmp_path / "config" / "config.json")}
    file = diagnostics.key_file(env)
    assert file == tmp_path / "config" / "log-key"  # never in the log folder
    first = diagnostics.load_key(env)
    assert len(first) == 32 and file.read_text() == first.hex()
    if sys.platform != "win32":
        assert stat.S_IMODE(os.stat(file).st_mode) == 0o600
    assert diagnostics.load_key(env) == first
    file.write_text("not a key")
    assert diagnostics.load_key(env) != first and len(file.read_text()) == 64
    assert diagnostics.load_key({**env, "DEBRIEF_LOG_KEY": VECTORS["key"]}) == KEY


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


def test_an_exception_is_logged_as_its_type_hashed_message_and_frames(log_file) -> None:
    log = logging.getLogger("debrief_tools")
    try:
        # Unquoted names, as a tool's own message gives them: redaction alone can't catch these.
        raise ValueError("NELSON and LATE do not overlap in time")
    except ValueError:
        log.exception("tool_error tool=core.closest_approach")
    text = log_file()
    assert "tool_error tool=core.closest_approach" in text
    assert "ValueError message=<text:" in text
    assert f"test_diagnostics.py:{_line_of('raise ValueError')}:" in text
    assert "NELSON" not in text and "LATE" not in text
    assert "raise ValueError" not in text  # no source lines
    assert str(Path(__file__).parent) not in text  # no folders


def test_a_chained_exception_keeps_only_types_and_hashes() -> None:
    try:
        try:
            raise KeyError("track-nelson")
        except KeyError as inner:
            raise RuntimeError("could not read NELSON") from inner
    except RuntimeError as error:
        described = diagnostics.describe_exception(error, KEY)
    assert described.startswith("RuntimeError message=<text:")
    assert "caused by KeyError message=<text:" in described
    assert "NELSON" not in described and "nelson" not in described


def test_other_libraries_messages_are_never_written(log_file) -> None:
    logging.getLogger("uvicorn.error").warning("Invalid HTTP request from NELSON")
    logging.getLogger("uvicorn.access").warning("GET /plots/NELSON 404")
    logging.getLogger("uvicorn.error").info("Started server process")  # quietened: WARNING only
    logging.getLogger("somelibrary").error("could not parse LATE")
    with warnings.catch_warnings():
        warnings.simplefilter("always")
        logging.captureWarnings(True)
        warnings.warn("track BLUE has a gap", UserWarning, stacklevel=1)
    text = log_file()
    assert "uvicorn.error message=<text:" in text and "somelibrary message=<text:" in text
    assert "py.warnings message=<text:" in text
    assert "Started server process" not in text
    for name in ("NELSON", "LATE", "BLUE", "Invalid HTTP"):
        assert name not in text


def test_the_log_file_is_redacted(log_file) -> None:
    logging.getLogger("debrief_tools").warning(
        "copy %s to %s", "/home/analyst/exercise/plot.geojson", "'NELSON'"
    )
    text = log_file()
    assert "NELSON" not in text and "/home/analyst" not in text


def test_logging_never_stops_debrief(tmp_path: Path) -> None:
    blocked = tmp_path / "file"
    blocked.write_text("")
    assert diagnostics.configure("test", blocked / "logs", to_stderr=False) is None


def _line_of(text: str) -> int:
    lines = Path(__file__).read_text().splitlines()
    return next(i for i, line in enumerate(lines, 1) if text in line and "_line_of" not in line)
