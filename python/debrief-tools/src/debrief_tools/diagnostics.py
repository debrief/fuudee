"""Local logs with no plot data in them (NFR-14).

Logs record errors and tool runs so they can be shared for support or an
accreditation review without being read first. So:

- nothing free-text is logged. Debrief's own lines are fixed words and codes
  (a tool's name, how a run ended); an exception is logged as its type, a
  keyed hash of its message and its frames as ``file.py:line:function``,
  never the message or source lines; another library's message is logged
  only as its logger's name and a hash;
- a tool run is logged as its name, version, the names and kinds of its
  parameters (never their values), how many features were selected, how it
  ended and how long it took;
- every line still passes through redact() as a second line of defence:
  quoted text and file paths are replaced by a short keyed hash, so lines
  about the same thing can be matched up but not guessed from a list of
  likely names.

Hashes are HMAC-SHA256 under a 32-byte key made once per install and kept
beside the user's configuration (``log-key``), never in the log folder, so a
shared log can't be checked against a list of guesses. DEBRIEF_LOG_KEY (hex)
overrides it; the extension passes its key to the service that way.

The TypeScript extension applies the same rules (schemas/vectors/redaction.json).

Limits of redact(), which only backs up the rule above: a Windows or UNC path
may have spaces in its folder names, and in its last part when the path runs
to ": " or the end of the line, so text after such a path on the same line is
hashed with it; a POSIX path ends at the first space.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import secrets
import sys
import traceback
from collections.abc import Mapping
from logging.handlers import RotatingFileHandler
from pathlib import Path, PurePath, PurePosixPath, PureWindowsPath
from typing import Any

from debrief_config import config_path

LOG_FILE_BYTES = 1_000_000
LOG_FILES_KEPT = 3
KEY_FILE = "log-key"
KEY_BYTES = 32

# --- The hashing key (once per install) --------------------------------------------
_key: bytes | None = None


def key_file(env: Mapping[str, str] | None = None) -> Path:
    """Where the install's log key lives: beside the configuration, not with the logs."""
    return Path(config_path(env)).parent / KEY_FILE


def _parse_key(text: str) -> bytes | None:
    text = text.strip()
    if re.fullmatch(r"[0-9a-fA-F]{64}", text):
        return bytes.fromhex(text)
    return None


def load_key(env: Mapping[str, str] | None = None, file: Path | None = None) -> bytes:
    """The install's log key: DEBRIEF_LOG_KEY, else the key file, made (0600) if missing.

    If no key can be read or kept, a key for this process alone is used:
    hashes then can't be matched across runs, but logging still works.
    """
    env = os.environ if env is None else env
    from_env = _parse_key(env.get("DEBRIEF_LOG_KEY", ""))
    if from_env:
        return from_env
    file = key_file(env) if file is None else file
    try:
        return _parse_key(file.read_text(encoding="ascii")) or _make_key(file, replace=True)
    except FileNotFoundError:
        pass
    except (OSError, UnicodeDecodeError):
        return secrets.token_bytes(KEY_BYTES)
    try:
        return _make_key(file, replace=False)
    except FileExistsError:  # made meanwhile by another process: use theirs
        try:
            return _parse_key(file.read_text(encoding="ascii")) or secrets.token_bytes(KEY_BYTES)
        except OSError:
            return secrets.token_bytes(KEY_BYTES)
    except OSError:
        return secrets.token_bytes(KEY_BYTES)


def _make_key(file: Path, *, replace: bool) -> bytes:
    key = secrets.token_bytes(KEY_BYTES)
    try:
        file.parent.mkdir(parents=True, exist_ok=True)
        if replace:
            file.unlink(missing_ok=True)
        descriptor = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise
    except OSError:
        return key
    with os.fdopen(descriptor, "w", encoding="ascii") as out:
        out.write(key.hex())
    return key


def set_key(key: bytes | None) -> None:
    """Use this key for hashing (None: load the install's key when next needed)."""
    global _key
    _key = key


def _current_key() -> bytes:
    global _key
    if _key is None:
        _key = load_key()
    return _key


def keyed_hash(text: str, key: bytes | None = None) -> str:
    """The first 8 hex digits of HMAC-SHA256(key, text)."""
    key = _current_key() if key is None else key
    return hmac.new(key, text.encode("utf-8"), hashlib.sha256).hexdigest()[:8]


# --- Redaction, the second line of defence ---------------------------------------------
# A path runs to the next space or quote, without trailing punctuation.
_REST = r"(?:[^\s'\"]*[^\s'\":;,.!?)\]])?"
# Windows folder names may hold spaces; the last part may too when the path runs to ": " or EOL.
_WIN_SEG = r"[^\\\n:*?\"<>|]"
_WIN_TAIL = rf"(?:(?:{_WIN_SEG}*\\)*(?:{_WIN_SEG}*(?=:\s|:$|\n|$)|{_REST}))"
# Already redacted: left as it is, so redacting twice changes nothing.
_DONE = r"(?!<(?:text|path):[0-9a-f]{8}>)"
_SINGLE = r"(?:[^'\n]|(?<=\w)'(?=\w))*"  # an apostrophe inside a word stays inside the quotes
_CURLY_SINGLE = r"(?:[^’\n]|(?<=\w)’(?=\w))*"
_RULES: list[tuple[re.Pattern[str], str, str, str]] = [
    # (pattern, kind, before, after): the match, or group 1 if there is one, is hashed.
    (re.compile(r"\bfile://" + _REST, re.ASCII), "path", "", ""),
    (re.compile(rf"(?<!\w)'{_DONE}({_SINGLE})'(?!\w)", re.ASCII), "text", "'", "'"),
    (re.compile(rf'"{_DONE}([^"\n]*)"', re.ASCII), "text", '"', '"'),
    (re.compile(rf"(?<!\w)‘{_DONE}({_CURLY_SINGLE})’(?!\w)", re.ASCII), "text", "‘", "’"),
    (re.compile(rf"“{_DONE}([^”\n]*)”", re.ASCII), "text", "“", "”"),
    (re.compile(r"\\\\[^\s'\"\\]+\\" + _WIN_TAIL, re.ASCII), "path", "", ""),
    (re.compile(r"(?<!\w)[A-Za-z]:\\" + _WIN_TAIL, re.ASCII), "path", "", ""),
    (re.compile(r"(?<!\w)[A-Za-z]:/" + _REST, re.ASCII), "path", "", ""),
    (re.compile(r"(?<![\w.:/<])/[^\s'\"/]+/" + _REST, re.ASCII), "path", "", ""),
]


