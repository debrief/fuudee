# Debrief v4 — Software Requirements Document (Draft)

Sep 26, 2026 · @Ian Mayo

## 1. Purpose and North Star

**Debrief empowers analysts to extract insight from military activity, enabling improved warfighting capability.**

This document states what Debrief v4 must do. It replaces the legacy v3 application (Debrief NG) for its existing communities, on a modern, extensible platform.

### 1.1 Supporting statement

Defence already records its exercises and deployments in detail. The value lies in turning that record into understanding quickly enough to act on it. Today that work is slowed by a 25-year-old toolset, by tool training that consumes the first day of every exercise, and by reports whose figures cannot be traced back to their data.

Debrief v4 removes that friction. One shared core serves every community, so each organisation pays a fraction of the upkeep. Every result carries a record of how it was produced. Scientists can add their own tools without a contractor.

**Why fund this now.** Legacy Debrief still works, but it is a 25-year-old Eclipse application that fewer people each year can maintain, and every change to it goes through a contractor. Each community that adopts it pays again: for training, for its own report pipeline, and for any tool it needs. Accreditation is renewed against an ageing stack with no path to agents or new communities.

Debrief v4 changes the shape of the cost rather than adding to it. One shared core, maintained once, serves six communities and a seventh in prospect, so each pays a fraction of the upkeep. A new analysis tool is a Python file a scientist writes, not a contract. A report figure traces back to its data, so answering a query is a replay, not a repeat of the work. The cost of waiting is paid in analyst time: a day per exercise lost to training, days per deployment lost to windowing and re-assembly, and findings that cannot be defended because their lineage is gone.

### 1.2 Reading this document

- Requirements carry an identifier (for example `SUB-03`) and use **shall** for mandatory and **should** for desirable behaviour.
- User communities are referred to by initial: D, N, O and T.
- Items marked **Open** are unresolved and listed again in section 12.
- Statements marked **(proxy)** record the lead developer's judgement on a community's behalf. They still need confirming with that community.

## 2. Scope and product framing

Debrief v4 is a generic analysis capability. Its generality is the product, not a compromise between customers.

### 2.1 Demonstrated commonality

The common core is observed fact rather than hypothesis. Every current community (four within D, plus O and T) already runs legacy Debrief on one codebase. N has not yet used it but follows the same overnight pattern as O.

The shared work extends beyond infrastructure. Track editing, annotation, the Tote, narrative handling, and import and export are needed by everyone. Community-specific work (TMA and sensor analysis for D; storyboard products for O and N) only begins once that core exists.

### 2.2 Axes of variation

Communities differ along two axes. Provenance is not an axis; it is part of the common core.

| Axis | Range | Example |
| --- | --- | --- |
| Tempo | Overnight to months | O presents results the afternoon after an exercise day; D reports 2–5 months later |
| Fidelity | Best available to raw | O's overnight pass uses whatever data exists; a second pass a month later uses raw data |

The overnight and deep passes are independent options, not a sequence. T analyses simulated data only, so its runs are repeatable by design and it sits off the fidelity axis; its variation is in the number of runs.

### 2.3 Ownership of requirements

These requirements are a synthesis across communities, owned by the lead developer. They are not a collection of individual stakeholder requests.

### 2.4 Out of scope

- Cross-study accumulation of tactical findings. No useful historic data exists for it.
- Enforcing classification or data release. These remain user responsibilities (section 11).
- Real data on the public demonstration instance.
- Legacy v3 reading v4 files. Legacy content enters v4 by one-way import only (EXT-01, EXT-14).
- A prescribed analysis pipeline. Debrief records what was done; it does not dictate what to do.

## 3. User communities and operating context

Debrief serves six existing communities and one prospective one. About 50 people use it across UK defence.

| Community | Work | Tempo | Distinctive need |
| --- | --- | --- | --- |
| D operational analysis | Post-deployment reconstruction and reporting | Months | Red track by TMA; horizontal measures |
| D stealth assurance | Assurance studies | Months | Understanding-led analysis |
| D red deployment study | One analyst, up to 3 months of a foreign warship's deployment | Months | Multi-sensor fusion; horizontal analysis |
| D scientist-analysts | Bespoke analysis | Varies | Write their own tools |
| T | Analysis of simulated trials, including Monte Carlo runs; no real data | Bounded by simulation run time (often a weekend), then by analysing many runs by hand | Standard measure core plus per-trial extras, run across every run; aggregate first, then drill into outliers (proxy) |
| O | War-game exercises | Overnight, plus optional deep pass | Collate from mixed sources; quad-chart storyboard |
| N (prospective) | Exercise analysis | Overnight | New analysts every exercise; tool onboarding |

### 3.1 Long-tempo lifecycle (D)

1. Data is hand-carried back about 3 weeks after deployment.
2. Processing takes 5 days to a week. Outputs are Debrief tracks, sonar contact files, and time-bearing contacts exported from a separate acoustic replay application.
3. The red track does not exist in the data. Analysts construct it by TMA as a single best solution.
4. Analysts work in 6–12 hour windows because bearing lines overwrite and the plot becomes illegible. The window is set by rendering limits, not by the engagement.
5. The narrative document is the index. The product is a Word report with many screenshots, where lineage is currently lost.
6. Tracks are deposited one-way with another government organisation for archiving.

### 3.2 Overnight lifecycle (O, N)

