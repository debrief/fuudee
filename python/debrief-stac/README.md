# debrief-stac

Debrief catalogues: plots and their sources in static, file-based STAC catalogues (SUB-05 to SUB-11, SUB-15 to SUB-24, SUB-28, SUB-29, SUB-35, NFR-10, NFR-11).

```
catalog.json               the catalogue, declaring the data-file schema version it holds
<item>/<item>.json         one STAC item per plot, with its extent in space and time
<item>/plot.geojson        the plot as of the history's current step
<item>/history/head.json   which step is current, the latest, and those abandoned
<item>/history/<n>.json    one delta per change: what made it and what it changed
<item>/sources/<file>      imported sources: copied in, read-only, hashed once
<item>/media/<file>        supporting files: video, imagery, acoustic files
<item>/payloads/<file>     observation payloads, such as Parquet bearings (CON-02)
```

```python
from debrief_stac import Catalogue, Changes

catalogue = Catalogue.create(path, "exercise-2026", "Exercise 2026", "Serials from Exercise 2026")
catalogue.create_plot("serial-01", "Serial 1")
source = catalogue.add_source("serial-01", Path("serial-01.rep"))  # SourceRef for provenance
bearings = catalogue.add_payload(
    "serial-01", Path("bearings.parquet"), media_type="application/vnd.apache.parquet"
)
plot = catalogue.read_plot("serial-01")
catalogue.write_plot("serial-01", plot)  # recorded as one delta: the difference
history = catalogue.history("serial-01")
base = history.base()  # the head a change starts from
catalogue.commit("serial-01", [record], Changes(modified=[track]), base)  # Conflict if moved on
history.undo()  # replay to the step before; history.redo(), history.goto(n)
catalogue.verify_sources("serial-01")  # [] when unchanged
```

- **Items are found by walking the folders.** An item counts when its parent link points at the catalogue. The catalogue's child links are written but never trusted (SUB-23).
- **Every change is a delta (SUB-19, SUB-20).** A delta holds the provenance records of the operation that made it and its output: features added, changed and deleted, and named sets. Replay applies outputs; it never re-runs a tool, so the plot can always be rebuilt from its history even if a tool has changed since.
- **Undo is replay to an earlier step (SUB-21).** Undone steps can be redone until a new change is made; then they are kept, marked abandoned, and cannot be redone. The import (or, for a plot from before history, a baseline) cannot be undone.
- **Changes made meanwhile are never overwritten (SUB-28, SUB-29).** A change carries the base it started from. If the plot has moved on, `commit` raises `Conflict`; `mergeable` says whether the two touch different features, in which case `merge=True` applies the change on top. Otherwise `save_as_new` saves it as a copy of the plot with the same history and sources.
- **Crashes lose at most the change in progress (NFR-10).** The delta is written first (created exclusively, so two writers cannot take the same step), then the head, then the plot. The deltas are the record: opening a plot finishes a change whose delta was written but whose head was not, rebuilds a lost or damaged head from the deltas, sets aside a delta written only in part, and rebuilds a plot file that does not match its history. A plot file holding content the history never recorded (edited outside Debrief) is kept beside it first.
- **Writes hold a short lock; plots are never locked while open.** Each change, undo or repair takes a lock file in `history/` for the milliseconds it takes, so the extension, the tool service and another analyst on a shared folder cannot interleave their writes. A lock left by a process that died is taken over after 30 seconds. Readers never wait: if a write is in progress, or the folder is read-only, the plot is rebuilt in memory.
- **Feature order is kept.** A saved plot whose features are in a different order records that order in its delta.
- **Saves are atomic.** Each is written to a temporary file and renamed, so a failure leaves the original intact (NFR-11).
- **Sources never change.** They are copied in read-only and never overwritten. Each content hash is computed once on import. Payloads are copied and hashed the same way. `verify_sources` checks only the sources and payloads asked about, and re-hashes a file only when its size or modification time has changed since it was last verified (SUB-10, SUB-11).
- **Newer schemas are flagged.** Writing a newer-schema file into a catalogue raises `NewerSchemaError` unless the caller passes `allow_newer_schema=True`; the interface asks the analyst first (SUB-35).
- **Storage sits behind `Store`.** `FileStore` is the only implementation, so a database backend could replace it (SUB-09).
- **`CompositeCatalogue` shows several catalogues as one**, with each item's source catalogue (SUB-17).

Access control is the filesystem's (PRN-05, SEC-01). An item's bounding box is a plain longitude and latitude range, so a plot crossing the antimeridian gets a box spanning the globe; that is good enough for search.
