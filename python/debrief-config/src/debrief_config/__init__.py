"""Debrief per-user configuration: the stores an analyst knows about (SEC-06).

One JSON file per user account, in the platform's usual place for
per-user settings, read and changed by the Python services and the VS Code
extension alike. Both sides find the file, normalise locations and lock
changes by the same rules, held to the vectors in schemas/vectors/.
"""

from debrief_config.config import (
    ConfigError,
    add_store,
    config_path,
    load_config,
    normalise_location,
    remove_store,
    same_location,
    update_config,
)

__all__ = [
    "ConfigError",
    "add_store",
    "config_path",
    "load_config",
    "normalise_location",
    "remove_store",
    "same_location",
    "update_config",
]
