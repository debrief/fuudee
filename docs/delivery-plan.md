# Debrief v4 — Delivery Plan (Draft)

Oct 8, 2026 · @Ian Mayo

## Purpose and basis

This plan sequences delivery of the SRD (Debrief v4 Software Requirements Document, revision 91) in six phases, substrate first. It replaces the build sequence in `tracer-delivery-plan.md` and the milestone order in `REIMPLEMENTATION_ORDER.md`, both written before the SRD's architecture was settled.

It keeps two things from them: the tracer plan's schema test strategy (golden fixtures, round-trip tests, schema comparison), and the milestone order's dependency analysis within capabilities (clean tracks before sensors, sensors before TMA). Phases carry no dates; durations need estimating once the Phase 0 spikes report. Identifiers (SUB-, CAP-, DEV- and so on) refer to the SRD.

## Planning principles

- **Substrate before capabilities.** The SRD's section 5 is shared and domain-neutral; nothing community-specific starts until it stands (SRD 12.1: the shared core covers roughly the first year).
- **Risks measured early.** Questions that decide architecture (Tote latency, Pyodide compatibility, LinkML fit) are answered by spikes in Phase 0, not discovered in Phase 3.
- **Vertical slices, each demonstrable and blogged.** Every phase ends in something a stakeholder can see working, with a blog post written in the same pull request (DEV-02, DEV-03, DEV-05).
- **Practice before pixels.** The style guide, interaction models and formatting service exist before the first graphical feature (DEV-10, SUB-04).
- **Breadth last.** REP and .dpf first; other formats arrive later as importer tools (EXT-02).
- **Community work runs as two streams.** Once the core stands, D and O/N work proceed in parallel; their relative priority is a strategic choice (SRD 12.3).

## Supporting guides

The style guide, interaction models and tool-author guide start thin and grow with the code. Each version 0 is drafted from material that already exists; after that, a guide is extended in the same pull request as the feature that needs it, and published on the GitHub Pages site beside the blog with the same sensitivity check (DEV-05).

| Guide | Version 0 drawn from | Grows in |
| --- | --- | --- |
| Style guide: language | DOMAIN\_GLOSSARY.md, SRD terms, SUB-04 formatting defaults (Zulu time, units, position notation) | Every pull request adding user-facing text |
| Style guide: theme | VS Code theme tokens; legacy data-colour conventions such as red and blue tracks, reviewed by analysts | Phase 1 onwards |
| Style guide: UI | VS Code UX guidelines, the vscrui component inventory, codicons | Phase 1 onwards |
| Interaction models | The SRD requirements each pattern cites | Phase 1: selection and tool offering, tool invocation and forms, unavailable capabilities. Phase 2: undo, conflicts, long-running operations, check overrides. Phase 3: keyboard equivalents |
| Tool-author guide | The team's experience writing its first tools | Drafted in Phase 1; tested by a scientist in Phase 5 |

Each interaction model is one short page: the requirements it cites, a Mermaid sequence diagram, and a pointer to its reference implementation. Each guide has one named owner. Lint checks for terminology and theme-token use are built in Phase 1, and analysts review the data-colour palette and the Phase 1 interaction models.

### Keeping the guides coherent

Guides that grow one pull request at a time risk three failures: entries appended rather than placed, locally reasonable choices that contradict each other, and guides that each hang together but disagree with one another. Three measures guard against them.

**A skeleton.** Version 0 of each guide defines every top-level section, including empty ones marked with the phase that will fill them. New material goes into a known place; material that fits nowhere is flagged at review as either new territory or out of scope.

**A North Star.** One shared statement, derived from the SRD's North Star and principles, with a sharper line for each guide. Each must be concrete enough to settle a disagreement. The drafts below are for the team to refine in Phase 0.

| Guide | North Star (draft) |
| --- | --- |
| All guides | An analyst who has learned one part of Debrief can predict the rest. |
| Style guide: language | Say what an analyst would say: plain British English, glossary terms, never software jargon. |
| Style guide: theme and UI | Look native to VS Code; keep colour for what the data means. |
| Interaction models | Predictable and forgiving: the same gesture does the same thing everywhere, and nothing is silent or irreversible (SUB-21, SUB-28). |
| Tool-author guide | A scientist's first tool should take an afternoon. |

**Two mechanisms.** Every entry cites the principle it serves; an entry that cannot is a warning sign. Each guide's owner reads it end to end at every phase exit, resolving contradictions while they are few.

## Phase 0: Foundations

