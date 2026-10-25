# TMA solutions

How an analyst makes a target motion analysis (TMA) solution from a period of bearing cuts, reads its bearing residuals in the Bearings view, drags it on the map with the residuals following, leaves wild cuts out of the RMS, and splits it into legs. How legacy plots' solutions come in. Decisions of the product owner, 24 Oct 2026, unless said otherwise; hidden cuts, independent legs and both bearings of an ambiguous cut, 25 Oct 2026.

A newcomer learns it from the walkthrough *Bearings and TMA* ([walkthroughs](walkthroughs.md)), on the sample's towed array: a side kept, a first guess, a drag, a wild bearing left out and a split into legs. Its buttons use **Show bearings** with something to choose (`debrief.showBearings` with a `TmaFocus`: a cut, a period and the first guess's form, or the largest residual).

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-21 | A TMA solution is rooted in a selected period of bearing data, its positions at the sensor's observation times in that period, with live bearing residuals while it is dragged. Solutions generated automatically (SATC) are out of scope. |
| CAP-22 | Bearings and ambiguous bearings, resolved to one side by the analyst: what a solution is rooted in ([sensors and bearings](sensors.md)). |
| CAP-01, CAP-28 | Tracks and their manipulation; the time window. |
| PRN-08 | Analysts work from bearings over time, as legacy Debrief's Stacked Dots showed them. |
| SUB-22, SUB-24 | Every change is one recorded, undoable step with its parameters. |
| EXT-14 | Legacy plots are read as legacy Debrief read them, and what is not imported is listed. |
| NFR-04 | The drag budget: the map follows the pointer smoothly, and what depends on the drag within 100 ms. |
| NFR-13 | Everything works from the keyboard, and by touch. |

## Model

