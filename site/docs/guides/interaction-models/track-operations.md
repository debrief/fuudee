# Track operations

How an analyst moves a track, or a period of it, rotates it about a point, shears or stretches it from one end, splits it at a time and merges tracks into one; and how they clean it: removing jumps, smoothing it, and giving single fixes a colour, a label or a comment of their own. Part A: moving, rotating, splitting and merging (decision, product owner, 13 Oct 2026). Part B1: shearing and stretching, shear first as the operation analysts use most with TMA legs (decision, product owner, 13 Oct 2026; see [Shearing and stretching](#shearing-and-stretching)). [Cleaning tracks](#cleaning-tracks) (part B2, 14 Oct 2026): jump removal, smoothing and marked fixes. [Single fixes, and dead reckoning](#single-fixes-and-dead-reckoning) (part B3, 14 Oct 2026): one fix dragged on its own, and the legacy OTG and DR modes, asked of each track imported. [Editing a track plotted by dead reckoning](#editing-a-track-plotted-by-dead-reckoning) (decision, product owner, 14 Oct 2026): every operation on a DR track changes where it starts, or its courses and speeds, and the positions are worked out again.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-01 | Dragging, splitting, merging, jump removal and smoothing of tracks; single fixes dragged on their own; the legacy OTG and DR modes. |
| CAP-02 | Track edits are destructive in the working plot, each recorded as a delta. |
| CAP-21 | The TMA module's manual dragging of a solution: translate, rotate, stretch, shear. |
| SUB-19, SUB-21 | Every change is a recorded step; undo is replay to a point, never an inverse operation. |
| SUB-24 | Provenance records who made each change, and what they asked for. |
| SUB-03, SUB-04 | Measured along geodesics; read and shown in the analyst's units and notation. |
| SUB-26, SUB-28 | Moving a track changes neither current time, the window nor the selection; a change made elsewhere is never overwritten. |
| NFR-13 | Dragging a track has a keyboard and a form-based equivalent. |
| PRN-08 | The analyst owns the data: a track is moved where the analyst says, without second-guessing; nothing is removed or moved without the analyst seeing it first. |
| EXT-14, EXT-15 | A legacy plot's per-fix colours, labels and comments are imported, not listed as left out; a leg it plotted by dead reckoning is said to be. |

## Model

1. **What moves: the whole track, or a period of it.** Legacy Debrief dragged a whole track, or a selected time period of it, to line it up with a reference: that is kept (decision, 13 Oct 2026). On the map, a small control below the drawing toolbar, *What changes*, says which (for moving, rotating, shearing and stretching alike): **Whole track** (the default) or **Time window**, the fixes in the time window shown. The forms offer the same choice. An agent may give any period. Fixes whose times fall in the period, ends included, move; the rest stay where they are.

2. **The joins jump.** Moving a period moves only its fixes, so the track jumps where they meet the rest: the track is not stretched or smoothed to keep it continuous. (That is over the ground. On a track plotted by dead reckoning the fixes after follow on, with no jump: see [Editing a track plotted by dead reckoning](#editing-a-track-plotted-by-dead-reckoning).) The map shows the jump while the analyst drags, and says so: *only the fixes in the time window move, so the track jumps where they meet the rest*. Jump removal (part B) will tidy a join an analyst does not want.

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

    - **Move track…** (the outline's context menu on a track; **Move…** under *Track*, below the outline, in the playground): what moves (*Whole track* or *Current time window*, with how many fixes it holds), the distance (`1.2 nmi`, `2000 yd`, `3 km`, or a number in the analyst's unit) and the bearing in degrees true (`045`). Each field says what it understood (*Means 1.20 nmi*) or what is wrong.
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

7. **The ends on the map.** A track selected on its own shows a diamond beside its first and last fixes of what changes, in the theme's focus colour, drawn to the left of the way the track goes so they are clear of the pivot (often on an end) and the rotate handle (beyond the far end, on the line of a straight leg). Beside *What changes*, so the control stays short on a short map, its *Drag the ends* says what dragging one does: **Shear** (the default) or **Stretch**, which gives the diamonds a double edge. Each is named for a screen reader: *BLUE ONE: shear from the end, holding the start; drag it, or use the arrow keys*; *BLUE ONE: stretch from the start, holding the end; drag it along the track, or use Up and Down to change speed*. We chose a switch on the map over a modifier key (`Shift`-drag), which nobody can see and which is awkward from the keyboard, and over separate stretch handles, which would put four diamonds on a short leg; legacy Debrief, too, chose the drag first and then dragged.

8. **What the map says.** Dragging an end draws the track changed as the pointer goes, the track as it was dashed beneath, and says *BLUE ONE: shearing to 087.2°T 12.4 kn; end moved 1.20 nmi 045.0°T*, or *BLUE ONE: stretching to 12.4 kn (was 10.0 kn)*; with *Time window*, it adds that the track jumps where the window's fixes meet the rest. Letting go is **one step**; `Escape` first puts it back. What is saved is what the map said: the end's move in the analyst's length unit and its bearing, or the speed, each to the decimals shown.

9. **The step.** *BLUE ONE sheared: 087.2°T 12.4 kn* or *BLUE ONE stretched: 12.4 kn* (*part sheared* for the fixes in a period), then *Held at the start, 09:30:00Z*, *Was 090.0°T 10.0 kn* (or *Was 10.0 kn*) and the period. Its provenance record holds the end held (`anchor`), the times of the held and dragged ends (`anchor_time`, `dragged_time`), how far and which way the dragged end went (`distance`, `bearing`), and the course and speed made good (`course`, `speed`): as asked where they were asked, worked out where they were not. Undo is replay to the step before, as for any step.

10. **The keyboard.** `Tab` to an end. Shearing, the arrow keys move it 5 pixels (25 with `Shift`), as the move handle. Stretching, `Up` and `Right` make it one step of speed faster (0.1 kn, or one step of the analyst's speed decimals), `Down` and `Left` one step slower, ten with `Shift`. A run of presses is one step, saved once they stop, on `Enter` or when the keyboard moves on; `Escape` puts it back; presses made while the last step is saved are kept for the next. *Shear* and *Stretch* are buttons on the map, reached with `Tab`.

11. **The forms.** **Shear track…** (the outline's context menu on a track; **Shear…** under *Track*, below the outline, in the playground) asks what changes, which end is held (*Hold the start* or *Hold the end*), and the course and speed it then makes good, offering what it makes good now; a speed may be typed `12.4`, `12.4 kn`, `6 m/s` or `20 km/h`, and each field says what it understood. Held at the start, the dragged end goes the speed times the period's length along the course; held at the end, Debrief finds the start from which the geodesic to the held end sets off on the course asked. **Stretch track…** asks what changes, which end is held, and the speed, which must be more than nothing.

12. **What is refused, and why.** A shear or a stretch of fixes all at one time: *BLUE ONE has fixes at only one time there, so it cannot be sheared or stretched: that needs fixes at two times.* A stretch of fixes that end where they start: *… so it cannot be stretched: shear it instead.* A stretch to no speed. A shear, holding the end, to a course and speed that no leg ending at the held fix makes good, as can happen near a pole: *… cannot make good 180.0°T at 25.0 kn and end where it does: no leg that long sets off on that course to its last fix. Hold the start instead.* A change sent from a plot that has since changed is refused, as for any change (SUB-28), and a drag under way when the plot changes elsewhere is dropped and the map says so.

13. **For agents.** `debrief/edit_track` with `{"action": "shear", "anchor": "start", "distance": {"value": 1.2, "unit": "[nmi_i]"}, "bearing": {"value": 45, "unit": "deg"}}` (the dragged end's move), `{"action": "shear", "anchor": "end", "course": {"value": 87.2, "unit": "deg"}, "speed": {"value": 12.4, "unit": "[kn_i]"}}` (the course and speed made good), or `{"action": "stretch", "anchor": "start", "speed": {"value": 12.4, "unit": "[kn_i]"}}`, each with a `period` to change only that. In VS Code, `debrief.shearTrack` and `debrief.stretchTrack` take the track and the edit, without `action`, instead of asking.

Live bearing residuals while dragging, solutions rooted in a period of bearings, and shearing one leg of a multi-leg solution apart from the others (**This leg**) are the TMA module's: [TMA solutions](tma.md) (CAP-21, 24 Oct 2026).

## Cleaning tracks

Part B2 (14 Oct 2026). Three ways to tidy a track an analyst has imported, each one recorded step, and none done without the analyst seeing what it would do first.

1. **Jumps: found, shown, then removed.** A jump is a fix the platform could not have reached in time: a GPS glitch, a mistyped position. **Find and remove jumps…** (the outline's menu on a track; **Jumps…** under *Track*, below the outline, in the playground) asks for a speed, offered as **three times the track's median speed between fixes, and never less than 10 kn**, which the analyst can change (`30`, `30 kn`, `15 m/s`). Three times the median fits the platform: a helicopter at 120 kn and a submarine at 5 kn each get a threshold far above the changes of speed they really make between fixes; the 10 kn floor stops position noise on a slow or stopped platform being called a jump. A fixed speed (60 kn, say) would miss every jump of a slow platform and flag a fast one's ordinary fixes.

    A fix is a jump when reaching it from the **last good fix before it** needs more than that speed (range along the geodesic over elapsed time; two fixes at one time in different places need infinite speed). Comparing with the last good fix, not simply the fix before, finds a burst of bad fixes in a row; and after a jump a fix is only back on the track when the track goes on from it, so the second of two bad fixes is found even though it is reachable over the longer time since the last good one. A jump is off the track and back: a fix the track goes on from smoothly is not one, so a real burst of speed (a sprint between drifts, far above three times the median) is not offered. Up to 5 fixes in a row can be one jump. A track that goes off and stays off longer than that, or until it ends (a ship at anchor getting under way), is not a jump, since the platform may really be there; nothing is offered. The first fix is a jump when it is far from the next two and they agree; the last likewise.

    What is found is **shown first, never removed silently**: each jump is ringed on the map in the theme's warning colour, the note at the top of the map says *RED ONE: 3 jumps found, each faster than 30.0 kn to reach*, and a list gives each one's time, position and how fast it would have been reached (*09:20:00Z 37°08.456'N 075°26.932'W · 176.5 kn to reach from 09:19:00Z*), all ticked. The analyst unticks any that are real (its ring goes), and **Remove** takes out the rest as **one step**: *RED ONE: 3 jumps removed*, with notes saying when they were (*At 09:20:00Z, 09:21:00Z and 10:40:00Z*), the speed (*Each faster than 30.0 kn to reach*) and any marked fixes that went with them. Where the track has two fixes at a jump's time (two tracks merged where they meet, say), only the one found to be the jump goes; when which it is cannot be told, nothing is removed and Debrief says so. Cancel, or closing the list, removes nothing. With none found, Debrief says so: *RED ONE: no jumps found faster than 30.0 kn.*

    Removing fixes keeps every series in step: positions, times, speeds, courses, depths and marked fixes lose the same fixes. A track keeps at least two fixes.

2. **Smoothing: previewed, then applied.** **Smooth track…** (**Smooth…** in the playground) asks what to smooth (the whole track, or its fixes in the time window, as for a move) and over how many fixes: an odd number, 5 unless the analyst says, *each fix averaged with the 2 either side of it*. One method, a moving average, chosen because an analyst can say exactly what it did: each fix moves to the average position of itself and the same number of fixes either side, worked out in a flat frame centred on that fix (ranges and bearings from it, along geodesics), so it is right far north and across the antimeridian. Near the ends of what is smoothed the window narrows evenly, so **the first and last fixes never move** and nothing is pulled sideways. A gap in the data (more than ten times the track's median time between fixes) is treated as an end: fixes either side of it are never averaged together, so a platform that went somewhere while nothing was recorded is not pulled across the gap. Fixes outside the period stay where they are. **Times never change**, so the fixes stay in time order. Recorded courses and speeds are averaged over the same fixes (courses as directions, so 350° and 010° average to 000°), so they stay in step with the positions; depths are kept. Simplifying a track (dropping fixes, as Douglas-Peucker does) is a different operation, not offered: it loses fixes rather than moving them.

    Before anything changes, the track as smoothing would leave it is drawn dashed in the theme's focus colour over the track as it is, and the note says what it would do: *RED ONE smoothed over 5 fixes, if applied: 236 fixes moved; the most a fix moved: 0.06 nmi, at 09:22:00Z.* **Apply** makes it **one step**, *RED ONE smoothed over 5 fixes* (or *RED ONE part smoothed…*), its notes saying how many fixes moved and the most any moved, and the period. Cancel changes nothing. A track smoothing would not move (a straight, steady one) says so and records nothing.

3. **Marked fixes: a colour, a label or a comment of their own.** Legacy plots let an analyst colour single fixes, label them and comment on them, and the .dpf import used to list those as not imported. Now a fix can carry any of the three:

    | | On the map | Elsewhere |
    | --- | --- | --- |
    | Colour | a dot at the fix in that colour, and the line from it to the next fix drawn in it | the fix list |
    | Label | the text beside the fix, as a track's name is | the fix list |
    | Comment | shown when pointing at the fix, with its time, position, course and speed | the fix list, and the **Timeline**, at the fix's time, as *RED ONE fix* |
    | Time label or symbol, always | the fix's time, or a small dot, as the track's [label and symbol intervals](labels-symbols-arrows.md) draw them, whatever those are and at any zoom (force on only; decision, product owner, 15 Oct 2026) | the fix list: *time label always shown*, *symbol always shown* |

    A fix with only a label or a comment is a ring in the track's colour, so it can be pointed at. To mark a fix: **right-click it on the map** (on a touch screen, **press and hold it**: about half a second with the finger still), or open the **fix list** (**Fixes: colour, label or comment…** on the outline's menu; **Fixes…** in the playground), which lists every fix of the track in time order with its time, position, course, speed and any mark, and choose one; then **Colour…** (the track colours, amber and yellow), **Label…** or **Comment…**. An empty label or comment, or *Track's colour*, takes it away. Each change is **one step**: *RED ONE fix at 09:31:00Z coloured yellow*, *… labelled 'Turn 1'*, *…: comment added* (or *changed*, *removed*); a long label is shortened in the step's name and kept whole.

    A mark is kept with the track, **found by its fix's time**, not its place in the track (see the schema's `FixMark`). So it stays with its fix whatever happens to the rest: jumps removed before it, the track moved, rotated, sheared, stretched, smoothed, split (each part keeps its own marks) or merged. Where two fixes share a time, the mark is the first's; merging two tracks that meet at a time where both have a marked fix keeps the earlier track's, and the step's notes say so. Only marked fixes are listed, so a track of 10,000 fixes with three marked carries three marks, and the plot is still plain GeoJSON to other tools.

    **From legacy plots.** The .dpf import keeps each fix's own colour (where it differs from the track's), its label and its comment as marks. Legacy Debrief labels every fix with its time unless told otherwise; a label that only gives the fix's time (`0504`, `120500`) is not imported, and the import says how many, since Debrief shows fixes' times itself. A label hidden in the legacy plot is imported and shown, and the import says how many. Where on the fix a legacy label went, and fix symbols and arrows, are still listed as not imported (EXT-15).

4. **What is a step, and what isn't.**

    | | Step in the history | Undone by `Ctrl+Z` |
    | --- | --- | --- |
    | Remove the jumps ticked | Yes, one for all of them | Yes |
    | Apply smoothing | Yes, one | Yes |
    | A fix coloured, labelled or commented on | Yes, one each | Yes |
    | Finding jumps; unticking one; a smoothing preview; Cancel | No | No |
    | Choosing a fix in the fix list | No | No |

5. **The keyboard.** Everything here has a keyboard path: the commands and their input boxes and lists in VS Code; in the playground, the buttons under *Track*, below the outline, the form, the list of jumps (checkboxes) and the fix list (`Up` and `Down` move along it, `Enter` or `Space` chooses a fix). Right-clicking a fix on the map, or pressing and holding it on a touch screen, is a shortcut, never the only way.

    **Touch.** On a tablet there is no right button, so pressing and holding a track or a marked fix does what a right-click does: after about half a second (0.55 s), the fix's menu opens where the finger is, the finger still down. It is a hold only while the finger stays within about 10 pixels of where it touched, no second finger lands, and the map does not move: a tap still selects, a finger that moves pans the map or drags a handle, and two fingers zoom. Holding a fix does not show the browser's own callout or select text on the map. Leaflet's built-in press and hold is not used: it works only where the browser says it is mobile Safari, which iPadOS often does not.

6. **Shared state and conflicts.** None of these changes current time, the time window or the selection (choosing a fix in the playground's fix list selects its track). A change sent from a plot that has since moved on is refused, as any change is (SUB-28), and Debrief shows the latest; jumps found or smoothing previewed on a plot that has changed must be found or previewed again.

7. **For agents.** The same through the tool service: `debrief/find_jumps` (`feature`; `threshold`, a speed such as `{"value": 30, "unit": "[kn_i]"}`, and `period`, if wanted) returns the threshold used, the track's median speed and the jumps (time, position, speed to reach, the fix it was reached from) and changes nothing; `debrief/remove_jumps` (`feature`, `times`, and the `threshold` for the record) removes them as one step. `debrief/preview_smoothing` (`feature`, `window`, `period`) returns the track as it would be and how far fixes would move, and changes nothing; `debrief/smooth_track` applies it. `debrief/mark_fix` (`feature`, `time`, `changes`: any of `colour`, `label`, `comment`, null or empty taking one away; `colour_name` for the step's name). Each change takes `base` as for any change. In VS Code, `debrief.removeJumps` takes the track and `{threshold, times}` (`times: "all"` removes every jump found; no `times` only finds them and rings them on the map), `debrief.smoothTrack` the track and `{window, period, apply}` (`apply: false` leaves the preview on the map), and `debrief.markFix` the track, the fix's time and the changes, instead of asking.

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

## Single fixes, and dead reckoning

Part B3 (14 Oct 2026), the last of part B. One fix moved on its own, as legacy Debrief lets an analyst drag one fix; and the legacy OTG and DR modes.

1. **Only that fix moves** (over the ground; on a track plotted by dead reckoning the leg into it changes and the fixes after follow, [below](#editing-a-track-plotted-by-dead-reckoning)). As in legacy Debrief: the fix goes where the analyst puts it, along the geodesic from where it was; **its time is unchanged**, and the fixes either side stay where they are. Its mark (a colour, label or comment of its own) stays with it, found by its time.

2. **Its recorded course and speed are kept.** A fix's course and speed are what the platform logged (its compass and log, or a GPS's velocity), not something worked out from the positions plotted, and a fix plotted in the wrong place does not change what the platform was doing. So, as for a move of the whole track, they are kept rather than worked out again. What the new position implies is said instead: the **speed to reach the fix** from the fix before, and the **speed to go on** to the fix after, each the geodesic range over the time between, so the analyst sees at once whether moving it has tidied a jump or made one. Debrief does not otherwise derive courses and speeds from positions, except where a track records none, so there is nothing else to keep in step.

3. **Picking the fix.** A track selected on its own shows its move, rotate and pivot handles and its ends, as for the other operations. **Zoomed in far enough** that its fixes are apart on the screen (at most 60 in view, and at least 14 pixels between neighbours), each fix in view has a **small ring** of its own in the theme's focus colour, named for a screen reader: *RED ONE: fix at 09:31:00Z; drag it, or use the arrow keys, to move this fix alone*. Zoomed out, there are no rings and the note at the top of the map says *Zoom in to move a single fix*. The rings sit beneath the track's other handles, so where one shares a fix (the move handle, the pivot) that handle takes the pointer: drag the pivot off it, or `Tab` to the fix. We chose rings when zoomed in over a ring on the fix nearest the pointer: rings work the same by touch, where there is no pointer to hover, and from the keyboard; and showing them only when the fixes are apart keeps a long track from being covered in rings, or one being grabbed for its neighbour.

4. **Dragging.** Drag a ring with the mouse, a finger or a pen. The track is drawn with the fix where it is being put, the track as it was dashed beneath, and the note says *RED ONE fix at 09:31:00Z: moving 0.42 nmi 045.0°T; 37.2 kn from 09:30:00Z, 13.2 kn on to 09:32:00Z*, adding *faster than 15.0 kn, as a jump would be* when either speed is above the jump threshold's default (three times the track's median speed between fixes, at least 10 kn). Letting go is **one step**: *RED ONE fix at 09:31:00Z moved 0.42 nmi 045.0°T*. `Escape` before letting go puts it back, and nothing is recorded. What is saved is what the note said: the distance in the analyst's length unit and the bearing, each to the decimals shown.

    <svg viewBox="0 0 320 120" width="320" height="120" role="img" aria-label="A track of five fixes; the middle one dragged off the line; its neighbours stay, and the speed to reach it and to go on from it are said" style="max-width: 100%">
      <g fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="20" y1="90" x2="300" y2="40" stroke-dasharray="5 4" opacity="0.6"/>
        <polyline points="20,90 90,77.5 180,20 230,52.5 300,40"/>
        <circle cx="160" cy="65" r="4" stroke-dasharray="2 2" opacity="0.6"/>
        <circle cx="180" cy="20" r="5"/>
      </g>
      <g fill="currentColor">
        <circle cx="20" cy="90" r="2.5"/><circle cx="90" cy="77.5" r="2.5"/><circle cx="230" cy="52.5" r="2.5"/><circle cx="300" cy="40" r="2.5"/>
        <text x="190" y="18" font-size="11">09:31, moved</text>
        <text x="60" y="105" font-size="11">from 09:30: faster</text>
        <text x="215" y="80" font-size="11">on to 09:32</text>
      </g>
    </svg>

    *Dashed: the track as it was. Only the fix at 09:31 moves; the speeds to reach it and to go on from it are said.*

5. **The keyboard.** `Tab` reaches each ring, after the track's other handles. The arrow keys move the fix 5 pixels, 25 with `Shift`; the note says the same as while dragging. A run of presses is one step, saved once they stop (under a second), on `Enter` or when the keyboard moves on; `Escape` first puts it back; presses made while the last step is saved are made as the next.

6. **The form.** **Move a fix…** (the outline's menu on a track in VS Code; in the playground, **Move…** in the fix list, **Fixes…** under *Track*) lists the track's fixes, nearest current time first, and asks where the chosen fix goes, offering where it is now. The position may be typed in any notation Debrief reads (`37°08.456'N 075°26.932'W`, `37.141 -75.449`), and the field says what it read, how far and which way that moves the fix, and the speeds it would imply: *Means 37°08.556'N 075°26.932'W. RED ONE fix at 09:31:00Z: moves 0.10 nmi 000.0°T; 5.9 kn from 09:30:00Z, 4.1 kn on to 09:32:00Z*. Right-clicking a ring, or pressing and holding it on a touch screen, opens the fix's menu, as on the track: colour, label, comment, and **Move…**.

7. **The step.** Named for the fix and the move: *RED ONE fix at 09:31:00Z moved 0.42 nmi 045.0°T*, then *Now at 37°08.700'N 075°26.640'W*, *Speed to reach it from 09:30:00Z: 37.2 kn (was 12.0 kn)*, *Speed on to 09:32:00Z: 13.2 kn (was 12.0 kn)* and *Its recorded course and speed are kept*. Its provenance record holds the fix's time (`fix_time`), the distance and bearing (as asked, or worked out from a position typed) and the new position (`longitude`, `latitude`). Undo is replay to the step before, as for any step.

8. **Over the ground or dead reckoning (OTG and DR).** Legacy Debrief plotted each track either **over the ground** (OTG: each fix where it was logged) or by **dead reckoning** (DR: the first fix where it was logged, and each fix after it placed from the one before by the course and speed logged, as a navigator plots a DR track), and asked which as each track was imported, with a checkbox *Use this choice for future track imports*. That worked well, since a community tends to stick with one or the other, so Debrief does the same (decision, product owner, 14 Oct 2026):

    - **Importing a REP file asks, for each track,** *How is RED ONE plotted? (1 of 3)*, offering **Over the ground (OTG)** or **Dead reckoning (DR)** and, apart from that choice, as legacy had it, a box to tick: *Use this choice for future track imports*. In the playground that is a small form with the two choices and a check box. A VS Code list (Quick Pick) has no check box, so the box is the list's last line, showing a ticked or an empty circle and saying *on* or *off*: choosing it ticks or clears it and the list stays open, and choosing OTG or DR answers. That keeps one question per track, used the same way by keyboard, mouse or screen reader, rather than a second question after each (decision, panel review, 14 Oct 2026). Ticked, the choice applies to the file's remaining tracks and to every import after, without asking. `Escape`, or **Cancel**, imports nothing. A REP track is asked about once, whole, even where its legs were plotted differently in legacy (decision, product owner, 14 Oct 2026).
    - **The import's notes say how each track is plotted** (*Track 'RED ONE' plotted by dead reckoning (DR).*), and, when the remembered choice was used, how to change it or be asked again. They are in the plot's provenance too.
    - **The remembered choice is the analyst's own setting, and can be cleared.** It is three-way: *ask* (the default), *otg* or *dr*. In VS Code it is the setting **Debrief: Track import mode** (`debrief.trackImportMode`), and **Debrief: Ask again whether imported tracks are OTG or DR** sets it back to ask; in the playground, the line under *Import* says what is remembered, and **Ask again** clears it.
    - **The mode is kept on the track** (its `plotting_mode`), as content like its colour; the track's line on the map is always the positions as plotted, so other GeoJSON tools draw what Debrief draws. A track plotted by dead reckoning keeps its **positions as logged** beside them. **Plot over the ground or by dead reckoning…** (the outline's menu on a track; **OTG/DR…** under *Track* in the playground) changes it as **one step**: *RED ONE plotted by dead reckoning*, with *From its first fix, at 09:30:00Z, by each fix's recorded course and speed; its positions, courses and speeds as logged are kept* and the most a fix moved; or *RED ONE plotted over the ground*, *Each fix where it was logged, with its course and speed as logged*, the positions, courses and speeds as logged put back. A track that does not record both courses and speeds cannot be plotted by dead reckoning, and Debrief says why. Other changes to a track plotted by dead reckoning change where it starts, or its courses and speeds, and its positions are worked out again ([below](#editing-a-track-plotted-by-dead-reckoning)); its positions, courses and speeds as logged stay as logged, and go with their fixes when fixes are removed or the track is split or merged (tracks plotted differently are not merged, and the message says so).
    - **Over the ground again, after a change made while plotted by dead reckoning, asks first** (decision, product owner, 14 Oct 2026). The positions, courses and speeds as logged come back, so that change is lost; when its first fix is more than a metre from where it was logged, or a course or a speed is not as logged, Debrief says so before doing anything: *RED ONE was changed while plotted by dead reckoning (its course and speed at 09:34:00Z are 055.0°T 12.0 kn, logged 045.0°T 12.0 kn). Plotted over the ground, each fix goes back where it was logged, with its course and speed as logged, and the changes made while plotted by dead reckoning are lost. Undo takes it back.* (or *(its first fix is 1.00 nmi from where it was logged)*). Comparing courses and speeds, not positions, catches a rotation too, which keeps every fix where dead reckoning by the turned courses puts it (panel finding, 14 Oct 2026). VS Code asks in a dialog (**Plot over the ground**, or **Cancel**); the playground asks in its small form. Confirmed, it is still one step, its notes saying *Changes made while plotted by dead reckoning discarded*. An agent sends `discard_dr_changes: true` with the change; without it the service refuses (error -32003), saying why and how to go ahead.
    - **A track plotted by dead reckoning is tagged DR** beside its name: in the outline (VS Code's description, *DR · …*; a small *DR* in the playground's outline), and on the map, in its label and tooltips (*RED ONE (DR)*). Its line is drawn as any track's (decision, product owner, 14 Oct 2026).
    - **Dead reckoning places each fix from the one before by that fix's recorded course and speed over the time between, along the geodesic.** That is the rule legacy Debrief used: legacy saves a DR leg's worked-out positions in its plot files, and on its sample plots this puts every fix back within 0.1 m of them.
    - **A legacy .dpf plot is not asked about:** it says how each leg was plotted (`PlotRelative`). A track whose legs were all plotted by dead reckoning is imported so, with the positions legacy worked out; the plot does not hold its positions as logged, so it cannot be plotted over the ground, and the import says so (it used to say nothing).

    **User state stays out of the data.** The remembered choice belongs to the analyst, not the plot: it is kept in the user-settings layer (their Debrief configuration, read and written the same way by the Python services and the extension: `debrief-config`), never in STAC: not in a catalogue, a plot file or its history. The host (VS Code, the playground) reads it and passes the mode to the importer, and an agent passes the mode itself; the importer and the catalogue never read user state (decision, product owner, 14 Oct 2026).

9. **What is a step, and what isn't.**

    | | Step in the history | Undone by `Ctrl+Z` |
    | --- | --- | --- |
    | Letting go of a fix's ring | Yes, one | Yes |
    | A run of arrow keys on a fix's ring | Yes, one for the run | Yes |
    | Move a fix… (a position typed) | Yes, one | Yes |
    | Plot over the ground or by dead reckoning… (a track's mode changed) | Yes, one | Yes |
    | Choosing OTG or DR as a track is imported; remembering it; **Ask again** | No: the import is one step, and the choice is the analyst's setting | No |
    | Zooming in until the rings show; `Escape` during a drag; a fix put where it is | No | No |

10. **Shared state and conflicts.** Moving a fix and changing how a track is plotted change neither current time, the time window nor the selection. If the plot changes elsewhere during a drag, the drag is dropped and the map says so; a change sent from a plot that has since moved on is refused (SUB-28), as for every track operation.

11. **For agents.** `debrief/edit_track` with `{"action": "move_fix", "fix_time": "2023-06-15T09:31:00.000Z", "distance": {"value": 0.42, "unit": "[nmi_i]"}, "bearing": {"value": 45, "unit": "deg"}}`, or with `"position": [-75.45, 37.14]` instead of the distance and bearing; and `{"action": "set_plotting_mode", "plotting_mode": "dr"}` (or `"otg"`). `debrief/import_rep` takes `modes` (`"otg"` or `"dr"` for every track, or one for each track by name) and, when the host used a remembered choice, `remembered` (the words saying how to change it); `debrief/rep_tracks` lists the tracks a REP file would import, so a host can ask. Without `modes`, tracks are imported over the ground and nothing is said. In VS Code, `debrief.moveFix` takes the track, the fix's time and `{position}` or `{distance, bearing}`; `debrief.plottingMode` the track and `"otg"` or `"dr"`; `debrief.importRep` `{store, path, modes}`, instead of asking.

```mermaid
sequenceDiagram
    actor Analyst
    participant Map
    participant Host as Extension host
    participant Service as Tool service
    Analyst->>Map: select RED ONE; zoom in
    Map->>Map: a ring on each fix in view
    Analyst->>Map: drag the ring of the fix at 09:31
    Map->>Map: only that fix moves; "moving 0.42 nmi 045.0°T; 37.2 kn from 09:30:00Z, ..."
    Analyst->>Map: let go
    Map->>Host: edit_track (feature_id, track_edit: move_fix, fix_time, distance, bearing)
    Host->>Service: debrief/edit_track (edit, base)
    Service-->>Host: one step: "RED ONE fix at 09:31:00Z moved 0.42 nmi 045.0°T"
    Host->>Map: show_plot (the ring where the fix now is)
```

## Editing a track plotted by dead reckoning

Decision, product owner, 14 Oct 2026. On a track plotted by dead reckoning the truth is its **origin**, where its first fix is, and each fix's **course and speed**: the leg from that fix to the next. Its positions are always worked out from them, each fix from the one before by that fix's course and speed over the time between, along the geodesic ([above](#single-fixes-and-dead-reckoning)). So an edit never moves a DR track's positions on their own: it moves the origin, or it changes courses and speeds, and the positions are worked out again. A track plotted over the ground is edited as the sections above say.

1. **What each operation changes.** The same handles, keys, forms and tool-service edits as over the ground; what they change:

    | Operation | On a track plotted by dead reckoning | The step |
    | --- | --- | --- |
    | Move the whole track (drag, keys, **Move track…**) | The origin: every fix follows, its course and speed kept | *RED ONE (DR) moved 1.20 nmi 045.0°T*, *Dead reckoning now starts from …* |
    | Move the fixes in the time window | The leg into the window's first fix (the course and speed of the fix before), so that fix lands where it was moved; it and every fix after follow. A window from the first fix moves the origin. | *RED ONE (DR) part moved …*, *Leg into 09:30:00Z now 056.5°T 12.1 kn (was 045.0°T 12.0 kn)* |
    | Drag a single fix (keys, **Move a fix…**, `move_fix`) | The leg into it, so dead reckoning puts it where it was dropped; every later fix shifts with it. The first fix dragged moves the origin. | *RED ONE (DR) leg into 09:43:00Z now 056.5°T 12.1 kn*, *Fix at 09:43:00Z moved 0.42 nmi 045.0°T, to …*, *Was 045.0°T 12.0 kn* |
    | Rotate | The angle added to the course of each fix in what turns. The whole track, or a window from its first fix, turns about the pivot: the origin turns about it too. A window that starts later turns about its own first fix, which dead reckoning places from the fix before; the pivot sits there. | *RED ONE (DR) rotated 12.0° clockwise*, *Every course turned 12.0° clockwise* |
    | Stretch | Each speed in what changes multiplied by one factor | *RED ONE (DR) stretched: 12.4 kn*, *Every speed multiplied by 1.073* |
    | Shear | One velocity (a set and drift) added to the course and speed of each fix in what changes, found so the dragged end lands where it was dragged. On a straight leg at a steady speed every course and speed becomes the course and speed made good that the map shows; a period that turns keeps its turns, as a navigator's DR corrected for a tidal stream does. | *RED ONE (DR) sheared: 087.2°T 12.4 kn*, *Every course and speed changed by the same 0.6 kn toward 180.0°T (a set and drift)* |
    | Shear or stretch, held at the end | As above, the start moved (the origin, or the leg into it) and the change found so the end stays where it is | as above |
    | Smooth | The courses (as directions) and speeds averaged over the window, as over the ground; not the positions | *RED ONE (DR) smoothed over 5 fixes*, *Courses and speeds averaged, not positions* |
    | Remove jumps | Fixes with a wild logged speed (4, below) | *RED ONE (DR): 2 jumps removed* |

    An operation on the time window changes the course and speed of each fix in it, ends included: each is the leg that starts at that fix, so the leg out of the window's last fix changes too. A legacy .dpf DR leg that records no courses or speeds is edited by its positions, as over the ground.

2. **The fixes after follow on.** Over the ground, changing the fixes in the time window leaves the rest where they are, so the track jumps where they meet. On a DR track each fix is placed from the one before, so the fixes after the window follow on, with no jump: that is the nature of dead reckoning. The map and the step say so: *the fixes after follow on, by dead reckoning*.

3. **What the map shows.** While dragging, the map draws the track as dead reckoning will leave it: the later fixes, marked, and their rings follow the pointer, the track as it was dashed beneath. The note says what changes in dead-reckoning terms: *RED ONE (DR) fix at 09:43:00Z: moving 0.42 nmi 045.0°T; leg into it now 056.5°T 12.1 kn (was 045.0°T 12.0 kn); the fixes after follow*, adding *faster than 15.0 kn, as a jump would be* when the new leg is; *RED ONE (DR): rotating 3.0° clockwise about …; the courses in the time window turn, and the fixes after follow on, by dead reckoning*; *RED ONE (DR): stretching to 12.4 kn (was 11.6 kn); every speed is scaled*; *RED ONE (DR): shearing to 087.2°T 12.4 kn; end moved 1.20 nmi 045.0°T; one set and drift is added to every leg*. **Move a fix…** says the same of a position typed. What the map draws is what the tool service makes: both work it out the same way, and shared test vectors check that they agree, at mid-latitude, far north and across the antimeridian.

4. **Jumps on a DR track.** On a DR track positions jump only where a logged speed is wild, so **Find and remove jumps…** offers the fixes whose **logged speed** is faster than the threshold (the same default: three times the track's median speed, at least 10 kn), in runs of at most 5 with ordinary speeds either side; a longer run, or one reaching the track's end, may be the platform really going fast, and is not offered. Each is listed as *09:20:00Z 37°08.456'N 075°26.932'W · logged 176.5 kn on to 09:21:00Z*, and the note says *RED ONE (DR): 1 jump found, each logged faster than 30.0 kn, so dead reckoning takes the leg from it too far*. Removing one joins the legs either side of it: the fix before carries on, by its own course and speed, to the fix after. The first fix is never offered or removed (dead reckoning starts there, and removing it would start the track where its wild leg ended: drag the fix after it instead, which changes that leg), nor is the last (its speed places no fix). A wild course is not found this way, since the speed is ordinary: the track is offset from that fix on, and dragging the fix after it puts the leg right. We chose this over refusing jump removal on a DR track: a REP file's speed glitch is exactly what an analyst plotting DR needs to tidy.

5. **What is kept as logged.** Edits never change the positions, courses and speeds as logged, kept beside the track since it was plotted by dead reckoning (`logged_positions`, `logged_courses`, `logged_speeds`). Courses and speeds changed while plotted so are content, recorded in history like any change, and undone by replay. Whether the track was changed while plotted so is told by comparing its origin, courses and speeds with those logged, so a rotation, a stretch or smoothing is noticed as well as a move; plotted over the ground again, after the warning, all three come back. Fixes removed as jumps go from the logged series too, so removing jumps alone loses nothing over the ground.

6. **Plotted by dead reckoning from the track as it is.** Plotting a track by dead reckoning starts from its positions, courses and speeds as they are (over the ground, those it was logged with, or as an edit over the ground left them), keeps them as logged, and works the positions out from its first fix. We chose this over going back to older logged data: over the ground, the track's data *is* what was logged, so DR, then over the ground, then DR again comes back to the same track.

7. **Split and merge.** Splitting keeps each part's courses, speeds and logged series; each part starts where its first fix already was, so nothing moves. Merging tracks plotted by dead reckoning makes one track with one origin: each later track follows on, by dead reckoning, from the end of the one before, so that a later edit cannot move it unseen; if that moves its fixes, the step's notes say so (*By dead reckoning, BLUE TWO now follows on from BLUE ONE: the most a fix moved: 2.10 nmi, at 10:00:00Z*). Tracks plotted differently are not merged, as before.

8. **For agents.** The same `debrief/edit_track` edits; the tool service works out the dead-reckoning result, and the record of a fix dragged holds the new leg's `course` and `speed` beside what was asked. `debrief/find_jumps` marks a DR track's jumps `"logged": true`, their `speed` the logged speed and `since` the time of the fix their leg runs to.

## Reference implementation

- **Schema (0.0.14; 0.0.15 adds shear and stretch):** `TrackEdit`, `TrackEditActionEnum` and `TrackEditAnchorEnum` in `schemas/linkml/features.yaml`; the message `edit_track` (`feature_id`, `track_edit`) in `schemas/linkml/messages.yaml`; the rules in `debrief_schemas.documents.track_edit_problems` and `vscode/src/messages.ts`; fixtures `webview_message/valid/edit-track-*.json` and the `edit-track-*` invalid ones.
- **Making and naming changes:** `debrief_stac.tracks` (`moved`, `rotated`, `default_pivot`, `AnchorFrame`, `sheared`, `stretched`, `shear_target`, `leg_of`, `split`, `merge`, `overlaps`, the step names); `Catalogue.edit_track`, `split_track` and `merge_tracks`; the service methods in `debrief_tools.service`.
- **The map:** what a drag or an arrow key makes, the readouts, the handles' places and a run of presses in `vscode/webview/trackedit.ts` (free of Leaflet, unit-tested); the handles, preview and keyboard in `vscode/webview/trackmap.ts`; the host side in `vscode/src/panels/map.ts` (`receive`) and the command `debrief.editTrack`.
- **VS Code:** the commands `debrief.moveTrack`, `debrief.rotateTrack`, `debrief.shearTrack`, `debrief.stretchTrack`, `debrief.splitTrack` and `debrief.mergeTracks` in `vscode/src/extension.ts`, on the outline's context menu for a track.
- **The playground:** `vscode/play/host.ts` (the buttons and the small forms) and `track` in `vscode/play/play.py`.
- **Tests:** `python/debrief-stac/tests/test_tracks.py` (geodesic moves and rotations, far north and across the antimeridian; periods; split and merge invariants; undo; conflicts), the service test, `vscode/test/unit/trackedit.test.ts`, the playground test's `vscode/test/play/tracks.mjs` (drag, Escape, undo, rotate, keyboard runs, a period, a colleague's change during a drag, split, merge, an overlap refused, the forms), the playground test's `vscode/test/play/shear.mjs` (a straight leg sheared and stretched by its ends, Escape, undo, the keyboard, the forms), and the integration test's track steps.
- **Cleaning tracks (part B2):** schema 0.0.16's `FixMark` and `fix_marks` in `schemas/linkml/features.yaml`, the messages `show_fixes` and `fix_chosen`, the rules in `debrief_schemas.documents`; `debrief_stac.fixes` (finding jumps, the default threshold, removing fixes with every series in step, smoothing, marks and the step names), marks carried through `split` and `merge` in `debrief_stac.tracks`; `Catalogue.find_jumps`, `remove_jumps`, `smoothing_preview`, `smooth_track` and `mark_fix`; the service's `debrief/find_jumps`, `debrief/remove_jumps`, `debrief/preview_smoothing`, `debrief/smooth_track` and `debrief/mark_fix`; the .dpf mapping in `debrief_io.dpf_import` (`_fix_marks`); `vscode/webview/fixes.ts` (free of Leaflet: the fix list's rows, reading a threshold and a window, the words); the map's marks, rings and preview in `vscode/webview/map.ts`; the commands `debrief.removeJumps`, `debrief.smoothTrack` and `debrief.markFix` in `vscode/src/extension.ts`; the Timeline's fix comments in `vscode/src/timeline.ts`; the playground's **Jumps…**, **Smooth…** and **Fixes…** (`vscode/play/host.ts`, `clean` and `glitches` in `play.py`). Tests: `python/debrief-stac/tests/test_fixes.py`, the service test, `python/debrief-io/tests/test_dpf_import.py`, `vscode/test/unit/fixes.test.ts`, the playground test's `vscode/test/play/cleaning.mjs`, and the integration test's cleaning steps.
- **Single fixes and dead reckoning (part B3):** schema 0.0.17's `move_fix` and `set_plotting_mode` actions of `TrackEdit`, with `fix_time`, `position`, `plotting_mode` and `discard_dr_changes`; `plotting_mode` and `logged_positions` on a track; `track_import_mode` in the analyst's configuration (`debrief_config.track_import_mode` and `with_track_import_mode`, and their TypeScript twins); and their rules in `debrief_schemas.documents` and `vscode/src/messages.ts`; `debrief_stac.tracks` (`fix_index`, `fix_moved`, `implied_speeds`, `plotted_as`, `dead_reckoned_positions`, `changed_while_dr` and the step names) and `Catalogue.edit_track` (refusing with `ConfirmationNeeded`, the service's error -32003, until confirmed); the DR tag (`trackLabel` and `DR_TAG` in `vscode/webview/fixes.ts`, the outline and the map); the modes given to `debrief_io.import_rep` (`modes`, `remembered`, `rep_track_names`) and the .dpf mapping of `PlotRelative` in `debrief_io.dpf` and `dpf_import`; the service's `debrief/rep_tracks`; asking for each track in `vscode/src/importmode.ts`; `vscode/webview/trackedit.ts` (free of Leaflet: which fixes get rings, a fix's gesture, the readout with the speeds in and out, the jump speed, dead reckoning) and the rings, their drag, keyboard and menu in `vscode/webview/trackmap.ts`; the commands `debrief.moveFix`, `debrief.plottingMode` and `debrief.askTrackImportMode`, the setting `debrief.trackImportMode`, the questions in `debrief.importRep`, and **Move…** in a fix's menu in `vscode/src/extension.ts`; the playground's **Move…** in the fix list, **OTG/DR…**, the questions on import and **Ask again** (`vscode/play/host.ts`, and `import_mode` and `rep_tracks` in `play.py`). Tests: `python/debrief-stac/tests/test_fix_drag.py` (geodesic moves far north and across the antimeridian, the speeds implied, marks kept, undo, conflicts; dead reckoning of straight legs at any latitude and back over the ground, split and merge, refusals), `python/debrief-io/tests/test_importer.py` and `test_dpf_import.py` (modes given, notes, a .dpf DR leg), `python/debrief-config/tests/test_config.py` and `ts/config/test/config.test.ts` (the setting, cleared), the service test, `vscode/test/unit/fixdrag.test.ts` and `importmode.test.ts`, the playground test's `vscode/test/play/fixdrag.mjs` (zoom in for rings, a mouse drag, `Escape`, undo, a run of arrow keys, a finger's drag, the form, OTG/DR, an import asking for each track, remembered, then asked again), and the integration test's single-fix and import steps.
- **Editing a track plotted by dead reckoning (decision, product owner, 14 Oct 2026):** `debrief_stac.reckoning` (the origin, courses and speeds, `Reckoning`; `dr_moved`, `dr_fix_moved`, `dr_rotated`, `dr_stretched`, `dr_sheared`, `dr_smoothed`, `find_dr_jumps`, `dr_without_fixes` and the words); `changed_while_dr` and `plotted_as` in `debrief_stac.tracks`, with `logged_courses` and `logged_speeds` on a track (schema 0.0.17); `Catalogue.edit_track`, `find_jumps`, `remove_jumps`, `smoothing_preview` and `smooth_track` choosing them for a DR track; the map's preview in `vscode/webview/trackedit.ts` (`reckon`, `drFixMoved`, `drMoved`, `drTurned`, `drStretched`, `drSheared`, `drFixReadout`, `fixMeans`) and `trackmap.ts` (rings following, the pivot of a window). Tests: `python/debrief-stac/tests/test_dr_editing.py` (each operation, periods, far north, across the antimeridian, undo and redo with the hash chain, jumps, split and merge, over the ground again), the shared vectors `schemas/vectors/dead-reckoning.json` checked by it and by `vscode/test/unit/fixdrag.test.ts`, the playground test's DR fix drag and rotation in `vscode/test/play/fixdrag.mjs`, and the integration test's DR fix moved.

*Not yet (after part B):* a REP track whose legs legacy plotted differently (its symbology's new-segment marks) asked about leg by leg; how often fixes are labelled, marked with a symbol and given a direction arrow, set for one or more tracks at once, every 1 second to every 24 hours (CAP-32, planned, not yet scheduled); a ring on the fix nearest the pointer when zoomed out; simplifying a track (dropping fixes); where on a fix a label goes, and fix symbols and arrows; live bearing residuals while shearing or stretching (the TMA module, CAP-21); choosing which track wins where merged tracks overlap; renaming a track on its own.