Phase 0 builds the type system, the kernel and the development practice, and answers the three architectural risks. It has no user interface.

| Workstream | Deliverables | SRD |
| --- | --- | --- |
| Schemas | LinkML models for the GeoJSON profile, STAC conventions, PROV, shared state, and tool declarations including the user-facing explanation field. Every file records its schema version, starting at 0.0.1. Generators for Pydantic, JSON Schema and TypeScript; the tracer plan's three-part schema test strategy in CI. | PRN-04, CON-01 to CON-04, SUB-12, SUB-26, TL-04, TL-06, CAP-24 |
| Kernel | UTC time with millisecond precision; units in the type system; geodesic geometry on WGS84 (range, bearing, closest approach); the display formatting service. | SUB-01 to SUB-04 |
| Practice | Repository, CI, GitHub Pages blog skeleton, pull-request template asking whether a post is needed and confirming nothing sensitive. First post: the architecture as a Mermaid diagram. Version 0 of the style guide and interaction models (see Supporting guides). | DEV-01, DEV-03, DEV-05, DEV-07, DEV-08 |
| Spike: Tote latency | Measure per-call REST against the 100 ms budget, for both time-slider and TMA-drag patterns. The result fixes the Tote and residual architecture. | NFR-04 |
| Spike: Pyodide | Confirm the core libraries chosen for tools and kernel run in the browser. The result constrains library choice from here on. | CON-09 |
| Spike: LinkML | Timebox a non-trivial model (a track with units and provenance) end to end. | PRN-04 |

**Exit:** generated types round-trip between Python and TypeScript; kernel tests pass against legacy tolerances; all three spikes have reported.

## Phase 1: Load and Look (tracer)

Phase 1 proves the whole architecture end to end: import a REP file into a catalogue, see it on a map in VS Code, run a tool on a selection, and see the result. It keeps the tracer plan's stages 1, 2, 3, 5 and 6, and drops its Electron loader.

| Workstream | Deliverables | SRD |
| --- | --- | --- |
| Catalogue | debrief-stac: create catalogue and plot, read, list assets, update; static file-based catalogue read locally. | SUB-05 to SUB-09, SUB-15, SUB-17 |
| Import | debrief-io REP parser to validated GeoJSON. Import copies the source as an immutable asset, records its content hash and a PROV entry. | EXT-01, SUB-10, SUB-11, SUB-18 |
| Configuration | debrief-config: known stores in a per-user JSON file, read from Python and TypeScript. | SEC-06 |
| Tool service | MCP over REST; runtime discovery; 3 to 4 representative tools chosen to be Pyodide-compatible; failing tools isolated; loopback-only listener with a per-session token. | TL-01 to TL-03, TL-05 to TL-09, SEC-07, SEC-08 |
| Practice | Guides grow with each feature; first interaction models; lint checks; tool-author guide drafted from the team's first tools (see Supporting guides). Version 0 must exist before any UI work starts. | DEV-07 to DEV-10 |
| VS Code extension | Catalogue browse with import (replacing the Electron loader); map component in Web Mercator with geodesic lines; outline view; selection; generated tool forms with explanations; execute, write, refresh. | CON-05 to CON-08, SUB-03, SUB-30, SUB-31, TL-07, TL-08, CAP-08, CAP-24 |
| Sample data | Hybrid sample data: open AIS for the background picture, a synthesised blue, red and sensor layer, scripted narrative, several serials, with its own provenance as a worked example. Needed for the Phase 1 exit screenshots and every later demonstration, walkthrough and interactive post. | DEP-08, SUB-18 |

**Exit:** the full tracer workflow demonstrable in VS Code, and the first graphical blog post (screenshots; interactive examples wait for the web build).

## Phase 2: Record and Replay

Phase 2 completes the substrate: every change is recorded, replayable and recoverable, and legacy plots can be brought in. After it, an analyst's work is safe.

| Workstream | Deliverables | SRD |
| --- | --- | --- |
| Provenance and undo | Deltas for every change to data; deterministic replay from sources; undo as replay to a point; local history for presentation changes (replaced on 12 Oct: colour and hiding are recorded changes, and view state that travels with a plot lives in its island; on 13 Oct the history moved into the plot file, and replay uses recorded outputs, never sources). | SUB-19 to SUB-24 |
| Shared state | Current time, selection and viewport, readable and settable by views, extensions and tools. | SUB-26, SUB-27, TL-10 |
| File safety | Schema-version refusal of newer files; shared-catalogue schema-version warning; detection of changes on disk; save-as-new on conflict; atomic saves; crash recovery by replaying deltas. | SUB-14, SUB-28, SUB-29, SUB-35, NFR-10, NFR-11 |
| Diagnostics | Local logging with parameter values, paths and feature names removed. | NFR-14 |
| Legacy import | .dpf import as an immutable source, with the unmapped-content message and provenance record. | EXT-14, EXT-15 |

