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
| Track operations | Drag, split, merge, jump removal, smoothing, OTG and DR modes, as deltas. Per-fix colour, labels and comments, which legacy plots carry and the Phase 2 .dpf import lists as not imported. Part A, done 14 Oct: a track, or its fixes in the time window, moved or rotated about a pivot on the map (move, rotate and pivot handles, live preview and readout, the keyboard) or through **Move track…** and **Rotate track…**, along geodesics; split at current time; merge, refused where tracks overlap in time; each one recorded step with its parameters in provenance. Dragging single fixes, jump removal, smoothing and OTG and DR modes are part B. | CAP-01, CAP-02, EXT-14 |
| Annotation | Shapes, labels and chart furniture as GeoJSON; time-only annotations; temporal view. Annotation styling and circle and ellipse geometry, which the Phase 2 .dpf import lists as not imported. Part A, through forms, done 13 Oct: lines, areas, circles, ellipses, labels, markers and notes, styled, timed, changed and deleted as recorded steps; the north arrow; the Timeline; legacy styling and circles and ellipses imported (label symbols, fonts other than plain Arial, label colours of their own, arrowheads and some dash patterns are still listed as not imported). Part B, drawing and editing on the map, done 13 Oct: a drawing toolbar (line, area, circle, ellipse, label, marker) with live range, bearing and area in the analyst's units; finishing opens the form, so each finished annotation is one step; handles on a selected annotation, each release (or run of arrow keys) one step, named moved, resized or reshaped; every action from the keyboard. Snapping is not done. | CAP-03 to CAP-05, EXT-14 |
| Tote | Tote on the architecture chosen by the Phase 0 spike; measure groups stored in the study catalogue. | CAP-06, CAP-07, NFR-04 |
| Narrative | Word and PDF import in legacy dialects; combined Zulu time axis. Narrative entry types, which the Phase 2 .dpf import lists as not imported. | CAP-19, CAP-20, EXT-04, EXT-14 |
| Collation | Coverage view, source preference, new-data marking, merging new data, upstream-revision flags. | CAP-08 to CAP-12 |
| Export | Images carrying an embedded GUID. | SUB-25, EXT-05 |
| Onboarding | Guided walkthroughs on the Phase 1 sample data; onboarding trial against the one-hour target. | DEP-08, CAP-25, NFR-09 |
| Web demo | Standalone web build with Python tools under Pyodide, fixed sample data, no upload. Interactive blog examples start here. | CON-09, CON-10, DEP-06, DEP-07, DEV-06 |

**Exit:** a pilot-ready core on Windows 11, and on Windows 10 while VS Code supports it, installable as a VSIX file (NFR-12, DEP-01, DEP-02).

## Phase 4: Community products

Phase 4 runs two parallel streams on the shared core, one per lifecycle. Media synchronisation moves here from the old M11, as SRD 12.3 recommended.

| Stream | Deliverables | SRD | Outcome |
| --- | --- | --- | --- |
| O and N (overnight) | Storyboard of viewports with times and comments; exports to offline HTML, PowerPoint quad chart and rendered video; media synchronisation for video, image folders and narrative. | CAP-13 to CAP-18, NFR-05, NFR-07, EXT-06 | OUT-02, OUT-05 |
| D (long tempo) | Bearings and ambiguous towed-array bearings, with side resolution and optional bearing-error wedges; TMA solutions rooted in a selected bearing period; TMA module with manual drag (translate, rotate, stretch, shear), live bearing residuals and residual views, meeting the drag budget. Sensor cuts and TMA solutions from legacy plots, which the Phase 2 .dpf import lists as not imported. | CAP-21, CAP-22, NFR-04, EXT-14 | OUT-01 |

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

The schema freeze may come earlier, even before pilots, if the model settles.

## Deferred and dropped

| Item | Status | Reason |
| --- | --- | --- |
| SATC, multi-leg generation | Deferred | Lower priority for D (CAP-21) |
| Doppler, frequency residuals, multipath | Dropped | Frequency data and acoustics out of scope (CAP-22) |
| Derived uncertainty envelope | Deferred | Bearing error itself is in scope (CAP-22); the envelope waits for analyst demand (SRD 12.3) |
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

## Open decisions and risks

**Decisions needed before Phase 0 ends**

- [x] Electron loader: dropped, with no replacement scaffolding. Import builds straight into the VS Code catalogue browser. (11 Oct)
- [x] Time precision: milliseconds (SUB-01) stands. Sub-millisecond legacy timestamps are truncated on .dpf import and recorded in provenance (EXT-14). (11 Oct)
- [x] LinkML fallback: PRN-04 now names hand-written JSON Schema as the fallback for affected types only, gated on the Phase 0 spike failing its exit criterion. (11 Oct)
- [x] Phase 4 order under staffing pressure: O/N storyboard and D sensor import run first; TMA follows once the storyboard ships. (11 Oct)

**Decisions taken during Phase 3**

