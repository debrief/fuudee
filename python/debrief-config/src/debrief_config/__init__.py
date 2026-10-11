"""Debrief per-user configuration: the stores an analyst knows about (SEC-06).

One JSON file per user account, in the platform's usual place for
per-user settings, read and written by the Python services and the VS Code
extension alike. Both sides find the file by the rules in
schemas/vectors/config-paths.json and validate it against the same schema.
"""

from debrief_config.config import (
    ConfigError,
    add_store,
    config_path,
    load_config,
    remove_store,
    save_config,
)

__all__ = [
    "ConfigError",
    "add_store",
    "config_path",
    "load_config",
    "remove_store",
    "save_config",
]