**Exit:** an analyst edits, undoes, kills the process and recovers; a legacy .dpf plot opens with any omissions listed.

## Phase 3: Shared core

Phase 3 delivers the capabilities every community needs, ending in a pilot-ready core. It draws on the old milestones M2 to M5, rebuilt on the SRD's data model.

| Workstream | Deliverables | SRD |
| --- | --- | --- |
| Time | Time controller setting the plot's time window, one for the whole plot and saved in the plot file outside its history (the window itself is readable and settable through the tool service already); whole-deployment track views with sensor data limited to the window. | CAP-28, CAP-29, SUB-22 |
| Track operations | Drag, split, merge, jump removal, smoothing, OTG and DR modes, as deltas. Per-fix colour, labels and comments, which legacy plots carry and the Phase 2 .dpf import listed as not imported. Part A, done 14 Oct: a track, or its fixes in the time window, moved or rotated about a pivot on the map (move, rotate and pivot handles, live preview and readout, the keyboard) or through **Move track…** and **Rotate track…**, along geodesics; split at current time; merge, refused where tracks overlap in time; each one recorded step with its parameters in provenance. Part B1, done 14 Oct: shear and stretch, holding one end of the track or its fixes in the window, by the diamonds at its ends (live course, speed and displacement), the keyboard, or **Shear track…** and **Stretch track…**, each one step. Part B2, done 14 Oct: jump removal (fixes faster than a threshold to reach, by default three times the track's median speed and at least 10 kn, ringed on the map and listed; those the analyst confirms removed as one step); smoothing (a moving average along geodesics over an odd number of fixes, ends and times kept, previewed with how far fixes would move, applied as one step); per-fix colour, labels and comments as marked fixes, set from a fix list or by right-clicking a fix, shown on the map and comments in the Timeline, each one step, and imported from .dpf plots, so they are no longer listed as not imported (labels that only give the fix's time are, and where a label goes). Part B3, done 14 Oct: a single fix dragged on the map once zoomed in far enough that each fix in view has a ring of its own (only that fix moves; its time, recorded course and speed and mark stay; live distance, bearing and the speeds in and out, saying when it is as fast as a jump), by touch, the keyboard, or **Move a fix…** with the position typed, each one step; OTG and DR: each track of a REP file imported is asked about, over the ground or by dead reckoning, with *use this choice for future imports* remembered as the analyst's own setting (VS Code's Settings and their Debrief configuration; in the playground, the page's settings, with **Ask again**), the import's notes saying which and how to change it; the mode is kept on the track, and **Plot over the ground or by dead reckoning…** changes it as one step; a legacy .dpf leg plotted as DR is imported so, and the import says so; on a DR track every operation changes where it starts, or its courses and speeds, and the positions are worked out again (product owner, 14 Oct). Part B is complete. | CAP-01, CAP-02, EXT-14 |
| Annotation | Shapes, labels and chart furniture as GeoJSON; time-only annotations; temporal view. Annotation styling and circle and ellipse geometry, which the Phase 2 .dpf import lists as not imported. Part A, through forms, done 13 Oct: lines, areas, circles, ellipses, labels, markers and notes, styled, timed, changed and deleted as recorded steps; the north arrow; the Timeline; legacy styling and circles and ellipses imported (label symbols, fonts other than plain Arial, label colours of their own, arrowheads and some dash patterns are still listed as not imported). Part B, drawing and editing on the map, done 13 Oct: a drawing toolbar (line, area, circle, ellipse, label, marker) with live range, bearing and area in the analyst's units; finishing opens the form, so each finished annotation is one step; handles on a selected annotation, each release (or run of arrow keys) one step, named moved, resized or reshaped; every action from the keyboard. Snapping is not done. | CAP-03 to CAP-05, EXT-14 |
| Tote | Tote on the architecture chosen by the Phase 0 spike; measure groups stored in the study catalogue. Part A, done 14 Oct: one primary and several secondaries chosen in the Tote (lists, the keyboard) or from a track's menu in the outline (right-click, `Shift+F10`, press and hold), saved in the plot's island, never a step; the core measure group as legacy Debrief's Tote: range, bearing (true), relative bearing (red and green), angle on the bow, bearing rate, and each track's course, speed and depth, worked out in Python at current time where the map places each track, written with the analyst's units (a range under 1 nmi in yards where they are nautical miles; no course made up across a reversal), a track with no data saying when it has; shown as legacy Debrief's table, a row a measure and a column a track, the units in the row headings, scrolling sideways inside itself where narrow; a Tote view in VS Code's sidebar and a panel in the playground, where every side panel now folds away, remembered in the browser; a thin line on the map from the primary to each secondary, which the Tote turns off; `debrief/tote` and `debrief/measure_groups` for agents. Per-call requests measured at p95 of 10 ms in VS Code and 15 to 20 ms in the playground (all eight core measures), so the dense-sampling fallback is not built. Measure groups are in the schema; study groups in the study catalogue, and measures beyond core, are part B. Part B (study measure groups, and the measures beyond core: course and speed rate, Doppler, range rate, time and DTG) is deferred to the package of multi-plot bulk analysis (product owner, 16 Oct 2026). | CAP-06, CAP-07, NFR-04 |
| Narrative | Word and PDF import in legacy dialects; combined Zulu time axis. Narrative entry types, which the Phase 2 .dpf import lists as not imported. Part A, done 15 Oct: narrative entries as features of their own (time, source, type, text, the track they belong to; schema 0.0.19), each added, changed or deleted as one step; REP `;NARRATIVE:` and `;NARRATIVE2:` lines read as legacy Debrief read them, a REP file's narrative also read into an open plot as one step with its source; a .dpf plot's narrative entries with their types, so no longer listed as not imported; the sample's log moved from notes to narrative entries; every source on one Zulu time axis in one order (time, source, the source's own order), held by shared vectors; read in the Timeline (decision, product owner, 15 Oct 2026), now a webview in VS Code and the playground: a quiet table that follows current time without fighting the reader, chosen entries moving current time, filter by kind, source and type, search, a form to add and change entries, the keyboard and touch, virtualised for 60,000 entries (scrolling at 60 frames a second); the entry current time is at beside its track on the map; `debrief/narrative` and the four changing methods for agents. Part B, done 15 Oct: Word (`.docx`, `.doc`) and PDF narrative in legacy Debrief's four dialects (narrative log, Rider's narrative, ASW data as a track, dated narrative), ported with their tests' cases on synthetic documents and held to legacy Debrief's own expectations on its sample documents; read into the open plot as one step with the document as its source, its dialect and the analyst's choices recorded, the analyst asked first what legacy Debrief asked (types with counts, only within the plot's period, which track an unknown platform is), or imported as a plot of its own; the same in the playground, under Pyodide; `debrief/preview_narrative` and choices on `debrief/import_narrative` for agents; and the Timeline's extras, the reader's own, in one small menu: highlighted phrases, an off switch for choosing an entry moving current time, text size, wrapping and the columns shown. Follow-ups, done 15 Oct: a line starting with a number whose time would be out of order is text of the entry before, listed in the step's record; a file read into the plot before (by its content hash, under any name), or with entries already in it, is said to be, with the choice to skip those entries or read nothing (`duplicates` for agents). | CAP-05, CAP-19, CAP-20, EXT-04, EXT-14, NFR-06 |
| Collation | Coverage view, source preference, new-data marking, merging new data, upstream-revision flags. Done 16 Oct, in one pull request (product owner, 16 Oct 2026): a source is a catalogue item, an imported file or any plot; each item's tracks and the periods each has data for (first fix to last, broken at a gap of more than ten times the median time between fixes and more than five minutes; none without a median), kept in its STAC item at each change (`debrief:coverage`, with `debrief:revision`, the plot's content hash, and `debrief:drawn_from`; schema 0.0.21), so a catalogue's coverage is read from its items alone; in VS Code's Catalogues, each item's tracks with their periods, items marked *New data* (sparkle and words, the reason as tooltip and for screen readers) or *May need review*, and their menus; a **Coverage** view below it and the playground's **Catalogue** and **Coverage** panels, the same component: each of the open plot's tracks with a bar for every source of data for its platform, the periods it supplies filled, and a list choosing the item that supplies each period two items have data for; tracks of the same name (case and spaces ignored) proposed as one platform, confirmed, refused or linked by hand, each a step; the choice of source per period one step naming the items and periods (`supplies` on the track, stitched from the chosen periods); new data only through Debrief's import, marked when a file's import came in after the plot within the folder tree it draws from, sharing a platform with it and with data within its period (never a product, an item made by hand or one made from the plot; a colleague's copy only once it adds data), taken as one step naming the item (matched tracks gain fixes where they have none, periods another item supplies kept, unmatched tracks added; the analyst's moves, shears, stretches, smoothing and dragged fixes carried to new fixes by the offsets of the fixes either side; DR course and speed changes carried, positions reckoned again; marks, frequencies and annotations kept) or set aside (**Not now**, the island); any recorded change to an item a revision, the analyst told once (VS Code's notification, the playground's note) and every plot that drew from an earlier revision flagged until **Reviewed** (the island); the Timeline lists each track's data coverage by the item supplying it (CAP-05); `debrief/coverage`, `debrief/take_new_data`, `debrief/set_source_preference`, `debrief/link_tracks`, `debrief/dismiss_new_data`, `debrief/clear_review_flag` and `debrief/review_flags` for agents. Coverage of a 50-item study of 400,000 fixes in 150 to 230 ms when the plot is opened and 35 to 45 ms after, and of fifty gappy sources of a hundred spans each in 250 to 370 ms and 15 to 30 ms (budget 500 ms and 100 ms). Revised after an expert panel's review (16 Oct): revisions per period, new data as the product owner then decided, edits carried to courses and speeds, no step for data already taken. | CAP-05, CAP-08 to CAP-12 |
| Export | Images carrying an embedded GUID. Done 16 Oct, in one pull request (decisions, product owner, 16 Oct 2026): **Export image…** in both hosts draws the map as the analyst sees it (labels where the map placed them, symbols and arrows, annotations, current time's markers, the narrative box, the north arrow and the scale bar) as PNG or SVG, as on screen, a 1600 × 900 slide or A4 landscape, in the editor's colours or light ones for print; each image carries an ID naming the plot, the exact revision exported and the export (`DBF1-…` in PNG iTXt and XMP, SVG metadata), and a small footer with its short form (`DBF-PTET-KG8R-B9EM-69`, two exports of one revision told apart), on for every export, in the corner it covers least of; each export logged in the plot's island (schema 0.0.22), never a step, or in the analyst's own export log for a read-only catalogue. **Find source of image…** reads an image (or the pictures in a Word or PowerPoint file) or a typed footer ID, finds the plot in the analyst's catalogues and shows it as it was then, rebuilt by replay, read-only, at the view and time exported, with **Go to latest**. `debrief/figure_id`, `debrief/export_image` (an agent's drawn by the open map), `debrief/find_image_source` and `debrief/open_revision` for agents. Revised the same day after an expert panel's review and the product owner's answers (below). The ID's format is held by Python and TypeScript to shared vectors. | SUB-25, EXT-05, OUT-04 |
| Onboarding | Guided walkthroughs on the Phase 1 sample data; onboarding trial against the one-hour target. Done 17 Oct, with the web demo in one pull request (decisions, product owner, 17 Oct 2026): four walkthroughs (*Open and explore a serial*, *Import and collate*, *Tidy a track*, *Annotate and export a figure*), each on a fresh copy of the sample's serial 1 titled after it, never the sample (`debrief_sample.walkthrough`: *Tidy a track*'s with GPS glitches in RED ONE as a step of their own, *Import and collate*'s with BLUE ONE's navigation log to import); native in each host from one source of words (`vscode/walkthroughs/tours.json`): VS Code's Get Started page (`contributes.walkthroughs`, written from it), each step with a picture drawn from the sample in theme colours, a keyboard equivalent and a button that opens the copy or brings the command to hand, ticked by a context key set when the analyst does the step (the tool service's request succeeding, or a time, selection, Tote, Timeline entry or Coverage shown by hand), never by the button; the playground's *Walkthroughs* panel, the same steps and pictures, folding like every panel, from the keyboard, at 210 to 390 px. The trial, of what exists against a provisional 40 minutes, is written as a protocol (`docs/notes/onboarding-trial.md`) for the product owner to run, and is pending (formative, its pass rule pre-registered; REP and .dpf imported, a catalogue already added); the playground's test does its tasks as a speed run, 32 actions, failing above 36. Revised after an independent panel's review (17 Oct): each step acts and ticks only on its walkthrough's copy, starting again unticks it, and the *Walkthroughs* panel is folded outside the web demo (superseded 22 Oct: open everywhere, with a guidance accent; in VS Code opened once on first activation). A fifth, *Bearings and TMA*, 25 Oct (product owner, before the VSIX release): a side kept, a first guess, a drag to fit, a wild bearing left out and a split into legs, on serial 1's towed array. | DEP-08, CAP-25, NFR-09 |
| Web demo | Standalone web build with Python tools under Pyodide, fixed sample data, files the analyst opens read in the browser only (DEP-07 as amended, 17 Oct 2026). Interactive blog examples start here. Done 17 Oct: the web demo full screen at `/demo/` on the documentation site, linked from its home page: the playground's page with every panel and the walkthroughs, opening the fixed sample serials. A file the analyst chooses opens there, read in the browser only, never sent or stored (product owner, 17 Oct 2026, amending DEP-07): tested by watching every request while a file is imported (none carries it; every request only fetches) and by browser storage, IndexedDB and the Cache API holding nothing of it, before and after the tab is closed. The blog's demos are unchanged. Revised after the panel's review (17 Oct): a Content-Security-Policy on every playground page, Pyodide from jsDelivr with no integrity check, an accepted risk; the web demo keeps nothing derived from a file, its Timeline filter included, tested across every store, a Word narrative, an image found by its file, WebSockets and the tab closing. | CON-09, CON-10, DEP-06, DEP-07, DEV-06 |

