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

## The file

```json
{
  "config_version": 1,
  "stores": [
    {"id": "team-exercises", "title": "Team exercises", "kind": "file",
     "location": "\\\\fileserver\\debrief\\exercises", "protection_level": "OFFICIAL", "read_only": true}
  ]
}
```

The schema is `UserConfig` in `schemas/linkml/config.yaml`.

- **Locations are absolute.** They can be a POSIX path, a Windows drive path or a UNC share.
- **The protection level is a label.** It is shown to the analyst, never interpreted: the store's folder decides who can see it (SEC-01, SEC-02).
- **`read_only` is advisory.** It hides write actions in the interface. Filesystem permissions are what actually protect the store.

## Versioning

The file carries its own `config_version`, not the data-file schema version. Configuration isn't data, so it has to survive data-file schema changes.

A Debrief that finds a newer `config_version` refuses to read the file, and never overwrites it. That way an older install can't throw away settings it doesn't understand.

## Use

```python
from debrief_config import add_store, load_config, save_config

config, store = add_store(load_config(), title="Team exercises", location="/data/exercises")
save_config(config)  # atomic: written to a temporary file, then renamed
```

`add_store` and `remove_store` return new configurations; nothing changes on disk until `save_config` runs. Removing a store forgets it but leaves its files alone.
