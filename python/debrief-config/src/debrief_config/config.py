"""Finding, reading and changing the per-user configuration file.

The extension and the Python services both change this file, so every
change goes through update_config: take a lock beside the file, re-read it,
apply the change, write a temporary file and rename it over the original.
The TypeScript side (ts/config) follows the same protocol and the same
location and normalisation rules (schemas/vectors/config-paths.json and
store-locations.json).
"""

from __future__ import annotations

import json
import ntpath
import os
import posixpath
import re
import sys
import tempfile
import time
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path, PurePath, PurePosixPath, PureWindowsPath

from debrief_schemas import (
    CONFIG_VERSION,
    DocumentKind,
    DocumentValidationError,
    dump_document,
    load_document,
    models,
)

FILE_NAME = "config.json"
LOCK_WAIT_S = 5.0
LOCK_STALE_S = 30.0
REPLACE_WAIT_S = 2.0


class ConfigError(ValueError):
    """The configuration cannot be read, or must not be written."""


def config_path(
    env: Mapping[str, str] | None = None,
    platform: str | None = None,
    home: str | None = None,
) -> PurePath:
    """Where this user's configuration lives. DEBRIEF_CONFIG overrides the default.

    On Windows this is the roaming profile, so the list follows the analyst
    between machines; locations on shares (UNC paths) roam usefully, local
    drive paths do not.
    """
    env = os.environ if env is None else env
    platform = sys.platform if platform is None else platform
    home = str(Path.home()) if home is None else home
    pure = PureWindowsPath if platform == "win32" else PurePosixPath

    if env.get("DEBRIEF_CONFIG"):
        return pure(_normalise(env["DEBRIEF_CONFIG"], platform))
    if platform == "win32":
        base = env.get("APPDATA") or str(pure(home, "AppData", "Roaming"))
        return pure(base, "Debrief", FILE_NAME)
    if platform == "darwin":
        return pure(home, "Library", "Application Support", "Debrief", FILE_NAME)
    xdg = env.get("XDG_CONFIG_HOME", "")
    base = xdg if pure(xdg).is_absolute() else str(pure(home, ".config"))
    return pure(base, "debrief", FILE_NAME)


def _normalise(location: str, platform: str) -> str:
    """Lexical normalisation only: never touches the filesystem, so an
    unreachable share cannot stall it and a mapped drive stays as written."""
    flavour = ntpath if platform == "win32" else posixpath
    normal = flavour.normpath(location)
    root = flavour.splitdrive(normal)[0] + flavour.sep
    while len(normal) > len(root) and normal.endswith(flavour.sep):
        normal = normal[:-1]
    return normal


def normalise_location(location: str, platform: str | None = None) -> str:
    """The form a store location is stored in. It must already be absolute."""
    platform = sys.platform if platform is None else platform
    pure = PureWindowsPath if platform == "win32" else PurePosixPath
    if not pure(location).is_absolute():
        raise ConfigError(f"A store location must be a full path; {location!r} is not")
    return _normalise(location, platform)


def same_location(a: str, b: str, platform: str | None = None) -> bool:
    """Whether two stored locations name the same folder. Windows paths ignore case."""
    platform = sys.platform if platform is None else platform
    if platform == "win32":
        return a.casefold() == b.casefold()
    return a == b


# The layout a file needs: 1 while it holds only stores, so an earlier Debrief still reads
# it; 2 once it remembers how tracks imported are plotted (see with_track_import_mode).
STORES_VERSION = 1
IMPORT_MODE_VERSION = 2
NARRATIVE_IMPORT_VERSION = 3
TMA_CUT_OFF_VERSION = 4


def _layout(config: models.UserConfig) -> int:
    """The layout a configuration needs: the oldest whose Debrief can read all it holds."""
    if config.tma_error_cut_off is not None:
        return TMA_CUT_OFF_VERSION
    if config.narrative_import:
        return NARRATIVE_IMPORT_VERSION
    return IMPORT_MODE_VERSION if config.track_import_mode is not None else STORES_VERSION


def _empty() -> models.UserConfig:
    return models.UserConfig(config_version=STORES_VERSION, stores=[])


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8-sig")  # tolerate the BOM Notepad writes
    except FileNotFoundError:
        return None
    except (OSError, UnicodeDecodeError) as error:
        raise ConfigError(f"Cannot read {path}: {error}") from error