**Exit:** a pilot-ready core on Windows 11, and on Windows 10 while VS Code supports it, installable as a VSIX file (NFR-12, DEP-01, DEP-02).

## Phase 4: Community products

Phase 4 runs two parallel streams on the shared core, one per lifecycle. Media synchronisation moves here from the old M11, as SRD 12.3 recommended.

| Stream | Deliverables | SRD | Outcome |
| --- | --- | --- | --- |
| O and N (overnight) | Storyboard of viewports with times and comments; exports to offline HTML, PowerPoint quad chart and rendered video; media synchronisation for video, image folders and narrative. | CAP-13 to CAP-18, NFR-05, NFR-07, EXT-06 | OUT-02, OUT-05 |
| D (long tempo) | Bearings and ambiguous towed-array bearings, with side resolution (bearings drawn as lines; wedges wait for an agreed error field, product owner, 24 Oct 2026). Done 24 Oct, pulled forward ahead of the Phase 3 exit release (product owner, 24 Oct 2026): sensors carried by their tracks, their cuts from REP, DSF, .dpf and a Rider's narrative, drawn in the time window from the host's position, the current cut emphasised; ambiguity resolved per cut (a click selects and offers the choices; `Alt`-click keeps) or for a period, each one step, undone or made ambiguous again; a towed array's offset astern (worm in the hole, as legacy), its cuts drawn and their sides told from the array, by the logged course; in the Outline under their track; `debrief/sensors`, `debrief/resolve_ambiguity`, `debrief/set_array_offset` and `debrief/import_sensor` for agents; in the sample, a bow sonar and an ambiguous towed array; schema 0.0.23. TMA solutions done 24 Oct (product owner, 24 Oct 2026): a period chosen from a virtualised, keyboard-accessible list of a sensor's cuts in a Bearings view; a solution made from it by form or by two clicks on the map, one step, a track by dead reckoning tagged with its contact and rooted in its cuts; dragged by the track drags with its residuals and RMS live in the view, after legacy's Stacked Dots, within the drag budget; cuts left out of the RMS, hidden cuts left out until shown (25 Oct), an ambiguous cut's other bearing faint; legs split at a time, each dragged on its own, the others staying put (25 Oct); legacy .dpf solutions imported; `debrief/tma_create`, `debrief/tma_residuals`, `debrief/tma_exclude_cut` and `debrief/tma_split_leg` for agents; schema 0.0.24. The Bearings view reworked as legacy's Bearing Residuals (25 Oct): time up the left, Bearing, Error and Course/Speed panes side by side, the Error axis fitted every frame (or held and widened, never clamped), green or pink against the analyst's cut-off, box zoom, a dot clicked selecting its cut or fix; a tall panel right of the map. Next: SATC and generated solutions only if D demand appears. | CAP-21, CAP-22, NFR-04, EXT-14 | OUT-01 |

