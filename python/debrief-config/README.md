# debrief-config

The analyst's own configuration: the stores Debrief knows about (SEC-06). One JSON file per user account, read and written by the Python services and, through `ts/config`, by the VS Code extension.

## Where the file lives

| Platform | Location |
| --- | --- |
| Windows | `%APPDATA%\Debrief\config.json` |
| macOS | `~/Library/Application Support/Debrief/config.json` |
| Linux | `$XDG_CONFIG_HOME/debrief/config.json`, else `~/.config/debrief/config.json` |

`DEBRIEF_CONFIG` overrides all of these, for tests and for analysts who keep several setups. Both languages are held to the same cases in `schemas/vectors/config-paths.json`.

Because the file sits in the user's own profile, it inherits that account's permissions, as the services that read it do (SEC-06).

On Windows the file is in the roaming profile, so the list follows the analyst between machines. Stores on shares should be added by their UNC path (`\\server\share\...`), which means the same thing on every machine; a drive letter may not. Organisations can point every user at a managed file by setting `DEBRIEF_CONFIG` through Group Policy.

## The file

```json
{
  "config_version": 1,
  "stores": [
    {"id": "team-exercises", "title": "Team exercises", "kind": "file",
     "location": "\\\\fileserver\\debrief\\exercises", "read_only": true}
  ]
}
```

The schema is `UserConfig` in `schemas/linkml/config.yaml`.

- **Locations are absolute.** They can be a POSIX path, a Windows drive path or a UNC share.
- **Locations are normalised lexically.** Debrief never asks the filesystem, so an unreachable share can't stall it and a mapped drive stays as written. On Windows, two locations that differ only in case are the same store. The rules are in `schemas/vectors/store-locations.json`.
- **No protection marking.** That belongs to the catalogue itself (SEC-02), so every analyst sees the same marking, not one each typed into their own configuration.
- **`read_only` is advisory.** It hides write actions in the interface. Filesystem permissions are what actually protect the store.

## Versioning

The file carries its own `config_version`, not the data-file schema version. Configuration isn't data, so it has to survive data-file schema changes.

A Debrief that finds a newer `config_version` refuses to read the file, and never overwrites it. That way an older install can't throw away settings it doesn't understand.

## Changing the file

The extension and the Python services both change this file, possibly at the same moment, so every change goes through `update_config`:

1. take a lock: `config.json.lock`, created exclusively beside the file; a lock older than 30 seconds is from a process that died and is cleared;
2. re-read the file, so a change another process made meanwhile is kept;
3. apply the change;
4. write a temporary file, then rename it over the original. On Windows the rename is retried for up to two seconds while another process (an antivirus scan, the indexer) holds the file.

```python
from debrief_config import add_store, update_config

update_config(
    lambda config: add_store(
        config, title="Team exercises", location=r"\\server\debrief\exercises"
    )[0]
)
```

`ts/config` follows the same protocol, so the two can safely run at once. `add_store` and `remove_store` are pure: they return new configurations. Removing a store forgets it but leaves its files alone.

A byte order mark, as Notepad writes, is tolerated. Every read or write failure is a `ConfigError` naming the file.
