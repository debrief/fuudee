"""Finding, reading and writing the per-user configuration file."""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from collections.abc import Mapping
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


class ConfigError(ValueError):
    """The configuration file cannot be read or must not be written."""


def config_path(
    env: Mapping[str, str] | None = None,
    platform: str | None = None,
    home: str | None = None,
) -> PurePath:
    """Where this user's configuration lives. DEBRIEF_CONFIG overrides the default."""
    env = os.environ if env is None else env
    platform = sys.platform if platform is None else platform
    home = str(Path.home()) if home is None else home
    pure = PureWindowsPath if platform == "win32" else PurePosixPath

    if env.get("DEBRIEF_CONFIG"):
        return pure(env["DEBRIEF_CONFIG"])
    if platform == "win32":
        base = env.get("APPDATA") or str(pure(home, "AppData", "Roaming"))
        return pure(base, "Debrief", FILE_NAME)
    if platform == "darwin":
        return pure(home, "Library", "Application Support", "Debrief", FILE_NAME)
    xdg = env.get("XDG_CONFIG_HOME", "")
    base = xdg if pure(xdg).is_absolute() else str(pure(home, ".config"))
    return pure(base, "debrief", FILE_NAME)


def _empty() -> models.UserConfig:
    return models.UserConfig(config_version=CONFIG_VERSION, stores=[])


def _check_version(text: str, path: Path) -> None:
    """Refuse a file from a newer Debrief before validating it, with a message that says so."""
    try:
        version = json.loads(text).get("config_version")
    except (json.JSONDecodeError, AttributeError):
        return  # validation reports it
    if isinstance(version, int) and version > CONFIG_VERSION:
        raise ConfigError(
            f"{path} was written by a newer version of Debrief (configuration version "
            f"{version}; this version understands {CONFIG_VERSION}). Update Debrief, or "
            "point DEBRIEF_CONFIG at another file."
        )


def load_config(path: Path | None = None) -> models.UserConfig:
    """The user's configuration. A missing file is an empty configuration."""
    path = Path(path if path is not None else config_path())
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return _empty()
    _check_version(text, path)
    try:
        return load_document(DocumentKind.USER_CONFIG, text)
    except DocumentValidationError as error:
        raise ConfigError(f"{path} is not a valid Debrief configuration: {error}") from error


def save_config(config: models.UserConfig, path: Path | None = None) -> None:
    """Write the configuration atomically. Never overwrites a newer Debrief's file."""
    path = Path(path if path is not None else config_path())
    if path.exists():
        _check_version(path.read_text(encoding="utf-8"), path)
    text = dump_document(DocumentKind.USER_CONFIG, config)  # validates
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


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
    location: Path | str,
    protection_level: str | None = None,
    read_only: bool | None = None,
) -> tuple[models.UserConfig, models.KnownStore]:
    """A copy of the configuration with one more file store, and that store.

    The id comes from the title. A store already listed at the same location
    is not added twice: the existing one is returned unchanged.
    """
    location = str(Path(location).resolve())
    for store in config.stores:
        if store.location == location:
            return config, store
    store = models.KnownStore(
        id=_store_id(title, {s.id for s in config.stores}),
        title=title,
        kind="file",
        location=location,
        protection_level=protection_level,
        read_only=read_only,
    )
    return config.model_copy(update={"stores": [*config.stores, store]}), store


def remove_store(config: models.UserConfig, store_id: str) -> models.UserConfig:
    """A copy of the configuration without the named store. The store's files are untouched."""
    if not any(s.id == store_id for s in config.stores):
        raise ConfigError(f"No store with id {store_id!r}")
    return config.model_copy(update={"stores": [s for s in config.stores if s.id != store_id]})
