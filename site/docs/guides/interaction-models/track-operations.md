# Track operations

How an analyst moves a track, or a period of it, rotates it about a point, shears or stretches it from one end, splits it at a time and merges tracks into one. Part A: moving, rotating, splitting and merging (decision, product owner, 13 Oct 2026). Part B1: shearing and stretching, shear first as the operation analysts use most with TMA legs (decision, product owner, 13 Oct 2026; see [Shearing and stretching](#shearing-and-stretching)). Still to come: jump removal, smoothing, dragging single fixes, and the legacy OTG and DR import modes.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-01 | Dragging, splitting, merging, jump removal and smoothing of tracks. |
| CAP-02 | Track edits are destructive in the working plot, each recorded as a delta. |
| CAP-21 | The TMA module's manual dragging of a solution: translate, rotate, stretch, shear. |
| SUB-19, SUB-21 | Every change is a recorded step; undo is replay to a point, never an inverse operation. |
| SUB-24 | Provenance records who made each change, and what they asked for. |
| SUB-03, SUB-04 | Measured along geodesics; read and shown in the analyst's units and notation. |
| SUB-26, SUB-28 | Moving a track changes neither current time, the window nor the selection; a change made elsewhere is never overwritten. |
| NFR-13 | Dragging a track has a keyboard and a form-based equivalent. |
| PRN-08 | The analyst owns the data: a track is moved where the analyst says, without second-guessing. |

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
    | Ends | a diamond beside the first fix and one beside the last fix of what moves (a double edge when *Stretch* is chosen) | drag one to shear the track, or stretch it, holding the other end ([below](#shearing-and-stretching)) |

    Dragging the move or rotate handle draws the track moved or turned as the pointer goes, the track as it was dashed beneath it, and the note at the top of the map says by how much: *BLUE ONE: moving 1.20 nmi 045.0°T*, *BLUE ONE: rotating 12.0° clockwise about 50°20.120'N 004°07.210'W*. Letting go saves it as **one step**. `Escape` before letting go puts it back, and nothing is recorded. What is saved is what the note said: the distance in the analyst's length unit and the bearing or angle, each to the decimals shown.

6. **Steps, named for what was done.** Each operation is one step in the History view, its first note naming it and later notes saying the rest:

    | Operation | Named | Further notes |
    | --- | --- | --- |
    | Move the whole track | *BLUE ONE moved 1.20 nmi 045.0°T* | |
    | Move a period | *BLUE ONE part moved 1.20 nmi 045.0°T* | *Only the fixes from 09:30:00Z to 10:15:00Z* |
    | Rotate | *BLUE ONE rotated 12.0° clockwise* (or *part rotated*) | *About 50°20.120'N 004°07.210'W*, and the period |
    | Split | *BLUE ONE split at 09:30:00Z* | *Into BLUE ONE (1) and BLUE ONE (2)* |
    | Merge | *BLUE ONE and BLUE TWO merged* (or *3 tracks merged*) | *Into BLUE ONE*, and any series not kept |
    | Shear | *BLUE ONE sheared: 087.2°T 12.4 kn* (or *part sheared*) | *Held at the start, 09:30:00Z*, *Was 090.0°T 10.0 kn*, and the period |
    | Stretch | *BLUE ONE stretched: 12.4 kn* (or *part stretched*) | *Held at the end, 10:15:00Z*, *Was 10.0 kn*, and the period |

    Each step's provenance record holds who made it, the track or tracks it chose (`selected`), and what was asked (`parameters`): the distance and bearing, or the angle and the pivot's latitude and longitude, the period's start and end, the time of a split and the names of its parts, or the merged track's name (SUB-24). Undo is replay to the step before, as for any step (SUB-21).

7. **Splitting at a time.** **Split track at current time…** splits the selected track at current time into two: the fixes before it, and the fixes from it on (a fix exactly at the time starts the second part). The parts are offered as *BLUE ONE (1)* and *BLUE ONE (2)*, which the analyst may change. Each keeps the track's colour, platform class, hiding and provenance. The first keeps the track's identity, so a named set or a tool result that refers to the track still does; the second is a new track, listed straight after it, and named sets that held the track hold both. Sensor observations that start at or after the time go with the second part. Observations that run across the time are not cut in two: they stay with the first part, and the step's notes say so (*2087 bearings runs past the split and stays with BLUE ONE (1)*), since those after the time now have a host track that has ended. Each part needs at least two fixes, or nothing is split and the message says how many each side has. Both parts are selected afterwards.

8. **Merging.** **Merge selected tracks** joins two or more selected tracks into one, in time order, whatever order they were selected in. The merged track keeps the earliest's identity, colour and platform class, and is named as the analyst says: offered the earliest's name, or, for the parts of one split track (*BLUE ONE (1)* and *BLUE ONE (2)*), the track's own (*BLUE ONE*); the others go, and sensor observations and named sets that referred to them refer to it. Tracks that overlap in time are **not merged**, and the message says where: *The tracks were not merged: they overlap in time (BLUE ONE and RED ONE from 09:00:00Z to 09:40:00Z). Split or move one so they no longer overlap, then merge them.* (Choosing which track wins where they overlap was considered and left out, to keep merging predictable.) Tracks that only meet, one ending as the next starts, merge. Speeds, courses or depths are kept only if every track has them. Before merging tracks where some have none, Debrief asks (*Merging BLUE ONE, BLUE TWO keeps only what every track has. Courses not kept: BLUE TWO had none. Undo puts them back.*, with **Merge anyway**); the step's notes say which were not kept, and why, and the tool service returns the same in `notes`. The merged track is selected afterwards.

9. **What is a step, and what isn't.**

    | | Step in the history | Undone by `Ctrl+Z` |
    | --- | --- | --- |
    | Letting go of the move or rotate handle | Yes, one | Yes |
    | A run of arrow keys on the move or rotate handle | Yes, one for the run | Yes |
    | Letting go of an end, to shear or stretch | Yes, one | Yes |
    | A run of arrow keys on an end | Yes, one for the run | Yes |
    | Move…, Rotate…, Shear…, Stretch…, Split…, Merge | Yes, one each | Yes |
    | Dragging or nudging the pivot | No | No |
    | Choosing *Whole track* or *Time window*, or *Shear* or *Stretch* | No | No |
    | `Escape` during a drag; a move of nothing | No | No |

10. **The keyboard.** `Tab` to a handle. On the move handle the arrow keys move it 5 pixels, 25 with `Shift`; on the rotate handle `Right` and `Up` turn it 1° clockwise, `Left` and `Down` 1° anticlockwise, 10° with `Shift`; on the pivot the arrow keys move it 5 pixels (25 with `Shift`). A run of presses on the move or rotate handle is saved as one step once they stop (under a second), on `Enter`, or when the keyboard moves on; `Escape` first puts it back. Presses made while that step is being saved are not lost: they are made as the next step. *Whole track* and *Time window* are buttons on the map, reached with `Tab`, as are *Shear* and *Stretch*. The ends are described [below](#shearing-and-stretching).

11. **The forms.** For an exact change, or without the map:

    - **Move track…** (the outline's context menu on a track; **Move…** under the outline in the playground): what moves (*Whole track* or *Current time window*, with how many fixes it holds), the distance (`1.2 nmi`, `2000 yd`, `3 km`, or a number in the analyst's unit) and the bearing in degrees true (`045`). Each field says what it understood (*Means 1.20 nmi*) or what is wrong.
    - **Rotate track…**: what turns; the pivot (*Fix nearest current time*, *First fix*, *Last fix*, or in VS Code a position typed in any notation Debrief reads); and the angle (`12`, `12 clockwise`, `-12` or `12 anticlockwise`).
    - **Split track at current time…**: the names of the two parts, offered as *X (1)* and *X (2)*.
    - **Merge selected tracks**: the merged track's name, offered as above; first, if speeds, courses or depths would not be kept, whether to merge anyway.
    - **Shear track…** and **Stretch track…**: [below](#shearing-and-stretching).

12. **Shared state and conflicts.** Moving, rotating, splitting and merging change neither current time nor the time window. The selection is kept, except that a split selects both parts and a merge the merged track. If the plot changes elsewhere during a drag (a colleague, an agent), the map shows the latest at once, drops the drag and says *The plot was changed elsewhere, so your change was not made. Debrief is showing the latest; try again if you still want to.* A change sent from a plot that has since moved on is refused the same way (SUB-28): track operations are never merged with a change made meanwhile. Context tracks follow the track: the whole moved track is drawn as context outside the window. A hidden track is not drawn, so it has no handles, but it can still be moved, rotated, split and merged from the outline.

13. **For agents.** The same steps through the tool service: `debrief/edit_track` (`feature`, `edit`: a `TrackEdit`, `{"action": "move", "distance": {"value": 1.2, "unit": "[nmi_i]"}, "bearing": {"value": 45, "unit": "deg"}}` or `{"action": "rotate", "angle": {"value": -10, "unit": "deg"}, "pivot": [-4.12, 50.33]}`, with a `period` to move or turn only that; for a rotation with no pivot, `current_time` chooses the default), `debrief/split_track` (`feature`, `at`, and `names` if wanted) and `debrief/merge_tracks` (`features`, and `name` if wanted), each with `base` as for any change. Shears and stretches go through `debrief/edit_track` too ([below](#shearing-and-stretching)). In VS Code the commands `debrief.moveTrack`, `debrief.rotateTrack`, `debrief.shearTrack` and `debrief.stretchTrack` take the track and the edit, `debrief.splitTrack` the track and `{at, names}`, and `debrief.mergeTracks` the tracks' ids and `{name}`, instead of asking.

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

## Shearing and stretching

Part B1 (decision, product owner, 13 Oct 2026): **shear is the operation analysts use most when working with TMA legs**, so it comes first, with stretch beside it. A target's leg is a straight line run at a steady speed; the analyst keeps one end where the bearings put it and changes the course and speed of the rest. Both are legacy Debrief's TMA drags (CAP-21), here on any track.

1. **One end is held.** What changes is the whole track or only its fixes in the time window, chosen with the same *Whole track* and *Time window* control. One end of it, its first fix or its last, is **held** (the anchor) and does not move; the analyst drags the other end. Dragging the end at the start holds the end, and the other way round.

2. **Shear: every fix moves in proportion to its time from the held end.** Say the held fix is A, at time t<sub>A</sub>, and the dragged end E, at time t<sub>E</sub>, is dragged to E′. A fix at time t moves by the fraction f = (t − t<sub>A</sub>) / (t<sub>E</sub> − t<sub>A</sub>) of the end's move: not at all at the held end, the whole of it at the dragged end, half of it halfway in time. A straight leg at a steady speed stays a straight leg at a steady speed, with a new course and a new speed: they change together, as in legacy Debrief's TMA shear.

    <svg viewBox="0 0 320 160" width="320" height="160" role="img" aria-label="A straight leg from A to E, held at A; E dragged to E-prime; each fix moves part of the way, in proportion to its time from A, so the leg is still straight" style="max-width: 100%">
      <g fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="30" y1="130" x2="290" y2="90" stroke-dasharray="5 4" opacity="0.6"/>
        <line x1="30" y1="130" x2="290" y2="30"/>
        <line x1="117" y1="117" x2="117" y2="97" stroke-dasharray="2 3"/>
        <line x1="203" y1="103" x2="203" y2="63" stroke-dasharray="2 3"/>
        <line x1="290" y1="90" x2="290" y2="36" stroke-dasharray="2 3"/>
      </g>
      <g fill="currentColor">
        <circle cx="30" cy="130" r="4"/>
        <circle cx="117" cy="117" r="2.5" opacity="0.6"/><circle cx="203" cy="103" r="2.5" opacity="0.6"/><circle cx="290" cy="90" r="2.5" opacity="0.6"/>
        <circle cx="117" cy="97" r="3"/><circle cx="203" cy="63" r="3"/><circle cx="290" cy="30" r="3"/>
        <text x="20" y="150" font-size="12">A, held</text>
        <text x="296" y="94" font-size="12">E</text>
        <text x="296" y="34" font-size="12">E′</text>
        <text x="122" y="132" font-size="11">⅓ of the move</text>
        <text x="150" y="58" font-size="11">⅔</text>
      </g>
    </svg>

    *Dashed: the leg as it was. Solid: sheared. Each fix moves the part of E's move that its time is of the leg's.*

3. **Measured on the earth, from the held end.** The move is taken in the frame centred on the held fix in which each position is placed by its range and true bearing from it (an azimuthal equidistant projection): there, a geodesic through the held fix is a straight line, and ranges from it are exact. So a straight leg through the held end (a geodesic, run at a steady speed) stays exactly straight after a shear, at any latitude and across the antimeridian. We considered moving each fix the fraction f of the end's range along the end's bearing, as a move does; but over a leg the meridians close in, the same bearing points slightly differently at each fix, and the sheared leg would bend (by tens of metres over a 10 nmi leg at 50° north). The tests check legs at 50°N, at 84°N and across the antimeridian.

4. **Stretch: only the speed changes.** With *Stretch* chosen, only how far the end is dragged along the line from the held end counts: the drag is taken onto that line. Every fix keeps its bearing from the held end and its range from it is multiplied by one factor, the new range of the dragged end over its old one. A straight leg stays on its line, at the new speed, on the same course; a track that turns keeps its shape, larger or smaller about the held end, and every speed changes by the same factor. A stretch never goes to nothing or past the held end: the slowest it offers is one step of speed (0.1 kn).

5. **Recorded courses and speeds go with the fixes.** Each fix's recorded course and speed are carried through the same change rather than worked out again from the new positions: Debrief follows the fix's recorded course and speed for ten seconds, changes that point as a fix at that time would be changed, and takes the new course and speed from the changed fix to it. So a shear adds the leg's change of velocity to each fix's own (a fix logged at 000 at 10 kn on a leg that gains 10 kn east is now 045 at 14.1 kn), and a stretch multiplies each speed by the factor and keeps each course. On a straight steady leg every fix's course and speed become exactly the leg's new ones; on a real track the detail recorded at each fix survives instead of being replaced by the jitter of the positions. A track that records courses but not speeds, or speeds but not courses, has the missing one taken from its positions for the purpose; what it does not record stays unrecorded.

6. **Course and speed made good.** What the map and the step say: the true bearing, at the first fix of what changes, of the geodesic from it to the last fix, and the range between them over the time between. For a straight steady leg these are its course and speed.

7. **The ends on the map.** A track selected on its own shows a diamond beside its first and last fixes of what changes, in the theme's focus colour, drawn to the left of the way the track goes so they are clear of the pivot (often on an end) and the rotate handle (beyond the far end, on the line of a straight leg). Below *Move or rotate*, the control's *Drag the ends* says what dragging one does: **Shear** (the default) or **Stretch**, which gives the diamonds a double edge. Each is named for a screen reader: *BLUE ONE: shear from the end, holding the start; drag it, or use the arrow keys*; *BLUE ONE: stretch from the start, holding the end; drag it along the track, or use Up and Down to change speed*. We chose a switch on the map over a modifier key (`Shift`-drag), which nobody can see and which is awkward from the keyboard, and over separate stretch handles, which would put four diamonds on a short leg; legacy Debrief, too, chose the drag first and then dragged.

8. **What the map says.** Dragging an end draws the track changed as the pointer goes, the track as it was dashed beneath, and says *BLUE ONE: shearing to 087.2°T 12.4 kn; end moved 1.20 nmi 045.0°T*, or *BLUE ONE: stretching to 12.4 kn (was 10.0 kn)*; with *Time window*, it adds that the track jumps where the window's fixes meet the rest. Letting go is **one step**; `Escape` first puts it back. What is saved is what the map said: the end's move in the analyst's length unit and its bearing, or the speed, each to the decimals shown.

9. **The step.** *BLUE ONE sheared: 087.2°T 12.4 kn* or *BLUE ONE stretched: 12.4 kn* (*part sheared* for the fixes in a period), then *Held at the start, 09:30:00Z*, *Was 090.0°T 10.0 kn* (or *Was 10.0 kn*) and the period. Its provenance record holds the end held (`anchor`), the times of the held and dragged ends (`anchor_time`, `dragged_time`), how far and which way the dragged end went (`distance`, `bearing`), and the course and speed made good (`course`, `speed`): as asked where they were asked, worked out where they were not. Undo is replay to the step before, as for any step.

10. **The keyboard.** `Tab` to an end. Shearing, the arrow keys move it 5 pixels (25 with `Shift`), as the move handle. Stretching, `Up` and `Right` make it one step of speed faster (0.1 kn, or one step of the analyst's speed decimals), `Down` and `Left` one step slower, ten with `Shift`. A run of presses is one step, saved once they stop, on `Enter` or when the keyboard moves on; `Escape` puts it back; presses made while the last step is saved are kept for the next. *Shear* and *Stretch* are buttons on the map, reached with `Tab`.

11. **The forms.** **Shear track…** (the outline's context menu on a track; **Shear…** under the outline in the playground) asks what changes, which end is held (*Hold the start* or *Hold the end*), and the course and speed it then makes good, offering what it makes good now; a speed may be typed `12.4`, `12.4 kn`, `6 m/s` or `20 km/h`, and each field says what it understood. Held at the start, the dragged end goes the speed times the period's length along the course; held at the end, Debrief finds the start from which the geodesic to the held end sets off on the course asked. **Stretch track…** asks what changes, which end is held, and the speed, which must be more than nothing.

12. **What is refused, and why.** A shear or a stretch of fixes all at one time: *BLUE ONE has fixes at only one time there, so it cannot be sheared or stretched: that needs fixes at two times.* A stretch of fixes that end where they start: *… so it cannot be stretched: shear it instead.* A stretch to no speed. A shear, holding the end, to a course and speed that no leg ending at the held fix makes good, as can happen near a pole: *… cannot make good 180.0°T at 25.0 kn and end where it does: no leg that long sets off on that course to its last fix. Hold the start instead.* A change sent from a plot that has since changed is refused, as for any change (SUB-28), and a drag under way when the plot changes elsewhere is dropped and the map says so.

13. **For agents.** `debrief/edit_track` with `{"action": "shear", "anchor": "start", "distance": {"value": 1.2, "unit": "[nmi_i]"}, "bearing": {"value": 45, "unit": "deg"}}` (the dragged end's move), `{"action": "shear", "anchor": "end", "course": {"value": 87.2, "unit": "deg"}, "speed": {"value": 12.4, "unit": "[kn_i]"}}` (the course and speed made good), or `{"action": "stretch", "anchor": "start", "speed": {"value": 12.4, "unit": "[kn_i]"}}`, each with a `period` to change only that. In VS Code, `debrief.shearTrack` and `debrief.stretchTrack` take the track and the edit, without `action`, instead of asking.

*Not in this part:* live bearing residuals while dragging, and solutions rooted in a period of bearings (the TMA module, CAP-21); shearing one leg of a multi-leg solution apart from the others.

## Reference implementation

- **Schema (0.0.14; 0.0.15 adds shear and stretch):** `TrackEdit`, `TrackEditActionEnum` and `TrackEditAnchorEnum` in `schemas/linkml/features.yaml`; the message `edit_track` (`feature_id`, `track_edit`) in `schemas/linkml/messages.yaml`; the rules in `debrief_schemas.documents.track_edit_problems` and `vscode/src/messages.ts`; fixtures `webview_message/valid/edit-track-*.json` and the `edit-track-*` invalid ones.
- **Making and naming changes:** `debrief_stac.tracks` (`moved`, `rotated`, `default_pivot`, `AnchorFrame`, `sheared`, `stretched`, `shear_target`, `leg_of`, `split`, `merge`, `overlaps`, the step names); `Catalogue.edit_track`, `split_track` and `merge_tracks`; the service methods in `debrief_tools.service`.
- **The map:** what a drag or an arrow key makes, the readouts, the handles' places and a run of presses in `vscode/webview/trackedit.ts` (free of Leaflet, unit-tested); the handles, preview and keyboard in `vscode/webview/trackmap.ts`; the host side in `vscode/src/panels/map.ts` (`receive`) and the command `debrief.editTrack`.
- **VS Code:** the commands `debrief.moveTrack`, `debrief.rotateTrack`, `debrief.shearTrack`, `debrief.stretchTrack`, `debrief.splitTrack` and `debrief.mergeTracks` in `vscode/src/extension.ts`, on the outline's context menu for a track.
- **The playground:** `vscode/play/host.ts` (the buttons and the small forms) and `track` in `vscode/play/play.py`.
- **Tests:** `python/debrief-stac/tests/test_tracks.py` (geodesic moves and rotations, far north and across the antimeridian; periods; split and merge invariants; undo; conflicts), the service test, `vscode/test/unit/trackedit.test.ts`, the playground test's `vscode/test/play/tracks.mjs` (drag, Escape, undo, rotate, keyboard runs, a period, a colleague's change during a drag, split, merge, an overlap refused, the forms), the playground test's `vscode/test/play/shear.mjs` (a straight leg sheared and stretched by its ends, Escape, undo, the keyboard, the forms), and the integration test's track steps.

*Not yet (part B and later):* dragging single fixes; jump removal; smoothing; OTG and DR modes; live bearing residuals while shearing or stretching (the TMA module, CAP-21); choosing which track wins where merged tracks overlap; renaming a track on its own.