Legacy content the Phase 2 .dpf import could not hold is listed in each plot's provenance, and the .dpf file is kept unchanged as its source, so re-importing it once these workstreams extend the schema recovers that content (EXT-14, EXT-15).

The D stream follows the old milestones' order: groomed sensor data (M6) before TMA (M7), with ambiguity resolution pulled forward from M9. If six people cannot staff both streams, the O/N storyboard and D sensor import run first and TMA follows once the storyboard ships. SATC and multi-leg generation follow only if D demand appears.

**Exit:** O or N produce an overnight deck in pilot; D produce a red track and report figures without leaving Debrief, with figures traceable by GUID (OUT-01). Both outcomes are the pilot-exit criteria named in SRD 12.2.

## Phase 5: Breadth and extension

Phase 5 widens what Debrief can take in and who can extend it. Its workstreams are independent and can be scheduled by demand, some alongside Phase 4. Cross-plot analysis stays here by decision (11 Oct): it is T's main value case, but Phase 4 is already two streams for six people.

| Workstream | Deliverables | SRD |
| --- | --- | --- |
| Scientist tools | Tool-author guide, drafted in Phase 1, validated by a scientist building a real tool without a contractor. | DEV-09, OUT-06, NFR-08 |
| Cross-plot analysis | Tools run across catalogue selections, unattended from the command line and in parallel where tools permit; results saved as catalogue items with full contributor lists; drill-down from an aggregated result to the plot that produced it. This is T's primary value case (Monte Carlo trials). | CAP-26, CAP-27, CAP-30, CAP-31, OUT-03, OUT-07 |
| Automation | Lifecycle hooks with overridable checks; agent parity, already implied by MCP. | TL-14 to TL-17 |
| Formats | Further importers as tools, one per structural shape first (line text, XML, binary). | EXT-02 |
| Archive | Legacy CSV exporter ported with its tests, columns unchanged, plus a GUID comment line; verify the recipient's ingest tolerates the comment line. | EXT-07, EXT-12 |
| Schema freeze | Schema 1.0.0 when the team judges it stable, with one-off migration of any pilot plots. | SUB-12, SUB-13 |
| Track display | Done 15 Oct: for one or more selected tracks at once, how often they are labelled with the time, marked with a symbol and given a direction arrow, from every 1 second to every 24 hours or off, held on the track (schema 0.0.20); one recorded step for all of them, as a track's colour is; **Frequencies…** in both hosts, `debrief/set_track_frequencies` for agents. Drawn on whole multiples of the interval of UTC, as legacy Debrief aligned them, at the positions the marker at current time uses, none inside a gap in the data; labels `HHmm` to port of the course, as legacy Debrief's; thinned to round times when zoomed out, and said; only what is in view drawn. A fix may always show its time label or symbol (force on only), from its menu, one step each. The intervals are shown with the track's details in the outline. | CAP-32, SUB-22 |