1. Exercises run in serials of 4, 6, 12 or 24 hours, all in Zulu time.
2. Analysis starts the morning after an exercise day. Results are presented late that afternoon. This deadline is a hard commitment.
3. The product is a PowerPoint template with four quadrants, typically one slide per hour.
4. Narrative diaries from each platform, in Word, must be combined.
5. A deeper pass with raw data may follow about a month later. It is where the tactic is actually assessed.

### 3.3 Handover between roles

Work is sequential per person but overlaps in time. A data curator may still be finishing a serial's input data while an analyst has begun analysing it.

### 3.4 Trends

- Arriving analysts have less domain knowledge than their predecessors. Debrief should automate the mechanical, explain the judgement, and let plain-English intent drive domain tools.
- For N, the problem is tool onboarding rather than domain support. Recovering the day lost to training on each exercise is the value case.

## 4. Guiding principles and architectural constraints

These principles constrain every requirement that follows. Where a later requirement seems to conflict with one, the principle wins unless this document says otherwise.

| ID | Principle |
| --- | --- |
| PRN-01 | **Record what was done; don't prescribe what to do.** Every change to data is recorded and replayable. No pipeline is imposed. |
| PRN-02 | **Provenance travels with the data.** It lives inside each file, so it survives copying and needs no separate store. |
| PRN-03 | **Domain logic lives in Python.** Python is the language of every organisation with programming staff. Performance concerns are met by budgets and batching, not by moving logic. |
| PRN-04 | **One type vocabulary.** Every type crossing a process or language boundary is generated from LinkML, on both sides, never hand-written. If the Phase 0 LinkML spike fails its exit criterion, hand-written JSON Schema is the fallback for the affected types only; the generation rule still applies to everything else. |
| PRN-05 | **The filesystem controls access.** Debrief inherits folder permissions rather than implementing its own access control. |
| PRN-06 | **Offline first.** Network access is off by default. |
| PRN-07 | **Readable without Debrief.** Plots are plain GeoJSON, STAC and PROV. No proprietary container. |
| PRN-08 | **The analyst owns the data.** Checks advise, and the analyst may override. Overrides are recorded. |
| PRN-09 | **Presentation is replaceable.** Component logic sits behind the host, so UI libraries can be swapped. |

### 4.1 Type system

- **CON-01** Types may stay language-local only if they are never serialised and never cross a process or language boundary. Python-to-Python IPC counts as a boundary. A disk cache is exempt if it is derived from authoritative data, read only by the code that wrote it, and discarded rather than migrated when its version does not match. A cache read by another language or process is a boundary type.
- **CON-02** Data LinkML expresses badly (numeric arrays, dataframes, geometry) shall be carried as an opaque payload in a standard format (Arrow, Parquet, GeoJSON), declared in LinkML by reference. Sensor observations, such as weeks of bearings (NFR-06), are the primary case. The LinkML envelope shall carry the format, a versioned reference to the payload's inner schema, units, CRS and time reference.
- **CON-03** Hand-written wrappers around generated types shall add behaviour only and never redeclare fields.
- **CON-04** Each external standard (GeoJSON, STAC, PROV) shall be explicitly classed as imported into LinkML or trusted as external. Hand-mirroring is not permitted.

### 4.2 Hosts

- **CON-05** Debrief is primarily a VS Code extension. It shall support three hosts: native VS Code views, webviews inside VS Code, and a standalone web build.
- **CON-06** Webview and web-only UI shall use the vscrui library. A web-only host shall supply the `--vscode-*` theme variables.
- **CON-07** Whether each shared component (layer manager, properties, outline) is native or webview shall be decided per component. Its logic shall not depend on that choice.
- **CON-08** Messages between the extension host and webviews are boundary types under CON-01.
- **CON-09** The standalone web build shall serve only the demonstration instance (DEP-06) and the blog's interactive examples (DEV-06). In it, the Python tools shall run in the browser (for example via Pyodide), using the same tool declarations as the desktop build. No server-side tool service is needed, and each visitor's work stays in their own browser. Tools that cannot run in the browser shall be handled under CON-10.
- **CON-10** A capability unavailable in a host shall never fail at the point of use. It should be shown with an explanation of where it is available, rather than hidden.

## 5. Functional requirements: substrate

The substrate is shared, domain-neutral, and the basis of the shared-cost argument. It is needed before any community-specific capability.

### 5.1 Kernel

- **SUB-01** Timestamps shall be stored in UTC with millisecond precision. Time-zone conversion shall be presentation only.
- **SUB-02** Physical quantities shall carry units in the type system, encoded in LinkML. Arithmetic across incompatible units shall be prevented.
- **SUB-03** Geometry, projection and relative-geometry calculations (range, bearing, closest approach) shall be substrate services available to every capability. All measurement shall be geodesic on WGS84, independent of the display projection. The map shall display in Web Mercator, drawing lines such as bearings and ranges as geodesics.
- **SUB-04** Units, position notation (for example decimal degrees or degrees and minutes) and date-time shall be formatted for display through a single configurable substrate service, never within individual views or tools. Stored values are unaffected (SUB-01, SUB-02).

### 5.2 Data model and storage

