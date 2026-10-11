"""Local logs with no plot data in them (NFR-14).

Logs record errors and tool runs so they can be shared for support or an
accreditation review without being read first. So:

- a tool run is logged as its name, version, the names and kinds of its
  parameters (never their values), how many features were selected, how it
  ended and how long it took;
- every line, including tracebacks, passes through redact(): quoted text
  (feature names, ids, values in messages) and file paths are replaced by a
  short hash, so lines about the same thing can still be matched up.

The TypeScript extension applies the same rules (schemas/vectors/redaction.json).
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import sys
from collections.abc import Mapping
from logging.handlers import RotatingFileHandler
from pathlib import Path, PurePath, PurePosixPath, PureWindowsPath
from typing import Any

LOG_FILE_BYTES = 1_000_000
LOG_FILES_KEPT = 3

# A path runs to the next space or quote, without trailing punctuation.
_REST = r"(?:[^\s'\"]*[^\s'\":;,.!?)\]])?"
_RULES = [
    # Text already redacted is left as it is, so redacting twice changes nothing.
    (re.compile(r"(?<!\w)'(?!<text:)([^'\n]*)'(?!\w)"), lambda m: f"'<text:{_hash(m.group(1))}>'"),
    (re.compile(r'"(?!<text:)([^"\n]*)"'), lambda m: f'"<text:{_hash(m.group(1))}>"'),
    (re.compile(r"\\\\[^\s'\"\\]+\\" + _REST), lambda m: f"<path:{_hash(m.group(0))}>"),
    (re.compile(r"(?<!\w)[A-Za-z]:[\\/]" + _REST), lambda m: f"<path:{_hash(m.group(0))}>"),
    (re.compile(r"(?<![\w.:/<])/[^\s'\"/]+/" + _REST), lambda m: f"<path:{_hash(m.group(0))}>"),
]


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def redact(text: str) -> str:
    """The text with quoted text and file paths replaced by short hashes."""
    for pattern, replace in _RULES:
        text = pattern.sub(replace, text)
    return text


def log_dir(
    env: Mapping[str, str] | None = None, platform: str | None = None, home: str | None = None
) -> PurePath:
    """Where this user's Debrief logs go. DEBRIEF_LOG_DIR overrides the default."""
    env = os.environ if env is None else env
    platform = sys.platform if platform is None else platform
    home = str(Path.home()) if home is None else home
    pure = PureWindowsPath if platform == "win32" else PurePosixPath
    if env.get("DEBRIEF_LOG_DIR"):
        return pure(env["DEBRIEF_LOG_DIR"])
    if platform == "win32":
        return pure(env.get("LOCALAPPDATA") or pure(home, "AppData", "Local"), "Debrief", "Logs")
    if platform == "darwin":
        return pure(home, "Library", "Logs", "Debrief")
    state = env.get("XDG_STATE_HOME", "")
    return pure(state if pure(state).is_absolute() else pure(home, ".local", "state"), "debrief")


class RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


def configure(name: str, directory: Path | None = None, *, to_stderr: bool = True) -> Path | None:
    """Log the debrief_tools logger to <log dir>/<name>.log, redacted, and to stderr.

    Returns the log file, or None if the folder can't be written: logging must
    never stop Debrief working.
    """
    logger = logging.getLogger("debrief_tools")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    formatter = RedactingFormatter("%(asctime)s %(levelname)s %(process)d %(message)s")
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
    if to_stderr:
        stderr = logging.StreamHandler()
        stderr.setFormatter(RedactingFormatter("%(levelname)s %(message)s"))
        logger.addHandler(stderr)
    folder = Path(directory if directory is not None else log_dir())
    try:
        folder.mkdir(parents=True, exist_ok=True)
        file = RotatingFileHandler(
            folder / f"{name}.log",
            maxBytes=LOG_FILE_BYTES,
            backupCount=LOG_FILES_KEPT,
            encoding="utf-8",
        )
    except OSError:
        return None
    file.setFormatter(formatter)
    logger.addHandler(file)
    return folder / f"{name}.log"


def tool_run(
    *,
    tool: str,
    version: str | None,
    parameter_kinds: Mapping[str, str],
    supplied: Mapping[str, Any] | None,
    selected: int,
    outcome: str,
    seconds: float,
) -> str:
    """The log line for one tool run: names and kinds of parameters, never values.

    Only declared parameter names are written; anything else supplied is counted.
    """
    names = sorted((supplied or {}).keys())
    known = [f"{n}:{parameter_kinds[n]}" for n in names if n in parameter_kinds]
    unknown = len(names) - len(known)
    return (
        f"tool_run tool={tool} version={version or '-'} "
        f"parameters={','.join(known) or '-'}"
        + (f" undeclared_parameters={unknown}" if unknown else "")
        + f" selected={selected} outcome={outcome} ms={round(seconds * 1000)}"
    )
