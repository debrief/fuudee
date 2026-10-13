# debrief-stac

Debrief catalogues: plots and their sources in static, file-based STAC catalogues (SUB-05 to SUB-11, SUB-15 to SUB-24, SUB-28, SUB-29, SUB-35, NFR-10, NFR-11).

```
catalog.json               the catalogue, declaring the data-file schema version it holds
<item>/<item>.json         one STAC item per plot, with its extent in space and time
<item>/plot.geojson        the plot: its content, its island (view state) and its whole
                           history, in one file an analyst can pass to a colleague
<item>/sources/<file>      imported sources: copied in, read-only, hashed once; kept for
                           audit, never needed by the plot file
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
catalogue.write_plot("serial-01", plot)  # recorded as one step: the difference
history = catalogue.history("serial-01")
base = history.base()  # the state a change starts from: current step and content hash
catalogue.commit("serial-01", [record], Changes(modified=[track]), base)  # Conflict if moved on
history.undo()  # replay to the step before; history.redo(), history.goto(n)
catalogue.verify_sources("serial-01")  # [] when unchanged
other.add_plot_file(
    Path("serial-01.geojson"), agent
)  # a plot file from a colleague, history and all
```

- **Items are found by walking the folders.** An item counts when its parent link points at the catalogue. The catalogue's child links are written but never trusted (SUB-23).
- **Every change is a step, kept in the plot file (SUB-19, SUB-20, decision 13 Oct).** A step holds the provenance records of the operation that made it and its output: features added, changed and deleted, and named sets. The plot file's `history` member holds every step, one a line, with whether it is applied, undone or abandoned, and the current step. Replay applies outputs; it never re-runs a tool or reads a source, so the plot can always be rebuilt from its history, anywhere, even if a tool has changed since. All history is kept.
- **The history is checked (SUB-19).** Each step's `step_hash` is the SHA-256 of the step (sorted, compact JSON, without its hash and state) followed by the previous step's, and `head_hash` is the last one's; each step's `result_hash` is the hash of the content after it. The content hash leaves out the island and the history. A history whose chain is broken is shown but never written; content that does not match its intact history is rebuilt from it, the file as found kept beside it. Steps already checked are not checked again when the file changes: only new or changed ones are.
- **Undo is replay to an earlier step (SUB-21).** Undone steps can be redone until a new change is made; then they are kept, marked abandoned, and cannot be redone. The import (or, for a plot from before history, a baseline) cannot be undone.
- **Changes made meanwhile are never overwritten (SUB-28, SUB-29).** A change carries the base it started from. If the plot has moved on, `commit` raises `Conflict`; `mergeable` says whether the two touch different features, in which case `merge=True` applies the change on top. Otherwise `save_as_new` saves it as a copy of the plot whose history is the original's up to the base, unchanged, and the same sources.
- **Plot files travel (decision 13 Oct).** `add_plot_file` adds a plot file received from a colleague as a new item: its history is checked, every step comes across unchanged, and one more step records the file it came from and who added it. The STAC item is derived from the plot: title, period and extent.
- **Crashes lose at most the change in progress (NFR-10, NFR-11).** Every change rewrites the whole plot file, content and history together, to a temporary file that is then renamed over it, so the file is always the whole plot before the change or after it. Opening a plot clears what a killed save left and says so. A writer also checks the file has not changed under it since it read it, in case another process wrote without the lock.
- **Writes hold a short lock; plots are never locked while open.** Each change, undo or repair takes a lock file (`<item>/.lock`) for the milliseconds it takes, so the extension, the tool service and another analyst on a shared folder cannot interleave their writes. A lock left by a process that died is taken over at once on the same machine, otherwise after 30 seconds. Readers never wait: if a write is in progress, or the folder is read-only, the plot is made whole in memory.
- **Earlier plots move in.** A plot with a `history/` folder and `head.json` (the earlier layout) has its history moved into its plot file the first time a writer opens it, under the lock, finishing an interrupted change as the earlier layout did. The result is checked (it must replay to the content the folder recorded) before the folder is removed. A reader that cannot write folds it in memory. Before schema 1.0 only files of the current schema version open (SUB-13), so this reaches only plots of this version.
- **Feature order is kept.** A saved plot whose features are in a different order records that order in its step.
- **Sources never change.** They are copied in read-only and never overwritten. Each content hash is computed once on import. Payloads are copied and hashed the same way. `verify_sources` checks only the sources and payloads asked about, and re-hashes a file only when its size or modification time has changed since it was last verified (SUB-10, SUB-11).
- **Newer schemas are flagged.** Writing a newer-schema file into a catalogue raises `NewerSchemaError` unless the caller passes `allow_newer_schema=True`; the interface asks the analyst first (SUB-35).
- **Storage sits behind `Store`.** `FileStore` is the only implementation, so a database backend could replace it (SUB-09).
- **`CompositeCatalogue` shows several catalogues as one**, with each item's source catalogue (SUB-17).

Access control is the filesystem's (PRN-05, SEC-01). An item's bounding box is a plain longitude and latitude range, so a plot crossing the antimeridian gets a box spanning the globe; that is good enough for search.