- **SUB-05** The unit of analysis shall be a GeoJSON FeatureCollection, stored as an asset of a STAC item.
- **SUB-06** Content that cannot be expressed in GeoJSON (video, imagery, acoustic files, non-spatial results) shall be stored as supporting-file assets of the same STAC item.
- **SUB-07** A plot shall be fully readable without Debrief, using only GeoJSON, STAC and PROV.
- **SUB-08** An exercise model (serials, phases, participants, time reconciliation) shall sit alongside STAC, owned by a small internal component.
- **SUB-09** Storage access shall sit behind an interface, so a database backend (for example pgstac) could be added without changing the data model.
- **SUB-10** Source data referenced by provenance shall be treated as immutable. Debrief shall never modify an imported source file. A revision to source data shall arrive as a new source linked to its predecessor, supporting CAP-12. A catalogue may keep the sources it imported, for audit, but sources do not travel with a plot: the first import of a source is recorded in the plot's history as Debrief GeoJSON, provenance names each source and its content hash (SUB-11), and nothing in a plot file needs the source to be present (decision, 13 Oct 2026).
- **SUB-11** Provenance shall record a content hash of each source, computed once on import. Before replay, Debrief shall verify only the sources that replay reads, and report any that are missing or changed. A source whose size and modification time are unchanged since it was last verified need not be re-hashed.
- **SUB-12** Every plot and catalogue file shall record the version of the data-file schema it was written against. The schema shall be versioned independently of Debrief releases, starting at 0.0.1 and held under version control. Version 1.0.0 marks the frozen schema, which may come before or after pilot releases begin.
- **SUB-13** Debrief shall open files written against any schema version from 1.0.0 onwards, migrating them to the current schema. The migration shall be recorded in provenance. Earlier schema versions carry no such guarantee, except that plots produced during pilots before 1.0.0 shall receive a one-off migration to 1.0.0.
- **SUB-14** Debrief shall refuse to open a file written against a newer schema version than it supports, with a message naming the version required. It shall never partially load such a file. A plot file's history is part of the file: it is written against the same schema version and refused with it.

### 5.3 Catalogue

- **SUB-15** The STAC catalogue shall be a static, file-based structure. Debrief shall query it by reading and filtering the JSON locally.
- **SUB-16** An optional SQLite index may sit alongside the catalogue, holding spatio-temporal bounds, participants and reverse lineage. It shall be derived, never authoritative, and rebuildable from the JSON.
- **SUB-17** Debrief shall present a composite view of several catalogues, showing each item's source catalogue.
- **SUB-35** A shared catalogue (EXT-10) shall declare the data-file schema version (SUB-12) it holds. Debrief shall warn before writing a file of a newer schema version into it, since other users of that catalogue may be unable to open the file (SUB-14).

### 5.4 Provenance and reproducibility

- **SUB-18** Each FeatureCollection, and where needed each feature, shall carry a PROV array recording the operations that produced it.
- **SUB-19** Every change to data (tool outputs, edits, imports, deletions and named sets) shall be recorded as a delta, whether or not its output is kept. Prior states shall be reachable by replaying the recorded deltas from the first, not by inverting operations; each delta holds its operation and its output, so replay needs neither the tool nor the source file. A plot's whole history (every step: its delta, its provenance records, whether it is undone or replaced, and which step is current) is kept inside the plot file, so passing one plot file to a colleague passes its history, its undo and redo, and its provenance. All history is kept: it is never capped or folded. The history shall be protected against changes made outside Debrief by a chain of checksums: each step's checksum covers the step and the one before it, and the current step records a checksum of the plot's content. Debrief shall check them on opening a plot and on adding a plot file, shall not change a plot whose history fails them, and shall say in plain words what failed (decision, 13 Oct 2026).
- **SUB-20** Replay shall be deterministic. Operations that use randomness shall record their seed.
- **SUB-21** Undo shall be implemented as replay to a point. Tools shall not be required to implement undo. Undo, redo and going back to a step work on every step in a plot's history, whoever made it: an analyst given a plot file can undo a step made by the colleague who sent it.
- **SUB-22** Content goes into history; view state goes into the island. Content is everything a plot holds, including how its features are styled (a track's colour, an annotation's appearance) and whether each is hidden on the map: every change to it is a recorded, undoable step with provenance (SUB-19). View state shall be neither undoable nor recorded. Some view state travels with the plot, so an analyst can pass one plot file to a colleague with no files beside it: it is kept in the plot file as the plot's island, on the plot's own whole-plot feature, and its first member is the plot's time window (CAP-28). The island shall be left out of the history's hashes, checksums and replay, so changing it never conflicts with a change to content and undo never changes it; two analysts changing it at once shall be told rather than silently overwritten (SUB-28). The plot's content hash leaves out both the island and the history, which sits in the same file beside it (SUB-19). Current time, selection and viewport are view state that is not saved (SUB-26). (Decision, 12 Oct 2026; replaces presentation kept beside the plot with a local history.)
- **SUB-23** Links to parent documents shall be authoritative. Links to child documents may be stored as a convenience hint but shall never be trusted. Children shall be found by walking the catalogue.
- **SUB-24** Provenance shall record the tool version, including user-written tools, and the identity of any agent and model that made a change. Adding a plot file received from a colleague to a catalogue shall be recorded as one more step, naming the file and who added it, without rewriting any earlier step.
- **SUB-25** Images exported from Debrief shall carry an embedded GUID in their metadata linking back to their source.

### 5.5 Shared state

- **SUB-26** Debrief shall maintain three pieces of shared state: current time (an instant and a range), selection, and viewport.
- **SUB-27** Views, extensions and tools shall all be able to read and set each piece of shared state. Shared state types are boundary types under CON-01.
- **SUB-28** Debrief shall detect when a plot has changed on disk since it was opened, whoever or whatever changed it, and shall never silently overwrite that change.
- **SUB-29** On conflict, Debrief shall offer to save the analyst's work as a new plot. Where the two sets of changes touch different features, it should also offer to merge them by replaying the other change's recorded deltas. Overlapping changes shall not be merged automatically. Debrief shall not lock plot files; SUB-28 and this requirement are the safeguard against concurrent editing.

