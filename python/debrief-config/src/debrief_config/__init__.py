"""Debrief per-user configuration: the stores an analyst knows about (SEC-06).

One JSON file per user account, in the platform's usual place for
per-user settings, read and changed by the Python services and the VS Code
extension alike. Both sides find the file, normalise locations and lock
changes by the same rules, held to the vectors in schemas/vectors/.
"""

from debrief_config.config import (
    DEFAULT_TMA_ERROR_CUT_OFF,
    TRACK_IMPORT_MODES,
    ConfigError,
    add_store,
    config_path,
    load_config,
    narrative_answers,
    normalise_location,
    remove_store,
    same_location,
    tma_error_cut_off,
    track_import_mode,
    update_config,
    with_narrative_answers,
    with_tma_error_cut_off,
    with_track_import_mode,
    without_narrative_answers,
)

__all__ = [
    "DEFAULT_TMA_ERROR_CUT_OFF",
    "TRACK_IMPORT_MODES",
    "ConfigError",
    "add_store",
    "config_path",
    "load_config",
    "narrative_answers",
    "normalise_location",
    "remove_store",
    "same_location",
    "tma_error_cut_off",
    "track_import_mode",
    "update_config",
    "with_narrative_answers",
    "with_tma_error_cut_off",
    "with_track_import_mode",
    "without_narrative_answers",
]
