# Track operations

How an analyst moves a track, or a period of it, rotates it about a point, splits it at a time and merges tracks into one. Part A: moving, rotating, splitting and merging (decision, product owner, 13 Oct 2026). Part B, still to come: jump removal, smoothing, dragging single fixes, and the legacy OTG and DR import modes.

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
| PRN-08 | The analyst owns the data: a track is moved where the analyst says, without second-guessing. |

## Model

1. **What moves: the whole track, or a period of it.** Legacy Debrief dragged a whole track, or a selected time period of it, to line it up with a reference: that is kept (decision, 13 Oct 2026). On the map, a small control below the drawing toolbar, *Move or rotate*, says which: **Whole track** (the default) or **Time window**, the fixes in the time window shown. The forms offer the same choice. An agent may give any period. Fixes whose times fall in the period, ends included, move; the rest stay where they are.

2. **The joins jump.** Moving a period moves only its fixes, so the track jumps where they meet the rest: the track is not stretched or smoothed to keep it continuous. The map shows the jump while the analyst drags, and says so: *only the fixes in the time window move, so the track jumps where they meet the rest*. Jump removal (part B) will tidy a join an analyst does not want.

3. **Moving is geodesic.** A move takes every fix the same range along the same true bearing, each along its own geodesic: not a change of latitude and longitude, as an annotation's whole-shape move is. Over a few miles in mid-latitudes the two agree to a few metres; far north, or over a long move, a change of latitude and longitude would stretch or squeeze the track, and this does not. Courses and speeds over ground are kept as they were.

4. **Rotating is geodesic.** A rotation keeps each fix's range from the pivot and turns its bearing from the pivot by the angle; clockwise is positive. Courses over ground of the fixes turned are turned by the same angle. The pivot is, unless the analyst chooses, the fix nearest current time, when current time is within what moves; otherwise the first fix of what moves. On the map the pivot is a handle of its own: drag it (or move it with the arrow keys) to turn about somewhere else. Moving the pivot records nothing; it says where the next rotation turns about.

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

7. **Splitting at a time.** **Split track at current time…** splits the selected track at current time into two: the fixes before it, and the fixes from it on (a fix exactly at the time starts the second part). The parts are offered as *BLUE ONE (1)* and *BLUE ONE (2)*, which the analyst may change. Each keeps the track's colour, platform class, hiding and provenance. The first keeps the track's identity, so a named set or a tool result that refers to the track still does; the second is a new track, listed straight after it, and named sets that held the track hold both. Sensor observations that start at or after the time go with the second part. Each part needs at least two fixes, or nothing is split and the message says how many each side has. Both parts are selected afterwards.

8. **Merging.** **Merge selected tracks** joins two or more selected tracks into one, in time order, whatever order they were selected in. The merged track keeps the earliest's identity, name, colour and platform class; the others go, and sensor observations and named sets that referred to them refer to it. Tracks that overlap in time are **not merged**, and the message says where: *The tracks were not merged: they overlap in time (BLUE ONE and RED ONE from 09:00:00Z to 09:40:00Z). Split or move one so they no longer overlap, then merge them.* (Choosing which track wins where they overlap was considered and left out, to keep merging predictable.) Tracks that only meet, one ending as the next starts, merge. Speeds, courses or depths are kept only if every track has them; otherwise the step's notes say which were not kept, and why. The merged track is selected afterwards.

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
    - **Merge selected tracks**: no questions.

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
    Analyst->>Host: Merge selected tracks
    Host->>Service: debrief/merge_tracks (features, base)
    alt the tracks overlap in time
        Service-->>Host: refused, saying where they overlap; nothing changed
    else
        Service-->>Host: one step: "BLUE ONE (1) and BLUE ONE (2) merged"
    end
```

## Reference implementation

- **Schema (0.0.14):** `TrackEdit` and `TrackEditActionEnum` in `schemas/linkml/features.yaml`; the message `edit_track` (`feature_id`, `track_edit`) in `schemas/linkml/messages.yaml`; the rules in `debrief_schemas.documents.track_edit_problems` and `vscode/src/messages.ts`; fixtures `webview_message/valid/edit-track-*.json` and the `edit-track-*` invalid ones.
- **Making and naming changes:** `debrief_stac.tracks` (`moved`, `rotated`, `default_pivot`, `split`, `merge`, `overlaps`, the step names); `Catalogue.edit_track`, `split_track` and `merge_tracks`; the service methods in `debrief_tools.service`.
- **The map:** what a drag or an arrow key makes, the readouts, the handles' places and a run of presses in `vscode/webview/trackedit.ts` (free of Leaflet, unit-tested); the handles, preview and keyboard in `vscode/webview/trackmap.ts`; the host side in `vscode/src/panels/map.ts` (`receive`) and the command `debrief.editTrack`.
- **VS Code:** the commands `debrief.moveTrack`, `debrief.rotateTrack`, `debrief.splitTrack` and `debrief.mergeTracks` in `vscode/src/extension.ts`, on the outline's context menu for a track.
- **The playground:** `vscode/play/host.ts` (the buttons and the small forms) and `track` in `vscode/play/play.py`.
- **Tests:** `python/debrief-stac/tests/test_tracks.py` (geodesic moves and rotations, far north and across the antimeridian; periods; split and merge invariants; undo; conflicts), the service test, `vscode/test/unit/trackedit.test.ts`, the playground test's `vscode/test/play/tracks.mjs` (drag, Escape, undo, rotate, keyboard runs, a period, a colleague's change during a drag, split, merge, an overlap refused, the forms), and the integration test's track steps.

*Not yet (part B and later):* dragging single fixes; jump removal; smoothing; OTG and DR modes; stretching and shearing (the TMA module's, CAP-21); choosing which track wins where merged tracks overlap; renaming a track on its own.