### 5.6 Rendering and the outline

- **SUB-30** One portable map component shall serve all three hosts and exported HTML storyboards.
- **SUB-31** The outline view shall show one sectioned tree: plot features; supporting files; and reference data.
- **SUB-32** Supporting files shall open in a sub-window when selected. They shall have no visibility toggle.
- **SUB-33** Reference data (coastlines, bathymetry, boundaries) shall arrive as pre-composited tiles, switchable in the reference-data branch. Live tactical data shall remain as editable features rendered by Debrief.
- **SUB-34** Measurement on screen shall work identically over reference tiles and Debrief features.

## 6. Functional requirements: tool library and extensibility

Analysis operations are Python tools served over MCP. The same tools serve Debrief's interface, agents, and lifecycle hooks.

### 6.1 Tiers

| Tier | Author | Examples |
| --- | --- | --- |
| Core | Debrief team | Track operations, geometry, measures, import and export |
| Domain packs | Debrief team | TMA, air-domain calculations |
| Scientist libraries | Users | Bespoke analysis, quality checks, narrative dialects |

### 6.2 Hosting

- **TL-01** Tools shall be exposed through a Python MCP service over REST. A command-line invocation route may also be provided.
- **TL-02** The framework shall not depend on tools sharing a process, so each library can be isolated later. Whether libraries run in one server or several is an implementation decision.
- **TL-03** A failing tool shall not stop the Debrief extension, and shall not stop other tool libraries from loading.

### 6.3 Declaration and discovery

- **TL-04** LinkML shall define the build-time vocabulary: the data types tools operate on, and the form of a parameter declaration.
- **TL-05** The tool catalogue shall be discovered at runtime from whichever libraries are loaded. Debrief shall not need rebuilding to add a tool.
- **TL-06** Each tool shall declare the feature types it applies to, using a taxonomy or wildcards, and the parameters it needs.
- **TL-07** Debrief shall generate a parameter form from each tool's declaration. A buffer tool, for example, needs only a distance.
- **TL-08** The tools offered for a selection shall be the intersection of those applicable to every selected item.
- **TL-09** User-written tools shall use Debrief data types. A tool declaring an unknown type shall not be offered, and Debrief shall report why.

### 6.4 Inputs and outputs

- **TL-10** Tools shall be able to read and set current time, selection and viewport.
- **TL-11** A tool may return any combination of: new features; modifications; deletions; non-spatial results (a number, table or graph); named sets of features; and changes to time, selection or viewport. A named set shall be saved in the plot and be reusable as a selection or as input to another tool. Time periods are returned as features with null geometry (CAP-04), not as sets.
- **TL-12** Deletion is permitted. It shall be recorded in provenance like any other operation.
- **TL-13** Non-spatial results shall appear in a temporary panel. Saving shall add the result as a child asset of the current STAC item. The operation shall be recorded whether or not the result is saved.

### 6.5 Agents

- **TL-14** Agents shall be able to drive every tool, with the same permissions as a user.
- **TL-15** Agent-facing tool descriptions shall be derived from the same LinkML types, and tuned for reliable use by an agent.

### 6.6 Lifecycle hooks

- **TL-16** Analysts shall be able to bind tools to lifecycle events: plot opened, data imported, data modified, before save, and after save.
- **TL-17** A hooked check that fails before save shall warn and offer an override. The analyst may save anyway, and the override shall be recorded.

## 7. Functional requirements: capabilities

Capabilities are replaceable and are where feature requests land. Each shall be replaceable without changing the substrate. Most are ports of legacy features with existing Java code and unit tests.

### 7.1 Track operations

