# Track operations

How an analyst moves a track, or a period of it, rotates it about a point, splits it at a time and merges tracks into one; and how they clean it: removing jumps, smoothing it, and giving single fixes a colour, a label or a comment of their own. Part A: moving, rotating, splitting and merging (decision, product owner, 13 Oct 2026). [Cleaning tracks](#cleaning-tracks) (part B2, 14 Oct 2026): jump removal, smoothing and marked fixes. Still to come: dragging single fixes, and the legacy OTG and DR import modes.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-01 | Dragging, splitting, merging, jump removal and smoothing of tracks. |
| CAP-02 | Track edits are destructive in the working plot, each recorded as a delta. |
| SUB-19, SUB-21 | Every change is a recorded step; undo is replay to a point, never an inverse operation. |
| SUB-24 | Provenance records who made each change, and what they asked for. |
| SUB-03, SUB-04 | Measured along geodesics; read and shown in the analyst's units and notation. |
| SUB-26, SUB-28 | Moving a track changes neither current time, the window nor the selection; a change made elsewhere is never overwritten. |
| NFR-13 | Dragging a track has a keyboard and a form-based equivalent. |
| PRN-08 | The analyst owns the data: a track is moved where the analyst says, without second-guessing; nothing is removed or moved without the analyst seeing it first. |
| EXT-14, EXT-15 | A legacy plot's per-fix colours, labels and comments are imported, not listed as left out. |

## Model

1. **What moves: the whole track, or a period of it.** Legacy Debrief dragged a whole track, or a selected time period of it, to line it up with a reference: that is kept (decision, 13 Oct 2026). On the map, a small control below the drawing toolbar, *Move or rotate*, says which: **Whole track** (the default) or **Time window**, the fixes in the time window shown. The forms offer the same choice. An agent may give any period. Fixes whose times fall in the period, ends included, move; the rest stay where they are.

2. **The joins jump.** Moving a period moves only its fixes, so the track jumps where they meet the rest: the track is not stretched or smoothed to keep it continuous. The map shows the jump while the analyst drags, and says so: *only the fixes in the time window move, so the track jumps where they meet the rest*. Jump removal (part B) will tidy a join an analyst does not want.

3. **Moving is geodesic.** A move takes every fix the same range along the same true bearing, each along its own geodesic, as legacy Debrief offset each fix: not a change of latitude and longitude, as an annotation's whole-shape move is. Courses and speeds over ground are kept as they were. On a curved earth no move of every fix by the same range and bearing keeps a track's shape exactly: as meridians converge, a track far north moved north is squeezed east-west a little, and one moved east turns a little. For the moves an analyst makes the difference is small (a track at 60°N moved 5 nmi north is 0.25% shorter; at 70°N moved 20 nmi, 1.6% shorter; a track steering 000 at 70°N moved 20 nmi east then steers 000.9), so the recorded speeds and courses are kept rather than worked out again from the moved positions.

4. **Rotating is geodesic.** A rotation keeps each fix's range from the pivot and turns its bearing from the pivot by the angle; clockwise is positive. Courses over ground of the fixes turned turn with the track: by the angle, near the pivot; far from it, or far north, by a little more or less, as the meridians converge, so that each course is still the track's direction as drawn (turned about the North Pole, a ship steering 090 still steers 090). The pivot is, unless the analyst chooses, the fix nearest current time, when current time is within what moves; otherwise the first fix of what moves. On the map the pivot is a handle of its own: drag it (or move it with the arrow keys) to turn about somewhere else. Moving the pivot records nothing; it says where the next rotation turns about.

5. **Handles.** A track selected on its own, and drawn on the map, shows three handles in the theme's focus colour, each named for a screen reader:

    | Handle | Looks like | Does |
    | --- | --- | --- |
    | Move | a filled square on a fix in the middle of what moves | drag it, and the track follows it |
    | Rotate | a ring beyond the fix farthest from the pivot, on a dashed arm from it | drag it round the pivot, and the track turns with it |
    | Pivot | a dotted ring, by default on the fix nearest current time | drag it to choose where the track turns about |

    Dragging the move or rotate handle draws the track moved or turned as the pointer goes, the track as it was dashed beneath it, and the note at the top of the map says by how much: *BLUE ONE: moving 1.20 nmi 045.0°T*, *BLUE ONE: rotating 12.0° clockwise about 50°20.120'N 004°07.210'W*. Letting go saves it as **one step**. `Escape` before letting go puts it back, and nothing is recorded. What is saved is what the note said: the distance in the analyst's length unit and the bearing or angle, each to the decimals shown.

6. **Steps, named for what was done.** Each operation is one step in the History view, its first note naming it and later notes saying the rest:

    | Operation | Named | Further notes |
    | --- | --- | --- |
    | Move the whole track | *BLUE ONE moved 1.20 nmi 045.0°T* | |
    | Move a period | *BLUE ONE part moved 1.20 nmi 045.0°T* | *Only the fixes from 09:30:00Z to 10:15:00Z* |
    | Rotate | *BLUE ONE rotated 12.0° clockwise* (or *part rotated*) | *About 50°20.120'N 004°07.210'W*, and the period |
    | Split | *BLUE ONE split at 09:30:00Z* | *Into BLUE ONE (1) and BLUE ONE (2)* |
    | Merge | *BLUE ONE and BLUE TWO merged* (or *3 tracks merged*) | *Into BLUE ONE*, and any series not kept |

    Each step's provenance record holds who made it, the track or tracks it chose (`selected`), and what was asked (`parameters`): the distance and bearing, or the angle and the pivot's latitude and longitude, the period's start and end, the time of a split and the names of its parts, or the merged track's name (SUB-24). Undo is replay to the step before, as for any step (SUB-21).

7. **Splitting at a time.** **Split track at current time…** splits the selected track at current time into two: the fixes before it, and the fixes from it on (a fix exactly at the time starts the second part). The parts are offered as *BLUE ONE (1)* and *BLUE ONE (2)*, which the analyst may change. Each keeps the track's colour, platform class, hiding and provenance. The first keeps the track's identity, so a named set or a tool result that refers to the track still does; the second is a new track, listed straight after it, and named sets that held the track hold both. Sensor observations that start at or after the time go with the second part. Observations that run across the time are not cut in two: they stay with the first part, and the step's notes say so (*2087 bearings runs past the split and stays with BLUE ONE (1)*), since those after the time now have a host track that has ended. Each part needs at least two fixes, or nothing is split and the message says how many each side has. Both parts are selected afterwards.

8. **Merging.** **Merge selected tracks** joins two or more selected tracks into one, in time order, whatever order they were selected in. The merged track keeps the earliest's identity, colour and platform class, and is named as the analyst says: offered the earliest's name, or, for the parts of one split track (*BLUE ONE (1)* and *BLUE ONE (2)*), the track's own (*BLUE ONE*); the others go, and sensor observations and named sets that referred to them refer to it. Tracks that overlap in time are **not merged**, and the message says where: *The tracks were not merged: they overlap in time (BLUE ONE and RED ONE from 09:00:00Z to 09:40:00Z). Split or move one so they no longer overlap, then merge them.* (Choosing which track wins where they overlap was considered and left out, to keep merging predictable.) Tracks that only meet, one ending as the next starts, merge. Speeds, courses or depths are kept only if every track has them. Before merging tracks where some have none, Debrief asks (*Merging BLUE ONE, BLUE TWO keeps only what every track has. Courses not kept: BLUE TWO had none. Undo puts them back.*, with **Merge anyway**); the step's notes say which were not kept, and why, and the tool service returns the same in `notes`. The merged track is selected afterwards.

9. **What is a step, and what isn't.**

    | | Step in the history | Undone by `Ctrl+Z` |
    | --- | --- | --- |
    | Letting go of the move or rotate handle | Yes, one | Yes |
    | A run of arrow keys on the move or rotate handle | Yes, one for the run | Yes |
    | Move…, Rotate…, Split…, Merge | Yes, one each | Yes |
    | Dragging or nudging the pivot | No | No |
    | Choosing *Whole track* or *Time window* | No | No |
    | `Escape` during a drag; a move of nothing | No | No |

10. **The keyboard.** `Tab` to a handle. On the move handle the arrow keys move it 5 pixels, 25 with `Shift`; on the rotate handle `Right` and `Up` turn it 1° clockwise, `Left` and `Down` 1° anticlockwise, 10° with `Shift`; on the pivot the arrow keys move it 5 pixels (25 with `Shift`). A run of presses on the move or rotate handle is saved as one step once they stop (under a second), on `Enter`, or when the keyboard moves on; `Escape` first puts it back. Presses made while that step is being saved are not lost: they are made as the next step. *Whole track* and *Time window* are buttons on the map, reached with `Tab`.

11. **The forms.** For an exact change, or without the map:

    - **Move track…** (the outline's context menu on a track; **Move…** under the outline in the playground): what moves (*Whole track* or *Current time window*, with how many fixes it holds), the distance (`1.2 nmi`, `2000 yd`, `3 km`, or a number in the analyst's unit) and the bearing in degrees true (`045`). Each field says what it understood (*Means 1.20 nmi*) or what is wrong.
    - **Rotate track…**: what turns; the pivot (*Fix nearest current time*, *First fix*, *Last fix*, or in VS Code a position typed in any notation Debrief reads); and the angle (`12`, `12 clockwise`, `-12` or `12 anticlockwise`).
    - **Split track at current time…**: the names of the two parts, offered as *X (1)* and *X (2)*.
    - **Merge selected tracks**: the merged track's name, offered as above; first, if speeds, courses or depths would not be kept, whether to merge anyway.

12. **Shared state and conflicts.** Moving, rotating, splitting and merging change neither current time nor the time window. The selection is kept, except that a split selects both parts and a merge the merged track. If the plot changes elsewhere during a drag (a colleague, an agent), the map shows the latest at once, drops the drag and says *The plot was changed elsewhere, so your change was not made. Debrief is showing the latest; try again if you still want to.* A change sent from a plot that has since moved on is refused the same way (SUB-28): track operations are never merged with a change made meanwhile. Context tracks follow the track: the whole moved track is drawn as context outside the window. A hidden track is not drawn, so it has no handles, but it can still be moved, rotated, split and merged from the outline.

13. **For agents.** The same steps through the tool service: `debrief/edit_track` (`feature`, `edit`: a `TrackEdit`, `{"action": "move", "distance": {"value": 1.2, "unit": "[nmi_i]"}, "bearing": {"value": 45, "unit": "deg"}}` or `{"action": "rotate", "angle": {"value": -10, "unit": "deg"}, "pivot": [-4.12, 50.33]}`, with a `period` to move or turn only that; for a rotation with no pivot, `current_time` chooses the default), `debrief/split_track` (`feature`, `at`, and `names` if wanted) and `debrief/merge_tracks` (`features`, and `name` if wanted), each with `base` as for any change. In VS Code the commands `debrief.moveTrack` and `debrief.rotateTrack` take the track and the edit, `debrief.splitTrack` the track and `{at, names}`, and `debrief.mergeTracks` the tracks' ids and `{name}`, instead of asking.

```mermaid
sequenceDiagram
    actor Analyst
    participant Map
    participant Host as Extension host
    participant Service as Tool service
    participant Plot as Plot file
    Analyst->>Map: select BLUE ONE
    Map->>Map: move, rotate and pivot handles
    Analyst->>Map: drag the move handle
    Map->>Map: draw the track moved (geodesic), the old one dashed; "moving 1.20 nmi 045.0°T"
    Analyst->>Map: let go
    Map->>Host: edit_track (feature_id, track_edit: move, distance, bearing, period?)
    Host->>Service: debrief/edit_track (edit, base)
    alt changed elsewhere since base
        Service-->>Host: CONFLICT
        Host->>Map: show_plot (the latest); nothing was changed
    else
        Service->>Plot: one step: "BLUE ONE moved 1.20 nmi 045.0°T", with its parameters
        Service-->>Host: new base
        Host->>Map: show_plot (handles where the track now is)
    end
```

```mermaid
sequenceDiagram
    actor Analyst
    participant Host as Extension host
    participant Service as Tool service
    Analyst->>Host: Split track at current time… (names offered)
    Host->>Service: debrief/split_track (feature, at, names, base)
    Service-->>Host: one step: "BLUE ONE split at 09:30:00Z"; the two parts
    Host->>Host: reload; select both parts
    Analyst->>Host: Merge selected tracks (name offered: BLUE ONE)
    Host->>Service: debrief/merge_tracks (features, name, base)
    alt the tracks overlap in time
        Service-->>Host: refused, saying where they overlap; nothing changed
    else
        Service-->>Host: one step: "BLUE ONE (1) and BLUE ONE (2) merged"
    end
```

## Cleaning tracks

Part B2 (14 Oct 2026). Three ways to tidy a track an analyst has imported, each one recorded step, and none done without the analyst seeing what it would do first.

14. **Jumps: found, shown, then removed.** A jump is a fix the platform could not have reached in time: a GPS glitch, a mistyped position. **Find and remove jumps…** (the outline's menu on a track; **Jumps…** under the outline in the playground) asks for a speed, offered as **three times the track's median speed between fixes, and never less than 10 kn**, which the analyst can change (`30`, `30 kn`, `15 m/s`). Three times the median fits the platform: a helicopter at 120 kn and a submarine at 5 kn each get a threshold far above the changes of speed they really make between fixes; the 10 kn floor stops position noise on a slow or stopped platform being called a jump. A fixed speed (60 kn, say) would miss every jump of a slow platform and flag a fast one's ordinary fixes.

    A fix is a jump when reaching it from the **last good fix before it** needs more than that speed (range along the geodesic over elapsed time; two fixes at one time in different places need infinite speed). Comparing with the last good fix, not simply the fix before, finds a burst of bad fixes in a row; and after a jump a fix is only back on the track when the track goes on from it, so the second of two bad fixes is found even though it is reachable over the longer time since the last good one. Up to 5 fixes in a row can be one jump. A track that goes off and stays off longer than that, or until it ends (a ship at anchor getting under way), is not a jump, since the platform may really be there; nothing is offered. The first fix is a jump when it is far from the next two and they agree; the last likewise.

    What is found is **shown first, never removed silently**: each jump is ringed on the map in the theme's warning colour, the note at the top of the map says *RED ONE: 3 jumps found, each faster than 30.0 kn to reach*, and a list gives each one's time, position and how fast it would have been reached (*09:20:00Z 37°08.456'N 075°26.932'W · 176.5 kn to reach from 09:19:00Z*), all ticked. The analyst unticks any that are real (its ring goes), and **Remove** takes out the rest as **one step**: *RED ONE: 3 jumps removed*, with notes saying when they were (*At 09:20:00Z, 09:21:00Z and 10:40:00Z*), the speed (*Each faster than 30.0 kn to reach*) and any marked fixes that went with them. Cancel, or closing the list, removes nothing. With none found, Debrief says so: *RED ONE: no jumps found faster than 30.0 kn.*

    Removing fixes keeps every series in step: positions, times, speeds, courses, depths and marked fixes lose the same fixes. A track keeps at least two fixes.

15. **Smoothing: previewed, then applied.** **Smooth track…** (**Smooth…** in the playground) asks what to smooth (the whole track, or its fixes in the time window, as for a move) and over how many fixes: an odd number, 5 unless the analyst says, *each fix averaged with the 2 either side of it*. One method, a moving average, chosen because an analyst can say exactly what it did: each fix moves to the average position of itself and the same number of fixes either side, worked out in a flat frame centred on that fix (ranges and bearings from it, along geodesics), so it is right far north and across the antimeridian. Near the ends of what is smoothed the window narrows evenly, so **the first and last fixes never move** and nothing is pulled sideways; fixes outside the period stay where they are. **Times never change**, so the fixes stay in time order. Recorded courses and speeds are averaged over the same fixes (courses as directions, so 350° and 010° average to 000°), so they stay in step with the positions; depths are kept. Simplifying a track (dropping fixes, as Douglas-Peucker does) is a different operation, not offered: it loses fixes rather than moving them.

    Before anything changes, the track as smoothing would leave it is drawn dashed in the theme's focus colour over the track as it is, and the note says what it would do: *RED ONE smoothed over 5 fixes, if applied: 236 fixes moved; the most a fix moved: 0.06 nmi, at 09:22:00Z.* **Apply** makes it **one step**, *RED ONE smoothed over 5 fixes* (or *RED ONE part smoothed…*), its notes saying how many fixes moved and the most any moved, and the period. Cancel changes nothing. A track smoothing would not move (a straight, steady one) says so and records nothing.

16. **Marked fixes: a colour, a label or a comment of their own.** Legacy plots let an analyst colour single fixes, label them and comment on them, and the .dpf import used to list those as not imported. Now a fix can carry any of the three:

    | | On the map | Elsewhere |
    | --- | --- | --- |
    | Colour | a dot at the fix in that colour, and the line from it to the next fix drawn in it | the fix list |
    | Label | the text beside the fix, as a track's name is | the fix list |
    | Comment | shown when pointing at the fix, with its time, position, course and speed | the fix list, and the **Timeline**, at the fix's time, as *RED ONE fix* |

    A fix with only a label or a comment is a ring in the track's colour, so it can be pointed at. To mark a fix: **right-click it on the map**, or open the **fix list** (**Fixes: colour, label or comment…** on the outline's menu; **Fixes…** in the playground), which lists every fix of the track in time order with its time, position, course, speed and any mark, and choose one; then **Colour…** (the track colours, amber and yellow), **Label…** or **Comment…**. An empty label or comment, or *Track's colour*, takes it away. Each change is **one step**: *RED ONE fix at 09:31:00Z coloured yellow*, *… labelled 'Turn 1'*, *…: comment added* (or *changed*, *removed*); a long label is shortened in the step's name and kept whole.

    A mark is kept with the track, **found by its fix's time**, not its place in the track (see the schema's `FixMark`). So it stays with its fix whatever happens to the rest: jumps removed before it, the track moved, rotated, smoothed, split (each part keeps its own marks) or merged. Where two fixes share a time, the mark is the first's; merging two tracks that meet at a time where both have a marked fix keeps the earlier track's, and the step's notes say so. Only marked fixes are listed, so a track of 10,000 fixes with three marked carries three marks, and the plot is still plain GeoJSON to other tools.

    **From legacy plots.** The .dpf import keeps each fix's own colour (where it differs from the track's), its label and its comment as marks. Legacy Debrief labels every fix with its time unless told otherwise; a label that only gives the fix's time (`0504`, `120500`) is not imported, and the import says how many, since Debrief shows fixes' times itself. A label hidden in the legacy plot is imported and shown, and the import says how many. Where on the fix a legacy label went, and fix symbols and arrows, are still listed as not imported (EXT-15).

