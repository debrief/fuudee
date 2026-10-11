# Future Debrief — Decision Log (SRD framing, 25 Sep 2026)

Sep 25, 2026 · @Ian Mayo

Tags: **DEC** decided · **OPEN** unresolved · **CAUTION** accepted risk. Organisations are referred to by initial only (D, N, O, T). Converted unchanged from the project file on 11 Oct 2026; entries on private registries, the archive format and uncertainty are superseded in Doc.

## North Star

- **DEC** *"Debrief empowers analysts to extract insight from military activity, enabling improved warfighting capability."*
- "Empowers" makes the analyst the expert. "Enabling" was chosen over "informing" so improvement isn't limited to informing decisions.
- The narrowing for understanding-led studies was accepted as close enough.
- The budget-holder test belongs in the supporting paragraph, not the sentence. **OPEN**: write that paragraph. Closed 11 Oct: SRD 1.1, "Why fund this now".

## Framing

- **DEC** Doc owns the requirements. They are a synthesis across communities, not collected wishes.
- **DEC** Being generic is the feature. Commonality is demonstrated: one legacy codebase already serves every community except N.
- **DEC** The axes of variation are tempo and fidelity. Provenance sits in the common core.
- **DEC** Reproducibility: record what was done, don't prescribe what to do.

## Sequencing

- **DEC** No community-first choice is needed for roughly the first year. Substrate and the common capabilities are shared: track editing, annotation, Tote, narrative, and import/export.
- The fork only comes with specialisation: TMA and acoustics for D, storyboard for N and O.

## VISION.md corrections

- Aggregate analysis is imprecise rather than wrong. The real case is platform-behaviour statistics, such as speeds and detection ranges by class. Accumulating findings across studies about tactics is not a real case.
- The D-first roadmap is replaced by shared-core-first.

## Platform and distribution

- **DEC** Primarily a VS Code extension, with vscrui for webviews and web-only builds. Three hosts.
- **DEC** The hosted demo is unclassified and for demonstration only: fixed sample data, no upload capability.
- **DEC** The extension is distributed through each organisation's private registry (Open VSX, Artifactory, Nexus or a plain HTTP directory). A manual VSIX install is the fallback. **OPEN**: check whether each organisation already runs an artefact repository. Superseded 11 Oct: VSIX is primary (DEP-01); the registry claim stays a low-stakes proxy (DEP-02).
- **DEC** The Python tool library ships as part of the Debrief payload, not through PyPI. Extension and tools must be version-matched.
- **DEC** Tools are exposed as a Python MCP service over REST (CLI possible). A local listener is acceptable to accreditors.
- **DEC** Agents can drive the tools. **CAUTION**: agent-facing descriptions need ongoing tuning.
- IT pushes updates at their own pace, so users will be on mixed versions. Files must survive being read by older installs.

## Security

- **DEC** Access control is the filesystem's job. The STAC catalogue is static and queried client-side. An optional SQLite index is allowed but is always derived and rebuildable.
- **DEC** One catalogue per protection set, with a composite view that shows each item's source catalogue. No warning when mixing catalogues.
- **DEC** An organisational store holds only data that everyone with access to it may see.
- **DEC** Network access is off by default and catalogue sharing is opt-in. Data leaving the machine is the user's responsibility.

## Multi-user and handover

- **DEC** The analyst chooses when to take new data. A halo shows availability, scoped to the current plot's tree.
- **DEC** New data is merged, not reloaded. Upstream revisions are flagged through provenance, and the STAC browser highlights downstream products that may need review.

## Type system

- **DEC** All boundary types are generated from LinkML. A type may stay language-local only if it is never serialised and never crosses a process boundary.
- **DEC** Escape route for data LinkML expresses badly: an opaque payload (Arrow, Parquet or GeoJSON) declared by reference. The envelope carries the format, a versioned inner schema, units, CRS and time reference.
- **OPEN**: whether disk caches are exempt from the rule (parked). Closed: CON-01 defines the exemption.

## Components (gaps closed)

- **Provenance: DEC** A PROV array inside the GeoJSON feature collection and features, so it is a schema concern, not a service.
  - Parent links are authoritative. Downstream links are a convenience hint only.
  - Children are found by walking the catalogue, optionally via a SQLite reverse index.
- **pygeoapi: DEC** Runs as a per-user process, so it inherits that user's permissions. Configured via its REST config, stored in the user's install. Serves reference tiles.
- **Exercise model: DEC** A small internal component.
- **Collate: DEC** Not a component. It is the STAC browser's job: catalogue management, coverage view, and import/transform.
- **Storyboard: DEC** An editor for viewports, times and narrative, with three exporters:
  - standalone HTML with an embedded map, fully offline including tiles;
  - PowerPoint quad-chart;
  - video.
  - **CAUTION**: warn about export size.