The schema freeze may come earlier, even before pilots, if the model settles.

## Deferred and dropped

| Item | Status | Reason |
| --- | --- | --- |
| SATC, multi-leg generation | Deferred | Lower priority for D (CAP-21) |
| Doppler, frequency residuals, multipath | Dropped | Frequency data and acoustics out of scope (CAP-22) |
| Tote part B: study measure groups; course and speed rate, Doppler, range rate, time and DTG measures | Deferred | To the package of multi-plot bulk analysis (product owner, 16 Oct 2026; CAP-07). Doppler here is a Tote measure from the tracks' own motion, not the frequency analysis dropped above |
| Derived uncertainty envelope | Deferred | Waits for analyst demand (SRD 12.3), and for a bearing error to build it from (below) |
| Bearing-error wedges | Deferred | No format Debrief reads gives an error with an agreed meaning; bearings are lines until a field is agreed with the acoustic replay application's owners (product owner, 24 Oct 2026; CAP-22) |
| Automatic ambiguity resolver | Deferred | A future requirement (CAP-33): proposing sides from ownship's manoeuvres for the analyst to confirm (product owner, 24 Oct 2026) |
| Rider bearings as sensor cuts | Done | Deferred on 15 Oct until sensor data came; done 24 Oct (CAP-22) |
| Plain-English requests | Deferred | Needs a local model; analyst laptops have no GPU (CAP-23) |
| .dpf write | Dropped | .dpf is import-only (EXT-14) |
| Electron loader | Dropped | Not one of the three hosts (CON-05); import lives in VS Code |
| Scripting engine (JavaScript, Groovy) | Dropped | Replaced by Python tools, hooks and agents (TL-14 to TL-17) |
| Legacy exporters (REP, GPX, SAM, WMF, BMP, GeoPDF) | Dropped | Not required by the SRD; GeoJSON, GUID images and the archive CSV (EXT-07) cover export |
| Direct geodata formats (VPF, DNC, ETOPO) | Replaced | Reference data arrives as pre-composited tiles (SUB-33, EXT-08) |