17. **What is a step, and what isn't.**

    | | Step in the history | Undone by `Ctrl+Z` |
    | --- | --- | --- |
    | Remove the jumps ticked | Yes, one for all of them | Yes |
    | Apply smoothing | Yes, one | Yes |
    | A fix coloured, labelled or commented on | Yes, one each | Yes |
    | Finding jumps; unticking one; a smoothing preview; Cancel | No | No |
    | Choosing a fix in the fix list | No | No |

18. **The keyboard.** Everything here has a keyboard path: the commands and their input boxes and lists in VS Code; in the playground, the buttons under the outline, the form, the list of jumps (checkboxes) and the fix list (`Up` and `Down` move along it, `Enter` or `Space` chooses a fix). Right-clicking a fix on the map is a shortcut, never the only way.

19. **Shared state and conflicts.** None of these changes current time, the time window or the selection (choosing a fix in the playground's fix list selects its track). A change sent from a plot that has since moved on is refused, as any change is (SUB-28), and Debrief shows the latest; jumps found or smoothing previewed on a plot that has changed must be found or previewed again.

20. **For agents.** The same through the tool service: `debrief/find_jumps` (`feature`; `threshold`, a speed such as `{"value": 30, "unit": "[kn_i]"}`, and `period`, if wanted) returns the threshold used, the track's median speed and the jumps (time, position, speed to reach, the fix it was reached from) and changes nothing; `debrief/remove_jumps` (`feature`, `times`, and the `threshold` for the record) removes them as one step. `debrief/preview_smoothing` (`feature`, `window`, `period`) returns the track as it would be and how far fixes would move, and changes nothing; `debrief/smooth_track` applies it. `debrief/mark_fix` (`feature`, `time`, `changes`: any of `colour`, `label`, `comment`, null or empty taking one away; `colour_name` for the step's name). Each change takes `base` as for any change. In VS Code, `debrief.removeJumps` takes the track and `{threshold, times}` (`times: "all"` removes every jump found; no `times` only finds them and rings them on the map), `debrief.smoothTrack` the track and `{window, period, apply}` (`apply: false` leaves the preview on the map), and `debrief.markFix` the track, the fix's time and the changes, instead of asking.