def redact(text: str, key: bytes | None = None) -> str:
    """The text with quoted text, file paths and file URIs replaced by short keyed hashes."""
    key = _current_key() if key is None else key
    for pattern, kind, before, after in _RULES:

        def replace(m: re.Match[str], kind: str = kind, before: str = before, after: str = after):
            inner = m.group(1) if m.re.groups else m.group(0)
            return f"{before}<{kind}:{keyed_hash(inner, key)}>{after}"

        text = pattern.sub(replace, text)
    return text


def _basename(filename: str) -> str:
    return re.split(r"[\\/]", filename)[-1]


def describe_exception(error: BaseException, key: bytes | None = None, _depth: int = 0) -> str:
    """An exception as its type, a keyed hash of its message and its frames, nothing else.

    Frames are ``file.py:line:function``: no folders, no source lines, no message.
    """
    try:
        message = str(error)
    except Exception:  # noqa: BLE001 - an exception whose message itself fails
        message = ""
    lines = [f"{type(error).__name__} message=<text:{keyed_hash(message, key)}>"]
    for frame in traceback.extract_tb(error.__traceback__):
        lines.append(f"  at {_basename(frame.filename)}:{frame.lineno}:{frame.name}")
    cause = error.__cause__ or (None if error.__suppress_context__ else error.__context__)
    if cause is not None and _depth < 5:
        lines.append("caused by " + describe_exception(cause, key, _depth + 1))
    return "\n".join(lines)


# --- Where logs go ---------------------------------------------------------------------
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


OWN_LOGGER = "debrief_tools"
# Libraries whose messages would otherwise reach the log: quietened, and redacted like the rest.
QUIET_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access", "uvicorn.asgi")


def _message(record: logging.LogRecord) -> str:
    try:
        return record.getMessage()
    except Exception:  # noqa: BLE001 - a message whose arguments don't fit
        return str(record.msg)


class RedactingFormatter(logging.Formatter):
    """Debrief's own lines, redacted; others' lines as their logger name and a hash.

    Exceptions are their type, hashed message and frames (describe_exception).
    """

    def format(self, record: logging.LogRecord) -> str:
        if not (record.name == OWN_LOGGER or record.name.startswith(OWN_LOGGER + ".")):
            # Another library's message is free text: never write it.
            record = logging.makeLogRecord(record.__dict__)
            record.msg = f"{record.name} message=<text:{keyed_hash(_message(record))}>"
            record.args = None
        record.exc_text = None  # never a cached traceback another formatter wrote
        return redact(super().format(record))

    def formatException(self, ei: Any) -> str:  # noqa: N802 - logging's name
        error = ei[1]
        return (
            describe_exception(error) if error is not None else str(getattr(ei[0], "__name__", ""))
        )

    def formatStack(self, stack_info: str) -> str:  # noqa: N802 - logging's name
        return "(stack left out: it holds source lines)"


def configure(name: str, directory: Path | None = None, *, to_stderr: bool = True) -> Path | None:
    """Log Debrief's lines, redacted, to <log dir>/<name>.log and to stderr.

    Everything logged in the process goes through the same formatter: library
    loggers (uvicorn's included) are set to WARNING and keep no handlers of
    their own, and Python warnings are captured. Returns the log file, or None
    if the folder can't be written: logging must never stop Debrief working.
    """
    root = logging.getLogger()
    own = logging.getLogger(OWN_LOGGER)
    for logger in (root, own):
        for handler in list(logger.handlers):
            if getattr(handler, "_debrief", False) or logger is own:
                logger.removeHandler(handler)
    own.setLevel(logging.INFO)
    own.propagate = True
    for quiet in QUIET_LOGGERS:
        logger = logging.getLogger(quiet)
        logger.setLevel(logging.WARNING)
        logger.handlers.clear()
        logger.propagate = True
    logging.captureWarnings(True)
    if to_stderr:
        stderr = logging.StreamHandler()
        stderr.setFormatter(RedactingFormatter("%(levelname)s %(message)s"))
        stderr._debrief = True  # type: ignore[attr-defined]
        root.addHandler(stderr)
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
    file.setFormatter(RedactingFormatter("%(asctime)s %(levelname)s %(process)d %(message)s"))
    file._debrief = True  # type: ignore[attr-defined]
    root.addHandler(file)
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


# How a tool run ended, in the same words in the service's and the extension's logs.
OUTCOMES = (
    "changed",
    "unchanged",
    "refused",
    "failed",
    "conflict",
    "timed_out",
    "crashed",
    "saved_as_new_plot",
    "needs_newer_schema_confirmed",
)