## Tool library

- Three tiers: core, domain packs (TMA, air), and scientist libraries built on a framework Doc provides.
- **DEC** Whether tools run in one MCP server or several is deferred. The framework must not assume shared process state.
- **DEC** Tools declare the types they apply to (with wildcards or a taxonomy) and the parameters they need. The UI generates parameter forms. The tools offered are the intersection across the current selection.
- **DEC** LinkML is the build-time type vocabulary. The tool catalogue is discovered at runtime via MCP. Scientist tools must use Debrief types.
  - **CAUTION**: surface tools that are silently hidden because they declare unknown types.
- Output kinds: new features, modifications, deletions (allowed), non-spatial results, sets, and view control (time, selection, viewport).
- **DEC** Non-spatial results appear in an ephemeral panel. Save promotes them to a child asset of the current STAC item. The operation is always recorded; the output only if saved.
- **DEC** Agents have full parity with users. Provenance records which agent and model made each change.
- **DEC** Quality checks are tools bound to lifecycle events: open, import, modify, pre-save, post-save.
  - A failure warns and offers an override.
  - Overrides are recorded.

## External interfaces

- Acoustic application to Debrief: DSF, a subset of REP contact lines, file-based and one-way. Stable for decades.
- Narrative ingest from Word and PDF in several dialects. Port the Java parsers and their tests to Python.
- Image export to Word and PowerPoint, with embedded GUIDs.
- Archive handover: the agreed CSV. Migration to GeoJSON is desired, subject to the recipient agreeing. **OPEN**: ask them. Superseded 11 Oct: CSV stays, with a GUID comment line (EXT-07).
- Tiles: folder tile pyramids as the baseline, MBTiles as a possible extension.
- Track import: REP plus about four legacy formats, including NMEA 0183, ported with their tests. **OPEN**: list them by name. Closed: EXT-02 points to CAPABILITY\_AUDIT.md.
- Agents: MCP with full parity.
- Possible future Postgres tactical database for O: storage must sit behind an interface.
  - **CAUTION**: it reopens the accreditation question.
  - **OPEN**: investigate pgstac. Parked: SRD 12.3.

## Non-functional

- Interactions up to about 500 ms are fine; 5 s is failure. Analysts tolerate more delay when more data is visible.
- **DEC** Resample or progressively refine the display, invisibly to the user. Measurements always use the full data.
- Video must follow both playback and scrubbing. Dropped frames are acceptable; stalls are not.
- Tote: specify a latency budget, not a language, and let the tracer prove REST is fast enough. Fallback: request a whole time range in one call and interpolate client-side.

## Substrate requirements

- **DEC** Millisecond time precision. Microsecond was legacy over-engineering; revisit if acoustics moves in-house.
- Units are encoded in LinkML.
- Timestamps are stored in UTC; time-zone conversion is display-only.
- **OPEN**: is a standard web projection enough? Closed: SUB-03, Web Mercator display with geodesic measurement.
- A plot is readable without Debrief: plain GeoJSON, STAC and PROV. Anything that isn't GeoJSON becomes a linked STAC asset.
- The outline view is a sectioned tree:
  - features;
  - supporting files, which open in a sub-window and have no visibility toggle;
  - reference data.
- One portable map component serves all three hosts and exported HTML.
- Shared state is time (instant and range), selection and viewport. All three can be read and set by views, extensions and tools, so they are boundary types under the LinkML rule.

## Capability requirements (so far)

- Annotations are ordinary GeoJSON features. Time-only annotations use null geometry.
- An optional temporal view shows narrative, time-only annotations and data coverage, which also supports collate.
- The Tote handles one primary and several secondaries, and is a view onto a measure group.
- Track operations edit destructively, but the operation delta is recorded.
  - Any prior state is rebuilt by deterministic replay from source, not by inverting operations. Tools that use randomness record their seed.
  - Undo is replay to a point, so tools never need to implement undo.
- Media sync happens inside Debrief, driven by the time bus: video, timestamped image folders and narrative. It is currently scheduled at M11, which is too late for such a popular feature.
- **DEC** Uncertainty is a new layer type: a track with bounded errors. It is driven by scientific management rather than analysts, and has little impact on the rest of Debrief.
- **DEC** TMA is a module, but held to first-class quality.

## Open / next

- Unclear capability requirements: measure groups (who defines them, sharing, storage) and what "good" means for TMA. Closed: CAP-07, PRN-08, CAP-21.
- Not yet covered: format handlers, sensors, SATC, acoustics, narrative. Outcome-level requirements not started.
- Actions: investigate pgstac, check registries, talk to the archive recipients, name the legacy formats.
- Record the D/N/O/T convention in the project notes. Done: SRD 1.2.