## Mapping from previous plans

| Previous | New home | Main change |
| --- | --- | --- |
| Tracer stage 0 (schemas) | Phase 0 | Adds schema versioning and the tool explanation field |
| Tracer stages 1, 2, 3, 5 | Phase 1 | Adds source hashing; tools chosen for Pyodide |
| Tracer stage 4 (Electron loader) | Dropped | Import moves into the VS Code catalogue browser |
| Tracer stage 6 (VS Code) | Phase 1 | Preceded by style guide and interaction models |
| M0 Core kernel | Phase 0 | Geodesic measurement and Web Mercator display, not a flat projection; milliseconds, not microseconds |
| M1 Load and Look | Phases 1 and 2 | GeoJSON in STAC, not Java wrappers; .dpf import only |
| M2 Play It, M3 Tidy It, M4 Annotate It, M5 Relate It | Phase 3 | Tote latency spiked in Phase 0; measure groups added |
| M6 Sensors, M7 Solve (Manual) | Phase 4, D stream | Ambiguity resolution pulled in; frequency editing dropped |
| M8 Solve (Automatic) | Deferred | SATC lower priority |
| M9 Acoustics | Mostly dropped | Only ambiguity resolution survives, in Phase 4 |
| M10 Format Breadth | Phase 5 | Importers as tools; geodata as tiles |
| M11 Products | Split | GUID images to Phase 3; storyboard, PowerPoint and media to Phase 4; scripting dropped |