```mermaid
sequenceDiagram
    actor Analyst
    participant Host as Extension host
    participant Map
    participant Service as Tool service
    Analyst->>Host: Find and remove jumps… (threshold offered: 3 × median, at least 10 kn)
    Host->>Service: debrief/find_jumps (feature, threshold, base)
    Service-->>Host: the jumps; nothing changed
    Host->>Map: show_fixes (feature_id, fix_times, message)
    Map->>Map: ring each jump; "RED ONE: 3 jumps found…"
    Host->>Analyst: the list, all ticked
    Analyst->>Host: untick one; Remove
    Host->>Service: debrief/remove_jumps (feature, times, threshold, base)
    alt changed elsewhere since base
        Service-->>Host: CONFLICT; nothing changed
    else
        Service-->>Host: one step: "RED ONE: 2 jumps removed"
    end
    Host->>Map: show_fixes (nothing): the rings go
```

## Reference implementation

- **Schema (0.0.14):** `TrackEdit` and `TrackEditActionEnum` in `schemas/linkml/features.yaml`; the message `edit_track` (`feature_id`, `track_edit`) in `schemas/linkml/messages.yaml`; the rules in `debrief_schemas.documents.track_edit_problems` and `vscode/src/messages.ts`; fixtures `webview_message/valid/edit-track-*.json` and the `edit-track-*` invalid ones.
- **Making and naming changes:** `debrief_stac.tracks` (`moved`, `rotated`, `default_pivot`, `split`, `merge`, `overlaps`, the step names); `Catalogue.edit_track`, `split_track` and `merge_tracks`; the service methods in `debrief_tools.service`.
- **The map:** what a drag or an arrow key makes, the readouts, the handles' places and a run of presses in `vscode/webview/trackedit.ts` (free of Leaflet, unit-tested); the handles, preview and keyboard in `vscode/webview/trackmap.ts`; the host side in `vscode/src/panels/map.ts` (`receive`) and the command `debrief.editTrack`.
- **VS Code:** the commands `debrief.moveTrack`, `debrief.rotateTrack`, `debrief.splitTrack` and `debrief.mergeTracks` in `vscode/src/extension.ts`, on the outline's context menu for a track.
- **The playground:** `vscode/play/host.ts` (the buttons and the small forms) and `track` in `vscode/play/play.py`.
- **Tests:** `python/debrief-stac/tests/test_tracks.py` (geodesic moves and rotations, far north and across the antimeridian; periods; split and merge invariants; undo; conflicts), the service test, `vscode/test/unit/trackedit.test.ts`, the playground test's `vscode/test/play/tracks.mjs` (drag, Escape, undo, rotate, keyboard runs, a period, a colleague's change during a drag, split, merge, an overlap refused, the forms), and the integration test's track steps.
- **Cleaning tracks (part B2):** schema 0.0.15's `FixMark` and `fix_marks` in `schemas/linkml/features.yaml`, the messages `show_fixes` and `fix_chosen`, the rules in `debrief_schemas.documents`; `debrief_stac.fixes` (finding jumps, the default threshold, removing fixes with every series in step, smoothing, marks and the step names), marks carried through `split` and `merge` in `debrief_stac.tracks`; `Catalogue.find_jumps`, `remove_jumps`, `smoothing_preview`, `smooth_track` and `mark_fix`; the service's `debrief/find_jumps`, `debrief/remove_jumps`, `debrief/preview_smoothing`, `debrief/smooth_track` and `debrief/mark_fix`; the .dpf mapping in `debrief_io.dpf_import` (`_fix_marks`); `vscode/webview/fixes.ts` (free of Leaflet: the fix list's rows, reading a threshold and a window, the words); the map's marks, rings and preview in `vscode/webview/map.ts`; the commands `debrief.removeJumps`, `debrief.smoothTrack` and `debrief.markFix` in `vscode/src/extension.ts`; the Timeline's fix comments in `vscode/src/timeline.ts`; the playground's **Jumps…**, **Smooth…** and **Fixes…** (`vscode/play/host.ts`, `clean` and `glitches` in `play.py`). Tests: `python/debrief-stac/tests/test_fixes.py`, the service test, `python/debrief-io/tests/test_dpf_import.py`, `vscode/test/unit/fixes.test.ts`, the playground test's `vscode/test/play/cleaning.mjs`, and the integration test's cleaning steps.

*Not yet (part B and later):* dragging single fixes; OTG and DR modes; simplifying a track (dropping fixes); where on a fix a label goes, and fix symbols and arrows; stretching and shearing (the TMA module's, CAP-21); choosing which track wins where merged tracks overlap; renaming a track on its own.