def _parse(text: str, path: Path) -> models.UserConfig:
    try:
        version = json.loads(text).get("config_version")
    except (json.JSONDecodeError, AttributeError) as error:
        raise ConfigError(f"{path} is not a valid Debrief configuration: {error}") from error
    if type(version) is int and version > CONFIG_VERSION:
        raise ConfigError(
            f"{path} was written by a newer version of Debrief (configuration version "
            f"{version}; this version understands {CONFIG_VERSION}). Update Debrief, or "
            "point DEBRIEF_CONFIG at another file."
        )
    try:
        return load_document(DocumentKind.USER_CONFIG, text)
    except DocumentValidationError as error:
        raise ConfigError(f"{path} is not a valid Debrief configuration: {error}") from error


def load_config(path: Path | None = None) -> models.UserConfig:
    """The user's configuration. A missing file is an empty configuration."""
    path = Path(path if path is not None else config_path())
    text = _read(path)
    return _empty() if text is None else _parse(text, path)


@contextmanager
def _locked(path: Path) -> Iterator[None]:
    """An advisory lock shared with ts/config: a file created exclusively beside the config."""
    lock = path.with_name(path.name + ".lock")
    path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + LOCK_WAIT_S
    while True:
        try:
            handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > LOCK_STALE_S:
                    lock.unlink(missing_ok=True)  # left by a process that died
                    continue
            except FileNotFoundError:
                continue
            if time.monotonic() > deadline:
                raise ConfigError(
                    f"Another Debrief process is changing {path}. Try again in a moment."
                ) from None
            time.sleep(0.05)
        except OSError as error:
            raise ConfigError(f"Cannot lock {path}: {error}") from error
    try:
        os.write(handle, f"{os.getpid()}\n".encode())
        os.close(handle)
        yield
    finally:
        lock.unlink(missing_ok=True)


def _replace(temporary: str, path: Path) -> None:
    """Rename over the original, retrying while Windows reports it in use
    (an antivirus scan, an indexer, another process reading it)."""
    deadline = time.monotonic() + REPLACE_WAIT_S
    while True:
        try:
            os.replace(temporary, path)
            return
        except PermissionError:
            if time.monotonic() > deadline:
                raise
            time.sleep(0.05)


def _write(config: models.UserConfig, path: Path) -> None:
    text = dump_document(DocumentKind.USER_CONFIG, config)  # validates
    handle, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        _replace(temporary, path)
    except OSError as error:
        Path(temporary).unlink(missing_ok=True)
        raise ConfigError(f"Cannot write {path}: {error}") from error
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise
    if hasattr(os, "O_DIRECTORY"):  # make the rename itself durable (POSIX)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)


def update_config(
    change: Callable[[models.UserConfig], models.UserConfig], path: Path | None = None
) -> models.UserConfig:
    """Apply a change to the configuration on disk and return the result.

    The file is re-read under the lock, so a change made meanwhile by another
    process (the extension, another service) is kept, not overwritten. A file
    from a newer Debrief is never overwritten.
    """
    path = Path(path if path is not None else config_path())
    with _locked(path):
        text = _read(path)
        current = _empty() if text is None else _parse(text, path)
        changed = change(current)
        if changed != current:
            _write(changed, path)
        return changed


def _store_id(title: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:56] or "store"
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    return candidate


def add_store(
    config: models.UserConfig,
    *,
    title: str,
    location: str | PurePath,
    read_only: bool | None = None,
    platform: str | None = None,
) -> tuple[models.UserConfig, models.KnownStore]:
    """A copy of the configuration with one more file store, and that store.

    The id comes from the title. A store already listed at the same location
    is not added twice: the existing one is returned unchanged.
    """
    location = normalise_location(str(location), platform)
    for store in config.stores:
        if same_location(store.location, location, platform):
            return config, store
    store = models.KnownStore(
        id=_store_id(title, {s.id for s in config.stores}),
        title=title,
        kind="file",
        location=location,
        read_only=read_only,
    )
    return config.model_copy(update={"stores": [*config.stores, store]}), store


def remove_store(config: models.UserConfig, store_id: str) -> models.UserConfig:
    """A copy of the configuration without the named store. The store's files are untouched."""
    if not any(s.id == store_id for s in config.stores):
        raise ConfigError(f"No store with id {store_id!r}")
    return config.model_copy(update={"stores": [s for s in config.stores if s.id != store_id]})


