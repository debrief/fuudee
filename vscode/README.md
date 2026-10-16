# Debrief for VS Code

The Phase 1 tracer, as a VS Code extension (CON-05):

- **Catalogues view.** Browse your catalogues and import plot files: REP, legacy `.dpf`, and Word (`.docx`, `.doc`) or PDF narrative, a document's narrative a plot of its own (CAP-08, CAP-19). **Add a plot file…** adds a plot file a colleague sent you, with its whole history, so you can undo what they did (SUB-19, decision 13 Oct).
- **The map.** Opens beside the views in Web Mercator, with lines drawn along geodesics (SUB-03, SUB-30).
- **Outline.** Plot features, supporting files and reference data (SUB-31).
- **One selection.** Selecting in the map or the outline selects everywhere (SUB-26).
- **Tools view.** Offers the tools that apply to the selection, and explains the rest (TL-08, TL-09, CON-10).
- **Tool forms.** Generated from each tool's declaration (TL-07, CAP-24).
- **Results.** Shown in a panel beside the map (TL-13).
- **Annotations.** **Add annotation…** on the Outline view opens a form for a line, area, circle, ellipse, label, marker or note: positions in the analyst's notation, sizes with their units, a time or period, and a style. Change or delete one from the outline's menu, or double-click it on the map. Each is one step in the plot's history; **North arrow** on the Outline view's menu shows the chart's north arrow (CAP-03, CAP-04). Or draw one on the map with its toolbar (Line, Area, Circle, Ellipse, Label, Marker): the form opens to name it. Selected alone, an annotation shows handles to drag, or to move with the arrow keys; each release is one step. See [annotations](../site/docs/guides/interaction-models/annotations.md).
- **Track operations.** A track selected alone shows a move handle, a rotate handle and the pivot it turns about: drag one, or `Tab` to it and use the arrow keys, and the whole track (or, with **Time window** on the map, its fixes in the window) moves or turns along geodesics; each release is one step, named like *BLUE ONE moved 1.20 nmi 045.0°T*. Two diamonds beside its first and last fixes shear it (one end held, course and speed changing together, as legacy Debrief's TMA shear) or, with **Stretch** chosen on the map, stretch it (speed only). The outline's menu on a track has **Move track…**, **Rotate track…**, **Shear track…**, **Stretch track…**, **Split track at current time…** and **Merge selected tracks** (CAP-01, CAP-02, CAP-21). See [track operations](../site/docs/guides/interaction-models/track-operations.md).
- **Labels, symbols and arrows.** Select tracks and run **Frequencies: labels, symbols and arrows…** (the outline's menu or the Command Palette): how often each is labelled with the time, marked with a symbol and given a direction arrow, from every second to every 24 hours, or off; one step for all of them, held per track and shown in the track's tooltip in the outline. The map draws them on whole multiples of the interval of UTC, thinned when zoomed out. A fix can always show its time label or symbol, from its menu (CAP-32).
- **Cleaning tracks.** **Find and remove jumps…** offers a speed (three times the track's median, at least 10 kn), rings the jumps found on the map and lists them, all ticked; those left ticked are removed as one step. **Smooth track…** draws the track as smoothing would leave it, says how far fixes would move, and applies it as one step. **Fixes: colour, label or comment…** (or right-click a fix on the map) gives a fix a colour, a label or a comment of its own, each one step; comments are in the Timeline. A legacy plot's per-fix colours, labels and comments are imported (CAP-01, EXT-14).
- **Single fixes and dead reckoning.** Zoomed in far enough, a track selected alone has a small ring on each fix in view: drag one (or `Tab` to it and use the arrow keys) and only that fix moves, its time and recorded course and speed kept; the map says how far, which way and the speeds it now implies to reach it and go on. Each release is one step, named like *RED ONE fix at 09:31:00Z moved 0.42 nmi 045.0°T*. **Move a fix…** on the outline's menu (or **Move…** on a fix's menu) takes a typed position. Importing a REP file asks, for each track, whether it is plotted over the ground (OTG) or by dead reckoning (DR), as legacy Debrief did; choose *Use this choice for future track imports* (the list's last line, ticked or not) to be asked no more. That choice is your setting **Debrief: Track import mode**, kept with your Debrief configuration and never in a plot; **Debrief: Ask again whether imported tracks are OTG or DR** clears it. **Plot over the ground or by dead reckoning…** changes a track's mode later, as one step; over the ground again after a change made while plotted by dead reckoning asks first, as that change is lost. A track plotted by dead reckoning is tagged *DR* in the outline and on the map (CAP-01). See [track operations](../site/docs/guides/interaction-models/track-operations.md#single-fixes-and-dead-reckoning).
- **Timeline view.** The plot's narrative entries from every source, with its notes, periods and fix comments, in one time order on one Zulu time axis (CAP-05, CAP-20; decision, product owner, 15 Oct 2026). It follows current time while playing, without taking the keyboard, until the analyst scrolls it (**Follow time** starts it again); choosing an entry moves current time to it. **Filter** by kind, source and type, and search. **+** (or **Add narrative entry…**) adds an entry, **Edit** and **Delete** on the row change and delete one, each one step. **Read narrative into this plot (REP, Word, PDF)…** reads a second platform's log in as one step: a REP file's narrative lines, or a Word or PDF document in legacy Debrief's dialects (a narrative log, a Rider's narrative, dated lines), asking first, as legacy Debrief did, which types of entry to read, whether only those within the plot's period, and which track a platform with none of its name is (CAP-19). **⋯** beside **Filter** holds the analyst's own view, kept with the view and never in the plot: words and phrases to highlight, whether choosing an entry moves current time, text size, wrapping, and which of the time, source and type columns show. The entry current time is at is shown beside its track on the map. Only the rows in sight are drawn, so 60,000 entries scroll at 60 frames a second. See [Timeline and narrative](../site/docs/guides/interaction-models/timeline.md).
- **Time view.** At the top of the sidebar: the plot's time window, current time within it, and play (CAP-28, SUB-26). The window is saved in the plot file, outside its history. See the [time controller](../site/docs/guides/interaction-models/time-controller.md).
- **Tote view.** Below it, folded until first used: one primary track and several secondaries, with range, bearing, relative bearing, angle on the bow and bearing rate from the primary and each track's course, speed and depth at current time (and a thin line on the map from the primary to each secondary, which the view turns off), worked out by the tool service as current time moves (CAP-06, CAP-07, NFR-04). Choose the primary and add secondaries in the view, or from a track's menu in the outline: **Set as Tote primary**, **Add to Tote**, **Remove from Tote** (on every selected track). The choice is saved in the plot file's island, never a step; `debrief.setTote` sets it for agents. See the [Tote](../site/docs/guides/interaction-models/tote.md).

How these behave is set out in the [interaction models](../site/docs/guides/interaction-models/index.md) and the [style guide](../site/docs/guides/style-guide/index.md).

## How it works

| Part | Where | Notes |
| --- | --- | --- |
| Extension host | `src/` | Reads catalogues to display them (`catalogue.ts`). Anything that changes data goes through the Python tool service (`service.ts`), where domain logic lives (PRN-03). |
| Tool service | `python/debrief-tools` | Started by the extension with a fresh token for each session, on `127.0.0.1` only (SEC-06 to SEC-08). |
| Webviews | `webview/` | The map (Leaflet), the time controller, the Tote and the Timeline (plain DOM, `timecontrol.ts`, `totecontrol.ts`, `timelinecontrol.ts`), the tool form, the annotation form and results (React with vscrui, behind `ui.tsx`). Every message to and from a webview is validated against `WebviewMessage` (CON-08). |
| Colours | `webview/palette.ts` | The only place with hard-coded colours, all of them data colours. Interface colours are `--vscode-*` tokens (DEV-07). |

## Running it

Needs Node 22, and a Python with Debrief's packages installed. From the repository root, `uv sync` provides one.

```bash
for p in schemas kernel config; do npm ci --prefix ts/$p && npm run --prefix ts/$p build; done
cd vscode && npm ci && npm run build
```

Then open `vscode/` in VS Code and press F5. Set **Debrief: Python** to the interpreter, such as `.venv/bin/python` in the repository.

## Checks

```bash
npm run typecheck
npm test                 # unit tests, including reading a catalogue Python wrote
npm run check:theme      # no hard-coded interface colours (DEV-10)
npm run check:language   # no terms the language guide says to avoid (DEV-10)
xvfb-run -a npm run test:integration   # the tracer in real VS Code; set DEBRIEF_SCREENSHOTS to keep screenshots
```

The integration test:

1. builds the sample catalogue (DEP-08);
2. opens serial 1;
3. selects tracks and opens a tool form;
4. runs range rings, closest approach and track summary;
5. checks that each run was recorded in the plot's history;
6. adds, restyles, undoes and deletes annotations, shows the north arrow, moves current time from the Timeline; adds, changes, deletes and undoes a narrative entry, reads a REP file's narrative and a Word narrative (with the types and a platform's track given) into the plot, and checks the entry current time is at is shown beside its track on the map; opens the form for an area drawn on the map and changes an area as the map's handles do; moves BLUE ONE as its handle does, rotates it, moves part of RED ONE, splits it at a time and merges it again (refusing tracks that overlap); shears BLUE ONE as its end does and through **Shear track…** and **Stretch track…** with values given, and opens the shear form; moves a single fix of RED ONE as its ring does and through **Move a fix…** with a position given, opens the form, plots RED ONE by dead reckoning and over the ground again, imports a REP file with each track's mode given, with the choice remembered (said in the import's notes), and asked again; and imports a legacy plot with styled circles and ellipses; chooses the Tote's primary and secondaries by command, checks the choice is in the plot's island and no step, moves current time sixty times a second and reports how long the Tote's values took to show (NFR-04).

CI runs it on every pull request and keeps the screenshots as an artifact.

## Not yet

- **Removing a catalogue from the list.**
- **Keyboard selection on the map** (NFR-13, Phase 3).
- **Drawing bearings** (Phase 4).
- **Narrative from Word and PDF** (CAP-19, narrative part B).
- **Data coverage in the Timeline** (CAP-05, with collation).
- **Graphs.** These are shown as tables for now.
- **Packaging as a VSIX** (Phase 3, DEP-01).