1. **A solution is a track.** A TMA solution is an ordinary track plotted by dead reckoning (DR), so every track operation works on it unchanged: move, rotate, shear, stretch, split, merge, colour, hide, the Tote. What makes it a solution is its `tma` tag (`TmaSolution`, schema 0.0.24): the **contact** it is a solution of (*Contact 1*), the **sensors** whose cuts it was made from, its **period**, the **cut ids** it is rooted in, the times its **legs** start, and the cuts **left out** of its RMS. Its sensors are always those of the cuts it is rooted in: when a sensor's track is split and its later cuts become another sensor's, the solution names that sensor too. The Outline tags it **TMA** (in VS Code, *TMA · Contact 1*).
2. **Rooted by cut ids.** A solution remembers which cuts it was made from by their ids, not by sensor and period, so it keeps them when its sensor's track is split (and the later cuts become another sensor's) or merged. Its fixes are at the observation times of the cuts shown on the map, one at each distinct time, in the period chosen; its courses and speeds are those of its DR legs, in knots. It has no logged courses or speeds of its own.
3. **Made in one step,** from a period chosen in the Bearings view's list of a sensor's cuts and a **first guess**, either way:
    - **By form.** The range along the first cut's bearing, the course and the speed. Debrief's defaults: **10,000 yd** (said in the analyst's length unit: *4.94 nmi*), a course **across the bearing** (the bearing plus 90°), **8 kn**. A towed array's unresolved first cut asks which of its two bearings to start on.
    - **By two clicks on the map.** The first cut's line and the last cut's are drawn on the map; click on the first, then on the last. Each click is taken onto its line (the nearest point on it, from the cut's origin outwards); the course and speed follow from the two points and the cuts' times. A click behind the sensor is on no line, and the map says so. Escape stops.

    The step is named so the History reads it: *Contact 1 solution made: 60 Bow sonar cuts 12:24:00Z–13:08:30Z*. Its notes say the first guess as given (*First guess: 5.00 nmi along 257.5°T from where the first cut was taken, then 347.5°T 6.0 kn*), and its record holds the request. The next contact's number is the first not in use.
4. **Which cuts count.** Every cut of the period on the sensors chosen, **except those hidden on the map**, as legacy Debrief's default (*Only plot visible data*; product owner, 25 Oct 2026). A hidden cut in the period is still rooted, so **shown again it counts again**, with nothing else to do; while hidden it is listed, marked ⊘, its residual given but neither drawn nor counted, and the view says how many (*3 hidden cuts left out: they are hidden on the map, and count again once shown.*). A legacy plot's `Visible="false"` cuts come in hidden, so its RMS is legacy's. A solution of hidden cuts alone is refused. Each cut's bearing is measured from where the cut was taken: its sensor's array astern of the ship, or its own origin; a cut whose origin Debrief worked out when its track was split (`origin_derived`) is counted and marked ◇. A cut outside its host's fixes or the solution's gives no residual, and the view says how many.
5. **Residuals.** For each rooted cut: the **measured** bearing less the **calculated** one, the bearing from the cut's origin to the solution's position at the cut's time (along the geodesic between its fixes, the later fix where two share a time), wrapped to −180° to 180°. A resolved cut is measured by the bearing kept. **An unresolved ambiguous cut is measured by whichever of its two bearings is nearer the solution**, and the view says so (*12 ambiguous cuts not yet resolved: each is measured by the bearing nearer the solution (marked ≈)*), so the analyst knows the RMS assumed a side. **Its other bearing is drawn too**, faint, with its residual (`other_residual`), and never counted, as legacy drew both, so the analyst can pick a side from the plot (product owner, 25 Oct 2026). The **RMS** is over the cuts counted: those with a residual, shown on the map, not left out.
6. **Left out of the RMS.** A wild bearing is left out of the RMS, and counted again, as one step each: *Contact 1 solution: cut at 12:24:30Z left out of the RMS*, its notes saying the RMS before and after. Several cuts at once are one step. Only rooted cuts can be left out. A cut left out keeps its residual, drawn as a dotted ring and struck through in the list.
7. **Legs.** A solution is split into **legs at a time**, one step (*Contact 1 solution split into legs at 12:53:30Z*): the cut chosen in the view (a manoeuvre picked in the bearings), else current time. Each leg needs two fixes or more. It stays **one track**: its legs are periods of it, each starting at a fix (`leg_starts`). On the map, **This leg** (beside *Whole track* and *Time window* under *What changes*) drags **the leg the analyst clicks** on the map, at first the one current time is in, by any of the track drags; the note says which (*Contact 1 solution, leg 2 of 3*). A split is offered only where the leg there keeps two fixes or more either side, as Debrief accepts it.

    **How the join behaves (product owner, 25 Oct 2026).** Each leg is independent, as in legacy Debrief. The legs are joined by the stretch from one leg's last fix to the next leg's first. Dragging a leg moves **only that leg**: the legs before and after it, already fitted, never move. The two joins next to it are solved again: the leg before's last fix takes the course and speed that reach the dragged leg's new first fix, and the dragged leg's last fix takes the course and speed that reach the next leg's first fix, so dead reckoning from the first fix still puts every fix where it is. The map's preview shows the same while the drag goes on. Dragging the whole solution moves every leg together. The step's notes say *The other legs stay where they are: the joins either side of the leg are solved again*.

    **Split track**, the ordinary track operation, still splits a solution into two tracks: each is then a solution of its own, rooted in its own cuts. **Merge** joins solutions back into one, each later solution a leg of it, its cuts and exclusions together; each earlier solution's last fix is aimed at the next one's first fix, as a legacy plot's legs are joined, so **merging moves nothing**. A solution is merged only with other solutions: merged with a track that is not one, Debrief refuses and says why.
8. **Legacy plots' solutions** (.dpf, EXT-14). A legacy TMA track comes in as a solution track: its **absolute** legs as legacy saved them (origin, course, speed); its **relative** legs converted at import to positions, from where the host's sensor array was at the leg's start plus the saved offset, along the geodesic, and the notes say so, with the most any fix is from where legacy drew it. On legacy's sample plots that is mostly within 0.07 nmi, for two reasons where it is more: **midflow2**'s 0.22 nmi is because its saved positions leave out its sensors' plain arrays, 300 and 400 m astern, which v4 applies, as current legacy Debrief does on load; **2648_tx** (0.56 nmi over a 16.6 h leg) and **Ambig_tracks3** (0.15 nmi at 60°N) are legacy's flat earth, where v4 works along geodesics. Each fix is worked out by DR from the leg's course and speed; the legs are joined by their joins; a **dynamic infill** between legs is not a fix of the solution (the join takes its place), said in the notes. It is rooted in its host sensor's cuts within its legs; a solution of absolute legs alone names no sensor, so it is rooted in the cuts of the sensors of the legacy tote's primary track within its period, as legacy Stacked Dots measured it, and the notes say so. TMA tracks are no longer listed as not imported; legacy's *TMA solution set* (contact ellipses) still is.
9. **For agents.** `debrief/tma_create` (writing) makes a solution from `sensor_ids` and a `period` (or `cut_ids`), a contact name, and the first guess (`range`, `course`, `speed`, `first_bearing`, or `first_position` and `last_position`; none for Debrief's defaults). It answers the feature, the notes and its residuals. `debrief/tma_residuals` (reading) answers a solution's residuals (`TmaResiduals`: a row per rooted cut, with the other bearing's residual of an unresolved ambiguous cut; the RMS, how many counted, left out, hidden, without a residual, measured by the nearer side, from a derived origin). `debrief/tma_exclude_cut` leaves cuts out of the RMS or counts them again; `debrief/tma_split_leg` splits a solution into legs at a time, or with `join` joins a leg to the one before. Each writing method is one step. Held to `schemas/vectors/tma-residuals.json` in both languages.

```mermaid
sequenceDiagram
  actor Analyst
  participant View as Bearings view
  participant Map
  participant Host as Host (VS Code or playground)
  participant Python as debrief/tma_*
  Analyst->>View: a sensor's cuts; Shift+Down to the period's last cut
  Analyst->>View: Make solution…, the first guess's form (10,000 yd, across, 8 kn)
  View->>Host: tma_create {sensor_ids, period, range, course, speed}
  Host->>Python: debrief/tma_create
  Python-->>Host: one step: "Contact 1 solution made: 60 Bow sonar cuts 12:24:00Z–13:08:30Z"
  Host->>View: the solution's residuals, RMS
  Analyst->>Map: drag the solution's end (shear)
  loop each frame of the drag
    Map->>Host: tma_preview {feature_id, coordinates}
    Host->>View: preview: residuals worked out again, RMS "(while dragging)"
  end
  Analyst->>Map: let go
  Map->>Host: one step: "Contact 1 solution (DR) sheared: 353.9°T 7.0 kn"
  Host->>Python: debrief/tma_residuals
  Python-->>View: the residuals, exact again
```

## The Bearings view

In VS Code, **Bearings** in Debrief's side bar, after the Timeline (**Show bearings** on a sensor's or a solution's menu in the Outline). In the playground, a panel beside the Timeline and Coverage under the map, its group made taller (300 px, at most half the height) when a solution is first shown, so its plots show whole; made shorter again by the reader, it stays so. It follows the selection: a sensor's cuts when a sensor, a cut or its track is selected; a solution's residuals when a solution is.

- **Sensor** and **Solution** lists at the top: whose cuts are listed, and which solution's residuals are shown (*None: list the sensor's cuts*).
- **The plots**, after legacy's Stacked Dots: measured bearings over time (filled dots, in each cut's colour; a ring for one measured by the nearer of two bearings, its other bearing a faint dot, never counted; a dotted ring for one left out; none for a cut hidden on the map), the solution's calculated bearings as a line in its colour, legs' starts dashed, current time a line; the residuals beneath, against zero. Bearings are unwrapped so a contact passing north stays one line. A click moves current time to the nearest cut. While a drag goes on, the axes hold as they were when it began, so the dots move rather than the scale. The canvas is described for a screen reader (*Bearings and residuals of Contact 1 solution over time: RMS 2.1° over 60 cuts*).
- **The RMS** beneath, and what it assumed (ambiguous cuts by the nearer side, cuts without a residual, derived origins, hidden cuts left out). While a solution is dragged it says *(while dragging)*.
- **The list of cuts**: time, bearing (both, for an unresolved ambiguous cut; with a solution, the one measured, ≈ for the nearer of two), and with a solution, its residual and whether it counts. One sensor is listed at a time, so the sensor is its swatch's colour, not a column; where a solution's cuts are of more than one sensor, each row says its sensor to a screen reader. Narrower than 280 px (a side column, about 200 px at a 768 px window) the tick boxes go, so each time, bearing and residual reads whole; Space and the button still leave a cut out. **Virtualised**: rows of one height whatever the font (the text in VS Code's font size), only those in sight in the page, so it scrolls thousands of cuts as easily as ten. A listbox: each option says its place and the list's size (`aria-posinset`, `aria-setsize`), and the cut chosen stays in the page when scrolled out of sight, so the list's active descendant is always there. Each row is read as *12:24:30Z, 260.2°, residual +1.6°*.
- **The period** chosen, said beside **Make solution…**. Until the analyst chooses, it is the cuts in the time window, following it; then it stays as chosen.
- **The cut chosen's buttons**: **Previous ambiguous** and **Next ambiguous** (the unresolved cut before or after, and current time to it); **Keep 031.9° (starboard)**, **Keep 267.7° (port)** and **Make ambiguous again** for an ambiguous cut, one step each as on the map; **Leave this cut out of the RMS** or **Count this cut in the RMS**; **Split into legs at 12:53:30Z**.

The view is wide and short under the map, narrow and tall in VS Code's side bar: from 640 px wide the plots and buttons are beside the list, otherwise above it. Beside the list in a short panel the plots keep their place and take the height; what is beneath them (the RMS, the notes, the buttons, the form) scrolls.

## Live residuals while dragging

The map previews a drag as it always has (a drag is one step only when let go). For a solution, each frame's positions go to the Bearings view, which works the residuals out again in the browser (the same geodesic and the same rules as Python, held to the same vectors) at most once a frame. Let go, and Python's residuals for the saved step replace them. A drag put back (Escape) puts the residuals back.

A frame does only what changes: the residuals worked out again (each row's cut and time parsed once, before the drag begins, and the rows written again in place), the RMS, the residual cells of the rows in the page (nothing rebuilt), and the plots (their size read once, dots of one kind and colour drawn as one path, a dot where its like is already drawn left out). The whole frame is timed. Measured in headless Chromium on a shared four-core machine, sixty frames each: 600 cuts, median 3 to 5 ms; 1,000 cuts, 5 to 7 ms; 2,000 cuts, 9 to 12 ms, its 95th percentile 15 to 19 ms; the worst single frame at 2,000 cuts 15 to 30 ms, from the machine's pauses rather than the work (NFR-04's 100 ms either way). The playground's test drags a solution of 600, 1,000 and 2,000 cuts and holds each median within a frame.

## Keyboard and touch

The list is one tab stop. Up and Down move the cut chosen, Shift with them (or Shift-click) extends the period; Home, End, Page Up and Page Down as usual; Ctrl+A chooses every cut. Enter moves current time to the cut, so the map emphasises it. **Alt+Down** and **Alt+Up** go to the next or previous unresolved ambiguous cut. With a solution shown, **Space** leaves the chosen cuts out of the RMS, or counts them again; it never changes the cuts chosen, which Shift and the arrow keys do (a multi-select list often toggles a choice with Space; here the choice is a period, so Space is free for the RMS). The first guess's form takes the keyboard first, at the range; each field says what it means beneath it as it is typed (*Means 5.00 nmi.*), and a mistake before anything is sent. **Two clicks on the map instead** has no keyboard way of its own: the form is the keyboard's. On the map, **This leg** is a button like *Whole track*, and the drags are the track's, with their keys ([track operations](track-operations.md)); from the keyboard, the leg dragged is the one current time is in (Enter on a cut in the list moves current time to it), and a click or tap on the solution's line picks another. A tap is a click.

## Not yet

- **Generated solutions** (SATC, or a solution fitted to the bearings): out of scope (CAP-21).
- **Residuals while ownship is dragged**: ownship moves the cuts' origins; the residuals are worked out again when the drag is saved, not while it goes.
- **Several sensors at once** in the view's list: agents can root a solution in several sensors' cuts; the view lists one sensor at a time.
- **What legacy's Stacked Dots has that the view has not yet**: ownship's course on the bearing plot, a plot of the target's course and speed, choosing or hiding dots in the plot, zooming it, and flipping its axes.
- **Legacy's TMA solution set** (contact ellipses): still listed as not imported.

## Reference implementation

- **Model:** `TmaSolution`, `TmaRequest` in `schemas/linkml/features.yaml`; `schemas/linkml/tma.yaml` (the view's rows and the residuals); the rules in `debrief_schemas.documents` (a contact named, the period in order, cuts rooted once, cuts left out only of those rooted, legs in order; a request by form or by clicks, not both).
- **Python:** `debrief_kernel.tma` (residuals, vectorised; the first guess; a click onto a cut's line); `debrief_stac.tma` and `Catalogue.create_tma`, `tma_residuals`, `tma_exclude`, `tma_split_leg`, with `split_track` and `merge_tracks`; `debrief_io.dpf_tma` (legacy solutions); `debrief/tma_create`, `debrief/tma_residuals`, `debrief/tma_exclude_cut`, `debrief/tma_split_leg` in `debrief_tools.service`.
- **Hosts:** `vscode/webview/tma.ts` (residuals while dragging, words), `vscode/webview/tmacontrol.ts` (the view), `vscode/webview/tmamap.ts` (two clicks), `vscode/webview/trackmap.ts` (*This leg*); `vscode/src/panels/bearingsview.ts` and the commands `debrief.tmaCreate`, `debrief.tmaSplitLeg`, `debrief.tmaExclude`, `debrief.showBearings`; the playground's in `vscode/play/host.ts`.
- **Tests:** `python/debrief-kernel/tests/test_tma.py`, `python/debrief-stac/tests/test_tma.py`, `python/debrief-io/tests/test_dpf_tma.py`, `python/debrief-tools/tests/test_tma_service.py`, `vscode/test/unit/tma.test.ts`, `vscode/test/play/tma.mjs`, and a step of `vscode/test/integration/suite.ts`; vectors `schemas/vectors/tma-residuals.json`.