# How tracks imported are plotted (CAP-01, decision, product owner, 14 Oct 2026): ask for
# each track, or the one choice the analyst said to use for future imports. User state,
# kept here and never in a catalogue or a plot file; importers take the mode as given.
TRACK_IMPORT_MODES = ("ask", "otg", "dr")


def track_import_mode(config: models.UserConfig) -> str:
    """ "ask" (the default, also when not set), "otg" or "dr"."""
    mode = config.track_import_mode
    if mode is None:
        return "ask"
    return str(getattr(mode, "value", mode))


def with_track_import_mode(config: models.UserConfig, mode: str) -> models.UserConfig:
    """A copy of the configuration remembering mode for future imports; "ask" clears it.
    Remembered, the file says configuration version 2, so an earlier Debrief, which cannot
    read it, says to update rather than that the file is not valid; cleared, version 1
    again, so an earlier Debrief reads it."""
    if mode not in TRACK_IMPORT_MODES:
        raise ConfigError(f"{mode!r} is not a track import mode: ask, otg or dr")
    changed = config.model_copy(update={"track_import_mode": None if mode == "ask" else mode})
    return changed.model_copy(update={"config_version": _layout(changed)})


# --- A narrative import's answers (CAP-19; product owner, 15 Oct 2026) ------------------
# The analyst's last answers for documents of a dialect, offered again next time and
# confirmed with one key. User state, kept here, never in a catalogue or a plot file:
# importers are given the answers (debrief_io.Choices), and never read this file.


def narrative_answers(
    config: models.UserConfig, dialect: str
) -> models.NarrativeImportAnswers | None:
    """The answers remembered for documents of this dialect, if any."""
    return next((a for a in config.narrative_import or [] if a.dialect == dialect), None)


def with_narrative_answers(
    config: models.UserConfig,
    dialect: str,
    *,
    skip_types: list[str] | None = None,
    within_period: bool = False,
    tracks: Mapping[str, str | None] | None = None,
) -> models.UserConfig:
    """A copy of the configuration remembering these answers for the dialect, in place
    of any before: the types not read, only within the plot's period, and the track
    (by name, or None for none) each platform was said to be."""
    answers = models.NarrativeImportAnswers(
        dialect=dialect,
        skip_types=sorted(set(skip_types or [])) or None,
        within_period=within_period,
        tracks=[
            models.PlatformTrack(platform=p, track=t) for p, t in sorted((tracks or {}).items())
        ]
        or None,
    )
    kept = [a for a in config.narrative_import or [] if a.dialect != dialect]
    changed = config.model_copy(update={"narrative_import": [*kept, answers]})
    return changed.model_copy(update={"config_version": _layout(changed)})


def without_narrative_answers(config: models.UserConfig) -> models.UserConfig:
    """A copy of the configuration forgetting every narrative import's answers."""
    changed = config.model_copy(update={"narrative_import": None})
    return changed.model_copy(update={"config_version": _layout(changed)})


# --- The Bearings view's error cut-off (CAP-21; product owner, 25 Oct 2026) -------------
# Its Error pane is green while every residual counted is within the cut-off, pink
# otherwise, as legacy Stacked Dots shaded it; legacy's default, 3 degrees. The analyst's
# preference, kept here and never in a catalogue or a plot file.
DEFAULT_TMA_ERROR_CUT_OFF = 3.0


def tma_error_cut_off(config: models.UserConfig) -> float:
    """The error cut-off, degrees: the one remembered, else 3."""
    value = config.tma_error_cut_off
    return DEFAULT_TMA_ERROR_CUT_OFF if value is None else float(value)


def with_tma_error_cut_off(config: models.UserConfig, degrees: float | None) -> models.UserConfig:
    """A copy of the configuration remembering the error cut-off; None, or the default,
    forgets it. Remembered, the file says version 4, so an earlier Debrief says to update."""
    if degrees is not None and not (0.01 <= degrees <= 180):
        raise ConfigError(f"{degrees!r} is not an error cut-off: 0.01 to 180 degrees")
    keep = None if degrees is None or degrees == DEFAULT_TMA_ERROR_CUT_OFF else float(degrees)
    changed = config.model_copy(update={"tma_error_cut_off": keep})
    return changed.model_copy(update={"config_version": _layout(changed)})
