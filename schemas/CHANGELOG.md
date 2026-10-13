# Data-file schema changelog

The data-file schema is versioned independently of Debrief (SUB-12). Before 1.0.0 there is no migration guarantee (SUB-13).

## 0.0.15 (14 Oct 2026)

- `TrackEdit` shears and stretches a track (CAP-01, CAP-21): `action` may be `shear` or `stretch`, with `anchor` (`TrackEditAnchorEnum`: `start` or `end`), the end of the period (or the whole track) held fixed. A shear gives either `distance` and `bearing` (how far and which way the other end is dragged) or `course` (an `Angle`, true) and `speed` (a `Speed`), the course and speed made good from the period's first fix to its last; a stretch gives `speed`. Rules: a shear needs an anchor and exactly one of those pairs, and no angle or pivot; a stretch needs an anchor and a speed of more than nothing, and nothing else; a move or a rotation has no anchor, course or speed; distances and speeds are never negative.
- The `edit_track` message carries shears and stretches, sent when the analyst lets go of a track's end or stops nudging one. Plot files are unchanged: a sheared or stretched track is an ordinary track feature, recorded as an edit.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.14 must be imported or built again.

## 0.0.14 (14 Oct 2026)

- `TrackEdit`: a track moved or rotated by hand, as the map, a form or an agent describes it (CAP-01, CAP-02). `action` is `move` (with `distance`, a `Length`, and `bearing`, an `Angle`, true) or `rotate` (with `angle`, an `Angle`, positive clockwise, and perhaps `pivot`, [longitude, latitude]); `period` (a `TimeRange`) limits it to the fixes in that period, ends included, and left out means the whole track. Rules: a move needs a distance (not negative) and a bearing and has no angle or pivot; a rotation needs an angle and has no distance or bearing; a pivot is on the globe; a period does not end before it starts.
- Webview message `edit_track` (`feature_id`, `track_edit`), sent by the map when the analyst lets go of a track's move or rotate handle, or stops nudging one, so the host moves or rotates the track so, as one recorded step. Plot files are unchanged: moving, rotating, splitting and merging tracks change ordinary track features, recorded as edits.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.13 must be imported or built again.

## 0.0.13 (13 Oct 2026)

- Webview messages for drawing and editing annotations on the map: `annotation_drawn` (`annotation`, its name empty), sent when the analyst finishes drawing one, so the host opens the annotation form with it; and `annotation` on `edit_annotation`, sent when the analyst lets go of a handle or stops nudging one, so the host changes the annotation so, as one recorded step, without the form. Plot files are unchanged.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.12 must be imported or built again.

## 0.0.12 (13 Oct 2026)

- Annotations say how they are drawn (`shape` on `AnnotationProperties`: `line`, `area`, `circle`, `ellipse`, `label`, `marker` or `note`). Left out, it follows from the geometry, so earlier annotations need nothing new. A rule checks that a shape has its geometry: a line a line string, an area, circle or ellipse a polygon, a label or marker a point, a note none (CAP-03, CAP-04).
- Circles and ellipses. GeoJSON has no curves, so a circle or an ellipse is a polygon approximating it (72 sides along geodesics, `debrief_kernel.geodesy.circle_ring` and `ellipse_ring`), so other GeoJSON tools see the area and a plot's extent includes it, with its exact `centre` ([longitude, latitude]) and `radius`, or `semi_major`, `semi_minor` (each a `Length` with its unit) and `orientation` (an `Angle`, true, of the longer axis). Debrief draws and edits it from these. Rules: a circle needs centre and radius, an ellipse centre, semi-axes and orientation, the semi-minor no longer than the semi-major, sizes more than zero, nothing else has them, and the polygon matches its centre and size (within 1%, checked on a sphere).
- How an annotation looks (`appearance`, `AnnotationAppearance`): `colour`, `line_style` (`solid`, `dashed`, `dotted`), `line_width` (1 to 10 px), `fill_colour` and `fill_opacity` (only for areas, circles and ellipses, a rule), `label_size` (8 to 32 px) and `label_position` (`above`, `below`, `left`, `right`, `centre`, `none`). Any member left out takes Debrief's default. Appearance is content: changing it is a recorded, undoable step (SUB-22).
- Chart furniture (`furniture`: `north_arrow`): an annotation of style `chart_furniture` with no geometry, which, alone among annotations without geometry, needs no time.
- `AnnotationSpec`: an annotation as a form or an agent describes it (shape, name, text, positions, sizes, time or period, appearance), which the tool service makes into a feature (`debrief/add_annotation`, `debrief/edit_annotation`).
- Webview messages for the annotation form: `show_annotation_form` (`annotation`, `feature_id`, `time_range`, `current_time`, all optional), `save_annotation` (`annotation`, and `feature_id` when changing one), `delete_annotation` (`feature_id`) and, from the map, `edit_annotation` (`feature_id`).
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.11 must be imported or built again.

## 0.0.11 (13 Oct 2026)

- A plot file carries its whole history, as the top-level member `history` (`PlotHistory`): the current step, `head_hash`, and every step (`HistoryStep`: its operation's provenance records and its output, as a delta held, plus its `state`, applied, undone or abandoned, and its `step_hash`). Passing the one file passes undo, redo and provenance. The history is a GeoJSON foreign member, so the file is still plain GeoJSON to other tools (SUB-19, decision 13 Oct).
- The history is a hash chain: `step_hash` is the SHA-256 of the step's canonical JSON (all members but `step_hash` and `state`, keys sorted, no spaces, UTF-8) followed by the previous step's `step_hash` (64 zeros after `sha256:` for step 1); `head_hash` is the last step's. Rules, checked on reading: steps numbered from 1 with no gaps; each step after an earlier one; the current step within range and never abandoned; each step's state as the after links and the current step say; the chain whole; and the current step's `result_hash` equal to the hash of the file's content, which leaves out both the island and the history. The island stays outside every checksum.
- `Delta` and `HistoryHead` describe the earlier layout (a history folder beside the plot file) and are read only to move such a history into its plot file.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.10 must be imported or built again.

## 0.0.10 (12 Oct 2026)

- Webview messages for the time controller: `show_time` (current time, its range being the time window shown, and the plot's period as `time_range`) and `window_changed` (the window to save, as `time_range`, sent when the analyst lets go). A `time_range` on any message must not end before it starts (CAP-28, SUB-26).
- The island says how tracks outside the time window are drawn (`view.context_tracks`: `visible`, `faint` or `hidden`; left out means `visible`). The time controller is told it, with the window as saved (`saved_window`) and whether the analyst's setting shows faint as visible (`minimum_context_contrast`), on `show_time`; it sends the analyst's choice as `context_changed`. The map is told how to draw them (`context_tracks` on `show_plot`, and `set_context`) (CAP-29, expert panel 12 Oct).
- A tool whose purpose is to set the time window can ask for its range to be saved (`save_window` on a result's `state_change`, which then needs `time`). Debrief honours it only when the analyst ran the tool by hand on that plot; otherwise a time outside the saved window is shown, never saved (CAP-28).
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.9 must be imported or built again.

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
