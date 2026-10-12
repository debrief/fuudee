# Data-file schema changelog

The data-file schema is versioned independently of Debrief (SUB-12). Before 1.0.0 there is no migration guarantee (SUB-13).

## 0.0.9 (12 Oct 2026)

- A whole-plot feature (`PlotFeature`, kind `plot`, at most one per plot, null geometry) carries the plot's own details (`title`, `description`), which are content, and its island (`view`): view state kept in the plot file but outside its history. The island is left out of every history hash and of every delta, is not undoable and is never recorded in provenance (SUB-22, decision 12 Oct). Its first member is the plot's time window (`view.time_window`), one for the whole plot, replacing per-layer display windows (CAP-28, CAP-29).
- Features can be hidden (`hidden` on track, annotation and sensor observation properties). Hiding, like a track's colour, is content: a recorded, undoable change.
- Presentation (`Presentation`, `presentation.json`, asset kind `presentation`) is retired. A `presentation.json` still found beside a plot of this schema version is turned into one recorded step when a writer opens the plot, then deleted; a read-only store applies it in memory. Plots of 0.0.8 or earlier cannot be opened by 0.0.9 at all (SUB-13), so this rarely runs.
- A delta never holds a whole-plot feature's view (a rule checked on reading).

## 0.0.8 (12 Oct 2026)

- A tool form is told current time (`current_time` on `show_form`), so its time fields start at the time the analyst is looking at (SUB-26, TL-07).

## 0.0.7 (11 Oct 2026)

- Plot history (`Delta`, `HistoryHead`): every change recorded as a delta holding both the operation and its output, with a head for undo and redo; undone deltas superseded by a new change are kept, marked abandoned (SUB-19 to SUB-21, NFR-10).
- Presentation (`Presentation`): the analyst's track colours and hidden features, kept beside the plot as `presentation.json` (asset kind `presentation`) but outside its history and provenance (SUB-22).
- Webview messages carry current time and viewport (`set_time`, `time_changed`, `set_viewport`, and `time` and `viewport` on `show_plot`), so the map shows and sets all three pieces of shared state (SUB-26, SUB-27).
- The map is told how many features are hidden (`hidden_count` on `show_plot`) and can ask for them all to be shown (`show_hidden`), so hiding, which is shared, never goes unseen (SUB-22).

## 0.0.6 (11 Oct 2026)

- A quantity kind for angular rates such as bearing rate (`AngularRate`), in degrees per minute, degrees per second or radians per second. Degrees per minute is the analysts' standard. Tool parameters, recorded values and result columns can carry it.

## 0.0.5 (11 Oct 2026)

- Per-user configuration (`UserConfig`): the stores Debrief knows about, read and changed by Python and TypeScript (SEC-06). It carries its own `config_version`, not the data-file schema version.
- Provenance records name the features an operation was applied to (`selected`), so a tool run can be replayed (SUB-19).
- Messages between the VS Code extension host and its webviews (`WebviewMessage`), as boundary types (CON-08).

## 0.0.4 (11 Oct 2026)

- Track style: an optional colour (and the legacy REP symbology it came from) on each track, for display (DEV-07, SUB-22).
- Track depths: an optional depth series, positive down, with its unit (EXT-01).

## 0.0.3 (11 Oct 2026)

- Display formatting settings (`FormatSettings`), shared by the Python and TypeScript formatting services (SUB-04).

## 0.0.2 (11 Oct 2026)

- Split into modules: core, geojson, prov, features, stac, state, tools.
- Plot features: annotations (point, line, polygon or time-only) and sensor observations with an opaque payload envelope, alongside tracks. Named sets.
- Quantities with units (length, speed, angle, duration) and parameter values.
- Provenance records the parameters an operation ran with, and schema migrations.
- STAC catalogues, items, assets and links, with `debrief:schema_version`.
- Shared state: time, selection, viewport.
- Tool declarations and tool results.

## 0.0.1 (11 Oct 2026)

- LinkML spike: tracks with unit-carrying speed and course series, provenance, schema version.