- [x] One plot file, with its view inside it: analysts pass one plot file to a colleague, with no files beside it. Content goes into history (recorded, undoable, with provenance); view state that travels with the plot goes into the plot's island, the view of its whole-plot feature, outside the history's hashes and replay. Colour and hiding are content. The time window is one per plot, in the island, replacing per-layer display windows. `presentation.json` is retired. A plot of the current schema version that still has one becomes one recorded step on first opening; before schema 1.0 older plots cannot be opened at all (SUB-13), so in practice this rarely runs (SUB-22, CAP-28). (12 Oct)
- [x] The time controller: one window, set with a two-handled slider over the plot's period and saved in the island when the analyst lets go, not as it moves; current time within the window; play at 1×, 10×, 60×, 600× or 3600× real time. In VS Code it is a view at the top of the Debrief sidebar, the same component as the playground's; the map only draws. Within the window tracks are drawn in full; outside it each whole track stays as a faint line, giving CAP-29's whole-deployment view; annotations with a time are drawn only within the window. The range of current time in shared state is the window as shown: it follows a drag at once, and a tool may widen it on screen, not in the plot file (CAP-28, CAP-29, SUB-26). (12 Oct)
- [x] Three time-controller rules (expert panel, unanimous). Context tracks: solid and thin, no ticks or labels, the track's hue made quieter, at least 3:1 against the map on any theme by default; a plot may draw them visible, faint or hidden (saved in its island; named so that none reads as transparent, product owner 13 Oct), and the setting `debrief.map.minimumContextContrast` draws faint as visible for an analyst who needs it; high-contrast themes draw them opaque. The window is at least one second; Play is off, and says why, when the window is shorter than one tick at the chosen speed. A tool's time outside the saved window is shown, never saved: the window widens by the least amount (to at most twice its length, else moves), the difference is hatched, and a note offers Keep and Revert until the analyst chooses; dragging the window counts as Keep. Only a tool whose purpose is to set the window, run by hand on that plot, saves it, through the normal path (CAP-28, CAP-29, SUB-28). (12 Oct)
- [x] 13 Oct, product owner: one file, history included. A plot is one file an analyst can pass to a colleague: `plot.geojson` carries the plot's whole history (every step, with its operation and output, its provenance records, whether it is undone or replaced, and the current step) beside its content and its island, as the GeoJSON member `history`. Passing the file passes undo, redo, going back to a step and provenance; a colleague adds it to a catalogue with **Add a plot file…**, which records one more step and rewrites none. Sources are not transported: a source's first import is already a step holding Debrief GeoJSON, so replay never needs it; a catalogue may keep its sources for audit (SUB-10), and provenance still names each source and its hash. All history is kept, always: no cap, no automatic folding, no flatten command. The history is protected by a chain of checksums, checked on opening and on adding a file; a plot whose history fails them is shown but never changed, and a plot whose content no longer matches its history is rebuilt from it with the file as found kept aside (SUB-19, SUB-22, SUB-24, NFR-11). Each change rewrites the whole file atomically; the history folder and `head.json` are retired, and a plot that still has them has them moved into its plot file the first time a writer opens it. Before schema 1.0 only files of the current schema version open (SUB-13), so in practice this move rarely runs. (13 Oct)

- [x] 13 Oct, product owner: dragging a track moves the whole track, or a selected time period of it, as legacy Debrief does: translated or rotated about a pivot, both along geodesics, each release one recorded step; the joins of a period moved jump, and are shown doing so. Dragging single fixes comes later. Split at a time and merge are one step each; merging tracks that overlap in time is refused with a plain message saying where, rather than asking which wins (CAP-01, CAP-02). (13 Oct)

- [x] 13 Oct, product owner: annotations through forms first. Shapes, labels and notes are added, changed, restyled and deleted through a form (and the same tool-service methods for agents and the playground), each as one recorded, undoable step named in the History view. GeoJSON has no curves, so a circle or an ellipse is a polygon of 72 sides along geodesics, for other tools and for the plot's extent, with its exact centre and size as properties, from which Debrief draws and edits it. Style (colour, line, fill, label) is content, as a track's colour is (12 Oct). Time-only annotations are listed in a Timeline view; choosing one moves current time, outside the window shown as a tool's time is (CAP-28). Chart furniture is kept minimal: the scale bar and a north arrow the plot shows or not. Drawing on the map is part B (CAP-03 to CAP-05, EXT-14). (13 Oct)

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
| REP and DSF carry an optional bearing error field; if not, agree the field with the acoustic replay application's owners | Phase 4, D stream, before bearing import | CAP-22, EXT-01, EXT-03 |
| The archive recipient's ingest tolerates a GUID comment line | Phase 5, Archive | EXT-07, EXT-12 |
| A real O multi-platform serial fits the track-heavy volume profile | Phase 4, O and N stream, first overnight deck | NFR-06 |
| OUT-01, OUT-03, OUT-05 and OUT-07 confirmed with their communities | Phase 4 and 5 pilots | Section 8 |