- **CAP-01** Debrief shall support dragging, splitting, merging, jump removal and smoothing of tracks, and the legacy OTG and DR import modes. Dragging moves the whole track, or a selected time period of it, as legacy Debrief does: translated (every fix the same range along the same bearing, along geodesics) or rotated about a pivot (each fix keeping its range from it); the joins of a period moved are not smoothed. Dragging single fixes comes later. Merging tracks that overlap in time is refused, saying where (decision, product owner, 13 Oct 2026). Shear, the drag analysts use most with TMA legs, and stretch come first of CAP-21's drags, on any track: one end of the period held, a shear moves every fix in proportion to its time from it (course and speed change together), a stretch scales each fix's range from it (speed only) (decision, product owner, 13 Oct 2026). Jump removal finds fixes the platform could not have reached in time (faster than a threshold the analyst may set, by default three times the track's median speed and at least 10 kn), shows them on the map and in a list, and removes only those the analyst confirms; smoothing is a moving average over an odd number of fixes along geodesics, keeping the ends of what is smoothed and every time, previewed with how far fixes would move before it is applied. Single fixes may carry a colour, a label and a comment of their own, as legacy plots do, found by their time so they stay with their fix through every other track edit, shears and stretches among them (decision, 14 Oct 2026).
- **CAP-02** Track edits shall be destructive in the working plot. Each shall be recorded as a delta under SUB-19.

### 7.2 Annotation and temporal view

- **CAP-03** Annotations (shapes, labels, chart furniture) shall be ordinary GeoJSON features, inheriting provenance, export and tool support. GeoJSON has no curves: a circle or an ellipse shall be kept as a polygon approximating it, so other GeoJSON tools see the area it covers, together with its exact centre and size, from which Debrief draws and edits it along geodesics. How an annotation is drawn (colour, line style and width, fill, label size and position) is content (SUB-22). Adding, changing and deleting an annotation are each one recorded, undoable step (SUB-19).
- **CAP-04** Annotations with only a time shall use null geometry.
- **CAP-05** An optional temporal view should show narrative entries, time-only annotations, and data coverage per source, supporting collation (CAP-08). Choosing an entry shall move current time to it. (The Timeline view shows time-only annotations, narrative notes included; data coverage arrives with collation.)

### 7.3 Tote and measures

- **CAP-06** The Tote shall show relative geometry between one primary and several secondaries, updated with current time.
- **CAP-07** The Tote shall be a view onto a measure group: a named, reusable set of measures tied to a mode of analysis. A measure group may extend a shared core with study-specific measures. A measure group shall be defined by a study's lead analyst and stored as an item in the study catalogue, shared by every plot in the study.

### 7.4 Catalogue browser and collation

- **CAP-08** Collation shall be performed in the STAC browser: managing the catalogue, viewing coverage, importing, and converting data. It is not a separate component.
- **CAP-09** The choice of which source to prefer shall be the analyst's, made in the browser with coverage visible.
- **CAP-10** When new data arrives for the current plot, the browser shall mark it with an icon or halo. The mark shall be limited to the folder tree the current plot draws from.
- **CAP-11** The analyst shall choose when to take new data. Taking it shall merge into the plot, preserving annotations and reconstruction.
- **CAP-12** When upstream data is revised, the analyst shall be told, and the browser shall highlight downstream products that may need review.

### 7.5 Storyboard

- **CAP-13** The analyst shall compose a storyboard as a sequence of viewports, each with a time and narrative comments.
- **CAP-14** A storyboard shall export to three formats:
  - standalone HTML with an embedded map, runnable without Debrief, where viewers can move between slides and pan and zoom;
  - a PowerPoint quad-chart deck for overnight products;
  - video, rendered from the storyboard rather than recorded live.
- **CAP-15** HTML export shall be fully offline, including only the map tiles its viewports need. Debrief should warn when the export will be large.

### 7.6 Media synchronisation

- **CAP-16** Video, folders of time-stamped images, and narrative shall follow current time inside Debrief, in VS Code sub-windows.
- **CAP-17** An image folder shall either highlight the current image or show the image nearest the current time, full size.
- **CAP-18** Video shall follow both playback and scrubbing.

### 7.7 Narrative

- **CAP-19** Debrief shall import narrative from Word and PDF in the dialects the legacy parsers support, ported to Python with their tests.
- **CAP-20** Narratives from several platforms shall be combined on a single Zulu time axis.

### 7.8 Domain modules

- **CAP-21** TMA construction, generation and maintenance shall be a separate module, held to the same quality as core features. A solution shall be rooted in a selected period of bearing data: its positions correspond to the sensor observation times in that period, and that period is the same display window the analyst sets under CAP-28. Whether a solution is good enough is the analyst's decision (PRN-08). The module shall first provide manual dragging of a solution (translate, rotate, stretch, shear) with live bearing residuals, and bearing residual views. SATC and multi-leg generation are lower priority.
- **CAP-22** Debrief shall import bearings and ambiguous (towed-array) bearings, and shall let the analyst resolve each ambiguous bearing to one side. Where the sensor data file supplies a bearing error, Debrief shall import it with the bearing and shall be able to render the bearing as a wedge of that width, so the analyst can see the play available when dragging a solution (CAP-21); bearings without an error are rendered as lines. Frequency data shall not be imported, and acoustic analysis stays in the acoustic replay application (EXT-03).

### 7.9 Guidance and onboarding

- **CAP-23** Analysts should be able to ask for an operation in plain English. Debrief shall show the proposed tool and its parameters, and require confirmation before applying them. The language model shall run locally, so the feature works offline (PRN-06). Until a local model is available, OUT-05 shall be met by CAP-24 and CAP-25 alone. Analyst machines are laptops without GPUs, so a local model is unlikely soon (proxy; section 12.3).
- **CAP-24** Each tool's declaration (TL-06) shall carry a short user-facing explanation of what it does and any judgement it involves, shown on its parameter form. This applies to core tools and domain packs; scientist libraries should follow it.
- **CAP-25** Debrief shall provide guided first-use walkthroughs for common tasks, using the demonstration sample data. They depend on convincing sample data replacing the 1995 serial (DEP-07).

### 7.10 Cross-plot analysis

- **CAP-26** The analyst shall be able to run a tool across a set of plots selected in the catalogue, producing a single aggregated non-spatial result. Unlike TL-13, a saved result shall become its own catalogue item, linked to each contributing plot as a parent (SUB-23). A run shall show progress and be cancellable.
- **CAP-27** An aggregated result's provenance shall list every contributing plot, identified by a content hash taken at the time of the run. It shall also list any selected plots that were skipped, failed, or not reached because the run was cancelled.
- **CAP-30** Each row or point of an aggregated result shall identify the plot that contributed it, and the analyst shall be able to open that plot from the result, so an outlier in the aggregate leads directly to the run that produced it (proxy).
- **CAP-31** A cross-plot run shall be able to execute unattended from the command line (TL-01), and should process plots in parallel where the tools permit. Per-tool speed remains the tool author's concern (PRN-03); Debrief's contribution is the batching (proxy).

### 7.11 Display legibility

- **CAP-28** The analyst shall be able to limit the plot's displayed sensor data, such as bearing lines, to a time window, independently of the plot's overall time range. There is one window for the whole plot, not one per layer (decision, 12 Oct 2026). The window is saved in the plot file as view state, in the plot's island (SUB-22), so it travels with the plot; the saved window is not itself shared state (SUB-26), but shared state's time range follows the window as shown, including while the analyst drags it, so views and tools see what the analyst sees. The time controller may move it with current time. The window is at least one second long. A tool that moves current time outside the saved window shall show a window widened (to at most twice its length) or moved to take that time in, without saving it, and say so until the analyst keeps or reverts it; only a tool whose purpose is to set the window, run by the analyst by hand on that plot, saves it (expert panel, 12 Oct 2026).
- **CAP-29** Debrief shall display tracks for a whole deployment (weeks) at once. Outside the time window, each track stays in view as a context track, by default at a contrast of at least 3:1 against the map on any theme; a plot may draw them fainter or not at all, and an analyst may require the 3:1 contrast on every plot. Sensor data such as bearings shall be shown only within the plot's time window, which the analyst sets (CAP-28). Bearings are never all rendered at once; the window is the volume strategy for observation-heavy datasets (NFR-06), not only a legibility aid.

## 8. Outcome requirements

Outcomes are what each community gets from Debrief. They form the value case. Acceptance measures are provisional and need agreeing with each community.

| ID | Outcome | Community | Provisional acceptance measure |
| --- | --- | --- | --- |
| OUT-01 | A red track, optionally with uncertainty, for the post-deployment report | D | Primary: track and report figures produced without leaving Debrief. Secondary: traceable figures (OUT-04). |
| OUT-02 | An overnight quad-chart storyboard | O, N | Deck ready for a late-afternoon presentation from next-morning analysis |
| OUT-03 | Comparable measures within a measure group | T, D | A measure group runs across every run of a trial in one unattended batch; the analyst opens an outlier run directly from the aggregated result; time per trial analysis is cut by a fraction T states (proxy) |
| OUT-04 | Traceable figures in Word and PowerPoint | All | Any exported image traces back to its source plot by GUID |
| OUT-05 | A new analyst productive quickly | N, O | First useful output within an hour of first use, recovering the day now lost to training |
| OUT-06 | A scientist builds their own tool without a contractor | D | A user-written tool appears in Debrief without rebuilding it |
| OUT-07 | Platform-behaviour statistics across studies | All | Speeds and detection ranges by class aggregated across available plots |

OUT-07 corrects `VISION.md`. Aggregate analysis is limited to platform behaviour, such as typical speeds or initial detection ranges by class. It does not extend to mining tactical findings across studies.

**Status (section 8):** OUT-02, OUT-04 and OUT-06 are confirmed, by observed practice or by objective test. OUT-01, OUT-05 and OUT-07 are pilot-exit criteria, confirmed when a pilot delivers them (section 12.2). OUT-03 is a proxy from the lead developer's knowledge of T, confirmed at pilot (section 12.2).

## 9. External interfaces

Each interface is a named commitment, even where its implementation is shared with another.

| ID | Interface | Direction | Format | Status |
| --- | --- | --- | --- | --- |
| EXT-01 | Track data | In | REP (replay format) | Port legacy Java code and tests |
| EXT-02 | Legacy track formats | In | About 17 legacy formats, including NMEA, AIS, GPX and Antares (listed in CAPABILITY\_AUDIT.md) | Later, as importer tools in the tool library. Initial releases support REP (EXT-01) and .dpf (EXT-14) only. |
| EXT-03 | Acoustic replay application | In, file only | DSF (REP contact lines only) | Stable for decades |
| EXT-04 | Narrative documents | In | Word and PDF, several dialects | Port Java parsers and tests to Python |
| EXT-05 | Report images | Out | Images with embedded GUID metadata | New |
| EXT-06 | Storyboard exports | Out | Offline HTML, PowerPoint, video | New (CAP-14) |
| EXT-07 | Archive handover to another government organisation | Out, one-way | Legacy CSV, columns as defined by the ported Java exporter and its tests. A comment line carries the source plot's GUID (as SUB-25), so provenance can be traced from the archive without changing the recipient's ingest. | Port legacy Java code and tests; verify the recipient tolerates the comment line (section 12.2) |
| EXT-08 | Reference tiles | In | Folder-based tile pyramids; MBTiles possible later | Served locally by pygeoapi |
| EXT-09 | Agents | Both | MCP | Full parity with users (TL-14) |
| EXT-10 | Shared catalogues | Both, opt-in | STAC JSON over the filesystem or network share | Off by default |

- **EXT-11** There shall be no live communication with the acoustic replay application. The interface is file-based only.
- **EXT-12** The archive format shall not change without the recipient's agreement.
- **EXT-13** A future Postgres tactical database (tables for exercises, participants, tracks, contacts, narratives and sensor observations) shall not be precluded. SUB-09 provides the seam. Such a backend would reopen the access-control approach in section 11.
- **EXT-14** Debrief shall import legacy v3 plot files (.dpf, XML), keeping tracks, annotations, narrative and layer settings as far as the v4 data model allows. The v3 file shall be kept as an immutable source (SUB-10, SUB-11), recorded in provenance as the plot's origin, and replay shall start from it. Sub-millisecond timestamps in a v3 file shall be truncated to milliseconds (SUB-01) and the truncation recorded in provenance (EXT-15).
- **EXT-15** Content in a v3 plot with no v4 equivalent shall never be silently dropped. At the end of the import, Debrief shall show a message naming each entity that was not imported. The same list shall be recorded in the import's provenance, so the omission travels with the plot.

## 10. Non-functional requirements

Analysts accept a visible lag on busy plots, but not a stall. Requirements are stated as budgets, not as implementation choices.

### 10.1 Responsiveness

- **NFR-01** Interactive updates should complete within 500 ms, for plots up to the volumes in NFR-06. Updates taking 5 s or more are a failure.
- **NFR-02** Where a plot holds too much data to meet NFR-01, the renderer shall thin, resample or progressively refine the display. This may be invisible to the user.
- **NFR-03** Measurement shall always use full-resolution data, never the thinned display.
- **NFR-04** Tote values and TMA bearing residuals shall update within 100 ms of a change to the time slider or a TMA drag, so they keep pace with the analyst. This is a latency budget, not a language choice. The prototype shall measure whether per-call REST meets it (section 12.2). If it does not, the Tote's fallback is one request per time range, with Python returning values sampled densely enough that the client only interpolates between them. That interpolation is presentation, not domain logic (PRN-03), and shall handle bearing wrap-around at 360°. For TMA drag, residuals may lag during the drag provided they are exact when it ends.
- **NFR-05** While video follows current time (CAP-18), dropped frames during scrubbing are acceptable; stalls are not.

### 10.2 Volume

- **NFR-06** Debrief shall remain usable with two volume profiles. Track-heavy (O, N): the legacy sample data (300 tracks, 12,000 narrative entries, a 109,000-line NMEA log) scaled by 3–5×, collated from several sources per serial. Observation-heavy (D): a handful of tracks with weeks of continuous bearing data, potentially millions of observations; CAP-28 and CAP-29 are the strategy for this profile. A catalogue holds hundreds of files. The track-heavy bound is assumed; it shall be measured against real O data at the overnight-storyboard milestone (section 12.2).

### 10.3 Portability and compatibility

- **NFR-07** A storyboard's HTML export shall run with no network and without Debrief installed.

### 10.4 Extensibility

- **NFR-08** A user-written tool shall be usable without rebuilding or reinstalling Debrief (TL-05).

### 10.5 Onboarding

- **NFR-09** An analyst with domain knowledge but no Debrief training should import a sample serial, compose a storyboard and export it within an hour (OUT-02, OUT-05).

### 10.6 Data integrity and recovery

- **NFR-10** After an unexpected exit, no more than the last operation shall be lost, and the plot shall be recoverable by replaying recorded deltas.
- **NFR-11** Saves shall be atomic, so a failure part-way through never leaves a corrupt file. A save that fails shall leave the original file intact and tell the analyst. Every change to a plot rewrites its one plot file, content and history together, so the file on disk is always the whole plot before the change or the whole plot after it.

### 10.7 Platforms, accessibility and diagnostics

- **NFR-12** Debrief shall run on Windows 11, and on Windows 10 for as long as VS Code supports it. It should run on macOS and Linux. The standalone web build shall run in current versions of Edge, Chrome and Firefox.
- **NFR-13** The user interface shall honour VS Code themes, including high contrast. It shall be operable by keyboard, and every map action (for example dragging a track, drawing an annotation or measuring) shall have a keyboard or form-based equivalent.
- **NFR-14** Debrief shall log errors and tool invocations locally. Logs shall contain no plot data, so they can be shared for support and accreditation review without inspection. Tool invocations shall record parameter names and types but not values, and file paths and feature names shall be removed or hashed.

## 11. Security, accreditation, deployment and update

Debrief shows provenance; users handle classification. Access control is inherited from the filesystem rather than built in.

### 11.1 Accreditation context

Legacy Debrief is already accredited on the target network, so the path is a known cost. Analysis networks accept that custom tools are needed, including code scientists write themselves.

### 11.2 Access control and data handling

- **SEC-01** Debrief shall rely on filesystem permissions (for example Windows shared-folder permissions) for access control.
- **SEC-02** Each STAC catalogue shall hold data of a single protection level. Catalogue boundaries follow protection boundaries.
- **SEC-03** An organisational store shall hold only data that everyone with access to it may see.
- **SEC-04** Debrief shall not warn when an analyst combines data from several catalogues.
- **SEC-05** Network access shall be off by default. Sharing a catalogue with another analyst shall be opt-in. Whether a catalogue is peer-hosted or on a team server is a deployment choice.
- **SEC-06** Local services (the MCP tool service and pygeoapi) shall run per user, under the user's own account, so they inherit that user's permissions.
- **SEC-07** Local services shall listen on the loopback interface only, never on an external address.
- **SEC-08** The tool service shall require a per-session token, issued by the extension at start-up, so that other processes on the same machine cannot invoke tools.

### 11.3 Installation and update

- **DEP-01** Debrief shall be distributable as the extension alone, for the IT-managed VS Code already present on target networks, or as VS Code bundled with the extension elsewhere. The extension-only route is primary; the bundled route on a target network would require accrediting VS Code itself.
- **DEP-02** The extension shall install from a VSIX file, which IT may distribute through their usual software tools. No target organisation runs a private extension registry; installing from one (such as Open VSX or Artifactory) may be supported later.
- **DEP-03** The Python tool library shall ship as part of the Debrief payload, not through public package indexes. Extension and tool library versions shall be matched and checked at start-up.
- **DEP-04** Scientists may install Debrief directly, as open-source software.
- **DEP-05** pygeoapi configuration shall live in the user's Debrief installation, managed through pygeoapi's configuration interface.

### 11.4 Public demonstration instance

- **DEP-06** An unclassified web-hosted instance shall be available to anyone during development, for review and demonstration.
- **DEP-07** The public instance shall never hold real data. It shall ship with fixed sample data and have no upload capability.
- **DEP-08** Sample data shall be a hybrid: open AIS data for the background picture, with a synthesised blue, red and sensor layer and a scripted narrative on top, covering several serials. It replaces the 1995 single-serial sample. It shall be built before the first graphical milestone, since the demonstration instance (DEP-06), the walkthroughs (CAP-25) and blog examples (DEV-06) depend on it, and shall carry its own provenance as a worked example of SUB-18.

### 11.5 Development practice

- **DEV-01** The project shall maintain a development blog on the GitHub Pages site of the project repository.
- **DEV-02** Each significant new graphical capability shall have a blog post showing it.
- **DEV-03** Each significant non-graphical advance shall have a blog post, illustrated with a simple Mermaid diagram.
- **DEV-04** Posts should be short and frequent, to keep readers engaged.
- **DEV-05** A feature's blog post shall be written and reviewed in the same pull request as the feature. The pull request shall state whether a post is needed, and review shall confirm the post contains nothing sensitive.
- **DEV-06** Posts should include interactive examples of the new capability, built from the standalone web build (CON-09) using unclassified sample data only. Each example shall be pinned to the version it demonstrates, so older posts keep working as Debrief changes.
- **DEV-07** The project shall maintain a style guide covering language, theme and UI. The language section shall build on DOMAIN\_GLOSSARY.md and set British English, tone, and how units and times are written, consistent with SUB-04. The theme section shall keep UI colours, taken from VS Code theme tokens (CON-06, NFR-13), separate from data colours such as track conventions, which shall not change with the theme. The UI section shall cover components, icons and layout across all three hosts (CON-05).
- **DEV-08** The project shall maintain a set of interaction models: worked patterns for selection, tool invocation, undo, conflicts, unavailable capabilities, long-running operations, keyboard equivalents and check overrides, applied consistently across hosts, tools and agents. Where an interaction is already a requirement, the model shall cite it rather than restate it.
- **DEV-09** The project shall maintain a tool-author guide for scientists, covering tool declarations, Debrief data types, user-facing explanations (CAP-24) and the language section of the style guide, so a scientist can build a tool without a contractor (OUT-06).
- **DEV-10** The style guide and interaction models shall exist before the first webview or graphical feature. Pull-request review shall check conformance to them, and automated checks (for example terminology linting and theme-token use) should be used where practical.

## 12. Assumptions, open issues and future considerations

No issues remain open. Everything formerly open has been closed by decision or moved to the milestone criteria in section 12.2, which the delivery plan owns.

### 12.1 Assumptions

- Accreditors will accept a loopback-only, token-protected network listener for the per-user tool service and pygeoapi (SEC-06 to SEC-08) (proxy). If they do not, the fallback is MCP's stdio transport, a transport change rather than a redesign.
- Catalogues stay in the hundreds of files, so reading JSON locally is fast enough.
- The shared core covers roughly the first year of work, so no community needs to be prioritised before then.
- Data leaving the machine is the user's responsibility, not Debrief's.
- Combining data from several catalogues is the analyst's responsibility.
- IT keeps managed users on the same data-file schema version (SUB-12), which changes less often than Debrief itself. Scientists who install Debrief themselves (DEP-04) may be ahead of them; SUB-14's refusal message and SUB-35's catalogue warning are the mitigation.

### 12.2 Open issues

None. T was characterised by proxy on 11 October 2026 (section 3); OUT-03 joins the pilot criteria below.

**Milestone criteria.** These are not open requirements. Each is confirmed by the milestone named, and the delivery plan owns them.

- [ ] Prototype: measure per-call REST against the 100 ms Tote budget (NFR-04).
- [ ] Importer port: confirm the REP and DSF formats carry an optional bearing error field (CAP-22); if not, agree the field with the acoustic replay application's owners.
- [ ] Archive exporter port: verify the recipient's ingest tolerates a GUID comment line (EXT-07).
- [ ] Overnight storyboard: measure a real O multi-platform serial against the track-heavy profile (NFR-06).
- [ ] Pilot: confirm OUT-01, OUT-03, OUT-05 and OUT-07 with their communities.

### 12.3 Future considerations

- **Postgres backend.** A tactical database for O remains possible, with pgstac a candidate for holding the catalogue. Its main cost is losing filesystem access control, not reshaping the data model.
- **Community sequencing.** Once specialisation begins, the order of D, O and N work becomes a strategic choice. The overnight storyboard is the most demonstrable early product, and N engagement waits on working software.
- **Fragility of vscrui.** It depends on a deprecated Microsoft toolkit and one maintainer. PRN-09 keeps it replaceable.
- **Media synchronisation timing.** CAP-16 to CAP-18 are wanted across communities, but current planning places them late (M11). Worth revisiting against community demand.
- **Local language model.** CAP-23 needs a model that runs offline on analyst laptops without GPUs. Worth revisiting as small models improve.
- **Derived uncertainty envelope.** Scientific management asked for bearing errors so the analyst can see the play in a TMA leg; that is in scope (CAP-22). An envelope swept along a solution from those errors is a further step, deferred until an analyst asks for it.
