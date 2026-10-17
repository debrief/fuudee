"""The analyst's own export log: exports their plots could not keep (SUB-25).

An image exported from a plot is recorded in the plot's export log, in its island. Where
that cannot be written (a read-only catalogue, a plot with nowhere to keep one), it is
recorded here instead, in `exports.json` beside the analyst's Debrief configuration,
so every export stays traceable: Find source of image reads both (decision, product
owner, 16 Oct 2026). Changed under the configuration's lock, written atomically; the
newest EXPORT_LOG_LIMIT entries are kept, the oldest dropped first.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from debrief_config.config import ConfigError, _locked, _replace, config_path
from debrief_schemas import models

FILE_NAME = "exports.json"
EXPORT_LOG_LIMIT = 2000


def export_log_path(config: Path | str | None = None) -> Path:
    """Where the analyst's own export log is: beside their configuration file."""
    return Path(config if config is not None else config_path()).with_name(FILE_NAME)


def read_export_log(path: Path | str | None = None) -> list[models.LoggedExport]:
    """Every export in the analyst's own log, oldest first; none if it has none. An
    entry that cannot be read is passed over, never the whole log."""
    path = Path(path) if path is not None else export_log_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as error:
        raise ConfigError(f"Cannot read your export log, {path}: {error}") from error
    out = []
    for entry in raw.get("exports", []) if isinstance(raw, dict) else []:
        try:
            out.append(models.LoggedExport.model_validate(entry))
        except ValueError:
            continue
    return out


def append_export(entry: models.LoggedExport, path: Path | str | None = None) -> None:
    """Add an export to the analyst's own log, under the configuration's lock; the
    newest EXPORT_LOG_LIMIT kept. Raises ConfigError (a ValueError) if it cannot."""
    path = Path(path) if path is not None else export_log_path()
    with _locked(path):
        kept = [e for e in read_export_log(path) if e.export.id != entry.export.id]
        kept = [*kept, entry][-EXPORT_LOG_LIMIT:]
        log = models.ExportLog(exports=kept)
        text = json.dumps(log.model_dump(mode="json", exclude_none=True, by_alias=True), indent=1)
        handle, temporary = tempfile.mkstemp(
            dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
        )
        try:
            with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
                stream.write(text + "\n")
            _replace(temporary, path)
        except OSError as error:
            Path(temporary).unlink(missing_ok=True)
            raise ConfigError(f"Cannot write your export log, {path}: {error}") from error
