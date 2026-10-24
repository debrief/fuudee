# Data-file schema changelog

The data-file schema is versioned independently of Debrief (SUB-12). Before 1.0.0 there is no migration guarantee (SUB-13).

## 0.0.23 (24 Oct 2026)

- Sensors and their bearings (CAP-22; decisions, product owner, 24 Oct 2026):
  - `SensorFeature` (`kind: sensor`; `SensorProperties`: `name`, `host_track_id`, `colour`, `legacy_symbology`, `hidden`, `provenance`, `array_offset`, `array_mode`): a sensor carried by a track of the plot, its host. No geometry: its cuts are drawn from the host's position, or with an `array_offset` (a Length astern) from its towed array's, which follows the ship by `array_mode` (`ArrayModeEnum`: `worm_in_hole`, back along the ship's own track, legacy's default; `plain`, straight astern) (product owner, 24 Oct 2026).
  - `SensorCutFeature` (`kind: sensor_cut`; `SensorCutProperties`: `sensor_id`, `time`, `bearing`, `ambiguous_bearing`, `resolved` (`SensorCutKeptEnum`: `bearing`, `ambiguous_bearing`), `range`, `origin` (`[lon, lat]`), `origin_derived` (an origin Debrief worked out, pinned when its track was split, not recorded), `course` (the course its side is told by, pinned with such an origin), `bearing_accuracy` (`;SENSOR3:`'s, as written: kept, not drawn), `label`, `comment`, `colour`, `hidden`): one observation, a feature of its own, as a narrative entry is, so resolving one cut, or a period's, is a small step. A resolved cut records which bearing was kept, not the side. No bearing error: bearings are drawn as lines; an optional error can be added later, once agreed with the acoustic replay application's owners.
  - `AmbiguityResolution` (`keep`: `AmbiguityKeepEnum`, `port`, `starboard`, `bearing`, `ambiguous_bearing` or `ambiguous`; `cut_ids`, or `sensor_ids` and a `period`): what a resolution asks for, as an agent, a menu or the map asks it.
  - `FeatureKindEnum` gains `sensor` and `sensor_cut`, and the plot's, the history's and the tools' feature unions both features.
  - Rules: a sensor's host is a track of the plot; a cut's sensor is a sensor of the plot; bearings from 0 to under 360°; a cut resolved only if it has an ambiguous bearing; a range of 0 or more (0 is drawn as a point, as legacy drew it); a bearing accuracy not empty; an array offset of 0 or more, and an array mode only with an offset; an origin on the globe; `origin_derived` and `course` only with an origin; a label not empty; no geometry.
- Webview messages `resolve_asked` (map to host: `feature_id`, `keep`: one of an ambiguous cut's lines `Alt`-clicked, `bearing` or `ambiguous_bearing`, or a choice in the popover a plain click shows, which may be `ambiguous` too; a plain click only selects) and `cut_chosen` (map to host: `feature_id`: a cut's menu asked for).
- Shared vectors `schemas/vectors/sensor-cuts.json`: which side of a course a bearing is on (legacy `relBearing`'s own test cases), the default length of a cut without a range, and cuts' origins, courses, ends and the bearing keeping port or starboard keeps, across a turn, a turn logged at the next fix (legacy `legs_20.rep`: the side told by the logged course), for a stationary host, at the antimeridian and in the far north, a range of 0, and towed arrays astern (worm in the hole on legacy `WormInHoleOffset`'s own test track, through an L, and on a dense turning track; plain), each case's host with its logged `courses` and its `sensor`'s `array_offset_m` and `array_mode`, held by Python and TypeScript. `schemas/vectors/service-methods.json` gains `debrief/resolve_ambiguity`, `debrief/set_array_offset` and `debrief/import_sensor` (changing the plot) and `debrief/sensors` and `debrief/preview_sensor` (leaving it alone).
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.22 must be imported or built again.

## 0.0.22 (16 Oct 2026)

- Exported images (SUB-25, EXT-05, OUT-04; decisions, product owner, 16 Oct 2026), in a new module, `figures.yaml`:
  - `FigureId` (`DBF1-PPPPPPPP-RRRRRRRRRRRRRRRR-EEEEEEEE-C`: the plot key, the revision, the export and a check symbol, in Crockford's base 32) and `ShortFigureId` (`DBF-PPPP-RRRR-RRRE-EC`, the footer's): an image's ID, naming the plot, the exact revision exported and the export.
  - `ImageExport` (`id`, `revision`, `at`, `by`, `format` (`ImageFormatEnum`: `png`, `svg`), `file`, `footer`, `preset` (`ImagePresetEnum`: `screen`, `slide`, `a4_landscape`), `theme` (`ImageThemeEnum`: `current`, `light`), `width`, `height`, `viewport`, `time`, `tote`: the Tote's tracks shown): one image exported, as the plot's export log records it.
  - `LoggedExport` (`catalogue`, `item`, `export`) and `ExportLog` (`exports`): the analyst's own export log, `exports.json` beside their Debrief configuration, for exports a plot's log cannot keep (a read-only catalogue's; decision, product owner, 16 Oct 2026).
  - `ImageRequest` (`format`, `preset`, `theme`, `footer_text`), `RenderedImage` (`format`, `data`, `width`, `height`, `viewport`, `notes`), `RevisionShown` (`step`, `latest`, `revision`, `figure`) and `FigureSource` (`store`, `store_title`, `catalogue`, `item`, `title`, `revision`, `step`, `current`, `copied`, `export`): what the map is asked to draw and draws, an earlier revision shown read-only, and a plot an image came from.
- The plot's island gains `exports` (a list of `ImageExport`): its export log; view state, never a step, so an export changes neither the plot's revision nor any product that drew from it. Rules: each image recorded once; its time within its window; its viewport on the globe. A plot's log keeps its newest 500, the analyst's own its newest 2,000.
- `StacItemProperties` gains `debrief:revisions`: the revisions (16 symbols, as an image ID names them) the item's plot has had, derived at each change, so an image's ID is matched against items without reading their plots.
- Webview messages `export_image` (host to map: `image_request`), `image_rendered` (map to host: `image`, or `message` alone, why none) and `latest_asked` (map to host, no members); `show_plot` may carry `revision_shown`, the plot shown being an earlier revision, read-only.
- Shared vectors `schemas/vectors/figure-ids.json`: image IDs encoded from a plot, a revision and an export, and read as typed (case, spaces and dashes ignored, O as 0, I and L as 1; not an ID; mistyped), held by Python and TypeScript; and `schemas/vectors/service-methods.json`: the tool service's methods that change the plot they name and those that leave it alone, held by Python and VS Code (an earlier revision shown read-only refuses all but the latter).
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.21 must be imported or built again.

## 0.0.21 (16 Oct 2026)

- Collation (CAP-05, CAP-08 to CAP-12; decisions, product owner, 16 Oct 2026). A source is a catalogue item.
  - `TrackProperties.supplies` (a list of `TrackSupply`: `catalogue`, `item`, `track`, `title`, `revision`, `start`, `end`): which catalogue item, at which revision, supplies each period of a track (periods of one item read at two revisions are two), the track stitched from the chosen periods; left out, the plot itself supplies the whole track, as imported. Rules: each period from start to end, in time order, apart. Split and merged tracks keep the periods of their fixes.
  - `TrackProperties.platform_links` and `platform_unlinks` (lists of `SourceTrackRef`: `catalogue`, `item`, `track`, `name`): tracks in other items confirmed or linked by hand as this track's platform, and tracks of the same name refused. Rules: none named twice, none both linked and unlinked.
  - `ProvRecord.drawn_from` (a list of `ItemRef`: `catalogue`, `item`, `title`, `revision`): the catalogue items an operation took data from, each at the revision read; PROV's wasDerivedFrom. Items are named by their catalogue's own id (from its `catalog.json`) and their item id.
  - `PlotView.collation` (`CollationView`: `dismissed` and `reviewed`, lists of `ItemRevision`): new data set aside (Not now) and revisions reviewed; view state in the island, never a step. `ItemRevision.by` and `at`: who gave the answer and when, a light audit trail (decision, product owner, 16 Oct 2026).
  - `StacItemProperties` gains `created` (STAC common metadata: when the item came into the catalogue), `debrief:revision` (the content hash of its plot: any recorded change is a new revision), `debrief:coverage` (a list of `TrackCoverage`: `track`, `name`, `fixes`, `spans`), `debrief:drawn_from` (`ItemRef`s: the items the tracks' supplies name now, at every revision a period was read at), `debrief:imported` (whether the item came in by importing files: its first record names them; only such items are new data) and `debrief:origin` (the step_hash of its history's first step: items sharing it are copies of one plot), all derived at each change, never authoritative. Rule: each span from start to end.
  - A new module, `collation.yaml`: `CoverageReport` (a plot's platforms, the items in the folder tree it draws from, and its review flag), `CoveragePlatform`, `CoverageSource` (`link`: `CoverageLinkEnum`, `plot`, `linked` or `proposed`), `CoveragePeriod` (`sources`, `chosen`), `CoverageItem` (`role`: `CoverageItemRoleEnum`, `this_plot`, `drawn_from` or `other`; `new_data`, `revised`), `NewDataMark` and `ReviewFlag`.
  - Webview messages `show_coverage` (`coverage`, `time`; or `message` alone, why a choice was not made), `source_chosen` (`feature_id`, `time_range`, `source`), `link_changed` (`feature_id`, `source`, `linked`), `take_asked` and `dismiss_asked` (`item_revision`), and `review_cleared`. `TimelineEntryKindEnum` gains `coverage`: a period a track has data for, from one source.
- Shared vectors `schemas/vectors/collation.json`: spans (gaps more than ten times the median time between fixes and more than five minutes; none with fewer than three steps), platform names (case and runs of spaces ignored) and periods, held by Python and TypeScript.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.20 must be imported or built again.

## 0.0.20 (15 Oct 2026)

- How often a track is labelled, marked with a symbol and given a direction arrow (CAP-32): `label_interval`, `symbol_interval` and `arrow_interval` on `TrackProperties`, each a `Duration` or `"off"` (`FixIntervalOffEnum`); labels and symbols may also be `"all"` (`FixIntervalAllEnum`), at every recorded fix, legacy Debrief's *All* (decision, product owner, 15 Oct 2026), which arrows may not; presentation content recorded in history like colour (SUB-22), held per track. Left out, Debrief's default: no time labels and no symbols; a few arrows along the track's part in the time window, as before. The map draws them at each whole multiple of the interval of UTC (every 10 min is 0900, 0910, 0920, wherever the track starts), as legacy Debrief aligns them. Rule: a duration is a whole number of seconds from 1 s to 24 h. Nothing else in plot files changes.
- `FixMark` gains `show_label` and `show_symbol` (boolean, true or left out): the fix always shows its time label or symbol, whatever its track's intervals and at any zoom (CAP-32; decision, product owner, 15 Oct 2026: force on only, so no per-fix off). A mark with only these is valid; the rule that a mark says something now counts them, and a mark saying either false is refused. Set by `debrief/mark_fix`, one step each.
- Shared vectors `schemas/vectors/fix-intervals.json`: an interval as typed (`90 s`, `1h30`, `off`) and as named (`1 min 30 s`, `1 h 30 min`), held by `debrief_kernel.time` and the map's form alike.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.19 must be imported or built again.

## 0.0.19 (15 Oct 2026)

- Narrative entries (CAP-05, CAP-19, CAP-20, EXT-14): a feature kind of their own, `narrative` (`NarrativeFeature`, `NarrativeProperties`), with null geometry as a time-only annotation has: `time` (UTC to the millisecond), `source` (who wrote it: a platform, a person or a document), `entry_type` (the source's own kind of entry, free text, such as `GenComment`, `CSD` or `FCS`; left out where it gives none), `text` (may run to several lines) and `track_id` (the track it belongs to; a link to a track since deleted is allowed and ignored), and `provenance`. One feature an entry, so each entry added, changed or deleted is one small step. Every narrative feature in a plot together is its narrative, on one Zulu time axis, in one order held by both languages to `schemas/vectors/narrative-order.json`: by time, then source ignoring case (capitals first between sources differing only in case), then plot order. Rules: null geometry, a source and text that are not blank, a type that is not blank when given. `FeatureKindEnum` gains `narrative`; plots, history steps, earlier deltas and tool results may hold them.
- `NarrativeSpec` (`time`, `source`, `entry_type`, `text`, `track_id`): an entry as a form or an agent describes it (`debrief/add_narrative`, `debrief/edit_narrative`).
- The Timeline lists narrative entries with time-only annotations and fix comments (decision, product owner, 15 Oct 2026). `TimelineEntry` (`id`, `kind` (`TimelineEntryKindEnum`: `narrative`, `annotation`, `fix_comment`), `start`, `end`, `source`, `entry_type`, `text`, `track`, `colour`, `hidden`) is one of its rows. Webview messages `show_timeline` (host to Timeline: `timeline_entries`, `timeline_tracks`, `time`; none when no plot is open), `timeline_chosen` (`feature_id`), `save_narrative` (`narrative`, and `feature_id` when changing one), `delete_narrative` (`feature_id`), `open_narrative_form` (host to Timeline: `feature_id` to change one, none to add), `narrative_saved` (`feature_id` or `message`) and, to the map, `set_narrative` (`timeline_entry`: the entry current time is at, shown beside its track). `show_timeline` also carries `plot_id` (which plot it is, so the Timeline tells another plot from the same one changed) and `narrative_on_map`.
- The plot's island gains `narrative_on_map` (boolean, left out meaning shown): whether the map shows the narrative entry current time is at beside its track; turned off and on in the Timeline, view state like the Tote's lines, never a step (decision, product owner, 15 Oct 2026). Webview message `narrative_on_map_changed` (Timeline to host: `narrative_on_map`).
- Webview messages `undo_asked` and `redo_asked` (Timeline to host, no members): the analyst pressed Undo or Redo with focus in the Timeline but not in a text box, so the host undoes or redoes the plot as from the map (decision, product owner, 15 Oct 2026).
- Webview message `playing_changed` (`playing`): the time controller tells its host when current time starts or stops playing, and the host tells the Timeline, which follows current time again when playing starts (decision, product owner, 15 Oct 2026).
- Sample data and legacy plots: the sample's scripted log and a .dpf file's narrative entries are narrative entries now, not time-only note annotations; a .dpf entry's type is kept, so it is no longer listed as not imported.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.18 must be imported or built again.

## 0.0.18 (14 Oct 2026)

- Measures and the Tote (CAP-06, CAP-07), in a new module `measures`: `MeasureDefinition` (`id`, `title`, `label` for a column heading, `subject` (`MeasureSubjectEnum`: `relative`, between the primary and a secondary, or `own`, of one track), `quantity_kind`, `display` (`MeasureDisplayEnum`: `quantity`, `range`, `bearing`, `relative_bearing` or `depth`), `explanation`); `MeasureGroup` (`id`, `title`, `description`, `extends`, the group whose measures come first, and `measures`, ids in order), ready for a study's own groups in its catalogue; `ToteResult` (`time`, `group`, `measures`, `primary`, `rows`, `note`), each `ToteRow` a track (`track`, `name`, `colour`, `status` (`ToteRowStatusEnum`: `ok`, `no_data` or `missing`), `note`, `values`), each `MeasureValue` a `measure`, its `value` and `unit` (left out where it cannot be worked out); `ToteTrack` (`id`, `name`, `colour`), a track that can be chosen.
- The plot's island gains `tote` (`ToteView`: `primary`, `secondaries`, `measure_group`, left out meaning core, and `map_lines`, false to stop the map drawing a line from the primary to each secondary, left out meaning drawn): which tracks the Tote compares. View state, like the time window: never a step in the history (decision, 14 Oct 2026). Rules: the primary is not also a secondary, and no secondary is chosen twice; ids of tracks the plot no longer has are allowed.
- Webview messages `show_tote` (host to Tote: `tote_tracks`, `tote_view` and `tote`, any of them; none when no plot is open), `tote_changed` (Tote to host: `tote_view`), the latter held to the same rules, and `set_tote` (host to map: `tote_view`, for its lines).
- The core measure group (data, not schema): range (shown as a `range`), bearing, relative bearing, angle on the bow (`aob`, shown as a relative bearing) and bearing rate (`bearing_rate`, an angular rate in `deg/min`), then course, speed and depth.
- Formatting (both kernels, shared vectors): relative bearings (`R045.0°`, `G120.0°`, `000.0°`, `180.0°`), depths (metres, or feet where lengths are in feet or yards, one decimal) and ranges (the analyst's length unit, except that where it is nautical miles a range under 1 nmi is in whole yards: `60 yd`, then `1.00 nmi`; decision, 14 Oct 2026).
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.17 must be imported or built again.

## 0.0.17 (14 Oct 2026)

- `TrackEdit` moves a single fix (CAP-01): `action` may be `move_fix`, with `fix_time` (the fix, found by its time; of fixes sharing a time, the first, as for a mark) and either `distance` and `bearing` (how far and which way it goes, along the geodesic) or `position` ([longitude, latitude], where it goes). Rules: a fix moved needs its time and exactly one of a distance and a bearing or a position, on the globe, and no period, angle, pivot, anchor, course or speed; only a fix moved has a fix time or a position.
- How a track is plotted, as legacy Debrief asked of each track imported (CAP-01; decision, product owner, 14 Oct 2026): `plotting_mode` on `TrackProperties` (`PlottingModeEnum`: `otg`, over the ground, as logged, also when left out; or `dr`, by dead reckoning, from the first fix by each fix's recorded course and speed), content recorded in history like colour; the geometry is always the positions as plotted. A track plotted by dead reckoning keeps its positions as logged in `logged_positions` (a `LineStringGeometry`, one position per fix), so plotting it over the ground again puts them back; a legacy .dpf DR leg has none. `TrackEdit` action `set_plotting_mode` with `plotting_mode` changes it, as one step. Over the ground again after a change made while plotted by dead reckoning loses that change, so it is refused, saying why, unless `discard_dr_changes` is true (decision, product owner, 14 Oct 2026); only a change of plotting mode to `otg` has `discard_dr_changes`. On a track plotted by dead reckoning, edits change where it starts or its courses and speeds (decision, product owner, 14 Oct 2026), so it also keeps its courses and speeds as logged, `logged_courses` (an `AngleSeries`) and `logged_speeds` (a `SpeedSeries`), one per fix, from when it was plotted so: they tell whether it was changed while plotted by dead reckoning, and plotting it over the ground puts them back with the positions. Rules: `logged_positions`, `logged_courses` and `logged_speeds` only on a track plotted by dead reckoning, each with one entry per fix; a change of plotting mode has its mode and nothing else, and only it has one.
- `UserConfig` (the analyst's own configuration, not a data file) gains `track_import_mode` (`TrackImportModeEnum`: `ask`, the default, also when left out; `otg`; `dr`): the choice an analyst said to use for future imports, which they may clear to be asked again. User state stays there, never in a catalogue or a plot file; importers are given the mode by the host. A configuration that sets it cannot be read by an earlier Debrief, so it says `config_version` 2 (the newest this Debrief reads), and an earlier Debrief says to update rather than that the file is not valid; cleared, it says 1 again. A configuration with only stores stays at 1.
- The `edit_track` message carries a fix moved, sent when the analyst lets go of a fix's own handle or stops nudging one. A fix moved is an ordinary track feature, recorded as an edit; a fix's time, recorded course and speed, and mark are kept.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.16 must be imported or built again.

## 0.0.16 (14 Oct 2026)

- Marked fixes (`fix_marks` on `TrackProperties`, a list of `FixMark`): a fix with a colour, a label or a comment of its own, as legacy plots carry and the .dpf import now keeps (CAP-01, EXT-14). Each mark is found by its fix's `time`, not its place in the track, so it stays with its fix when other fixes are removed, the track is split or merged, or it is moved, rotated, sheared, stretched or smoothed; most fixes have none, so only marked fixes are listed. `colour` (lower-case hex) draws the fix's marker and the line from it to the next fix; `label` is drawn beside the fix; `comment` is shown when the analyst points at the fix and in the Timeline. Rules: each mark's time is one of the track's times (where two fixes share a time, the mark is the first's); marks are in time order, one per time; each says something (a colour, a label or a comment), with no empty text. Changing a mark is a recorded, undoable step (SUB-22).
- Webview messages `show_fixes` (host to map: `feature_id`, `fix_times`, `preview`, a `LineStringGeometry` of the track as a change would leave it, and `message`; with no `feature_id`, take them away), which rings jumps found before the analyst confirms them and draws smoothing before it is applied; and `fix_chosen` (map to host: `feature_id`, `fix_time`), sent when the analyst right-clicks a fix to colour, label or comment on it.
- Removing jumps and smoothing a track change ordinary track features (every parallel series and mark kept in step), recorded as edits; nothing else in plot files changes.
- Before 1.0.0 only an exact version opens (SUB-13): plots written as 0.0.15 must be imported or built again.

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