## Next

The next phase is analysis tools and panels. Before it starts, the structural work found by the [health check of 7 Nov 2026](review-2026-11-07.md) lands first, in the order its fix plan sets out.

## Open decisions and risks

The decisions taken so far, from 11 to 28 Oct 2026, are in the [October decision log](decision-log-2026-10.md); new ones are recorded there or in a newer log. Still open:

- [ ] 24 Oct 2026, from the second panel's review (left for later, minor): **A .dpf's `ArrayMode` is read before `WormInHole` whatever their order**, where legacy took them in document order; an edge case only.
- [ ] 25 Oct 2026, backlog from the panel's review (#57), not built:
  - **Several sensors in one view**, their cuts in one list (agents can already root a solution in several).
  - ~~**What legacy's Stacked Dots has that the view has not**~~: built 25 Oct 2026 (below): ownship's course and the target's course and speed (a Course/Speed pane, not on the bearing plot), choosing dots in the plot (a click selects), zooming it. "Flipped axes" was a mislabel and is removed (below, 10).
  - **Residuals worked out live while ownship is dragged** (the cuts' origins move); now they are worked out when the drag is saved.

**Risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Front-loading | Phase 0 and the start of Phase 1 carry schemas, kernel, formatting, practice documents, blog and three spikes | Keep first versions of guides short; blog posts use screenshots until the web demo exists |
| Tote and drag latency | Per-call REST misses 100 ms, forcing a redesign late | Phase 0 spike; dense-sampling fallback already specified (NFR-04) |
| Pyodide limits | Some libraries will not run in the browser, limiting the demo and blog | Phase 0 spike; CON-10 explains tools unavailable in the web build |
| Sample data | Blocks walkthroughs, the web demo, interactive posts and the onboarding trial | Phase 1 workstream (DEP-08); needed by the Phase 1 exit |
| Proxy answers | One proxy remains beyond T's characterisation: accreditor acceptance of the local listener (SRD 12.1) | SEC-07 and SEC-08 pre-empt the likely objection, with stdio transport as the fallback; T's proxies are confirmed at pilot |
| vscrui | One maintainer and a deprecated toolkit underneath | PRN-09 keeps presentation replaceable |

## Milestone criteria

The SRD (12.2) hands these to the delivery plan. Each is confirmed by the phase named, not before; none is an open requirement.

| Criterion | Confirmed in | SRD |
| --- | --- | --- |
| Per-call REST meets the 100 ms Tote budget, or the dense-sampling fallback is adopted | Phase 0, Tote latency spike | NFR-04 |
| REP and DSF carry an optional bearing error field; if not, agree the field with the acoustic replay application's owners | Checked 24 Oct 2026: they do not (`;SENSOR3:`'s bearing accuracy has no stated meaning, and legacy threw it away). Bearings are drawn as lines; agreeing the field is open, with the acoustic replay application's owners | CAP-22, EXT-01, EXT-03 |
| The archive recipient's ingest tolerates a GUID comment line | Phase 5, Archive | EXT-07, EXT-12 |
| A real O multi-platform serial fits the track-heavy volume profile | Phase 4, O and N stream, first overnight deck | NFR-06 |
| OUT-01, OUT-03, OUT-05 and OUT-07 confirmed with their communities | Phase 4 and 5 pilots | Section 8 |
