# Debrief v4 Constitution

Debrief empowers analysts to extract insight from military activity, enabling improved warfighting
capability. This constitution states the non-negotiable rules for building Debrief v4. It derives
from the Software Requirements Document (SRD) section 4; where the SRD and this document disagree,
this document governs until amended.

## Core Principles

### I. Record, Don't Prescribe

- Every operation MUST be recorded as a delta, whether or not its output is kept (SUB-14).
- Prior states MUST be reached by replaying from source data, never by inverting operations.
  Undo is replay to a point; tools MUST NOT be required to implement undo (SUB-16).
- Replay MUST be deterministic. Operations using randomness MUST record their seed (SUB-15).
- Debrief MUST NOT impose an analysis pipeline. It records what was done, not what to do.

Rationale: reproducible, traceable analysis is the core value case; prescribed workflows would fail
the variety of tempo and fidelity across communities.

### II. Provenance Travels With the Data

- Provenance (PROV) MUST live inside each FeatureCollection (and feature, where needed), so it
  survives copying and needs no separate store (PRN-02, SUB-13).
- Provenance MUST record tool version (including user-written tools) and the identity of any agent
  and model that made a change (SUB-18).
- Imported source files MUST be treated as immutable and MUST be referenced by content hash; replay
  MUST report sources that are missing or changed (SUB-27, SUB-28).
- Parent links are authoritative; child links are hints only and MUST NOT be trusted (SUB-17).
- Exported images MUST carry an embedded GUID linking back to their source (SUB-19).

Rationale: report figures that cannot be traced to their data are the failure v4 exists to fix.

### III. One Type Vocabulary (NON-NEGOTIABLE)

- Every type that is serialised or crosses a process or language boundary (including
  Python-to-Python IPC, host↔webview messages and shared state) MUST be generated from LinkML on
  both sides, never hand-written (PRN-04, CON-01, CON-08, SUB-21).
- Data LinkML expresses badly (arrays, dataframes, geometry) MUST be carried as an opaque standard
  payload (Arrow, Parquet, GeoJSON) inside a LinkML envelope declaring format, inner-schema version,
  units, CRS and time reference (CON-02).
- Hand-written wrappers MAY add behaviour but MUST NOT redeclare fields (CON-03). Boundary subsets
  MUST be derived structurally (`Pick`/`Omit`, generated validators), not re-listed.
- Each external standard (GeoJSON, STAC, PROV) MUST be explicitly classed as imported into LinkML or
  trusted as external; hand-mirroring is forbidden (CON-04).
- Strict typing is mandatory: TypeScript `strict: true`, Python strict type checking, no
  `Any`/`any` in production code, and no unchecked casts outside a validated trust boundary.
- Physical quantities MUST carry units in the type system; timestamps MUST be UTC with millisecond
  precision, with time-zone conversion in presentation only (SUB-01, SUB-02).

Rationale: silent field drops at boundaries were the repeated root cause of data bugs in the
earlier attempt; generation turns them into build failures.

### IV. Open, Durable Data Formats

- A plot MUST be fully readable without Debrief, using only GeoJSON, STAC and PROV. No proprietary
  container (PRN-07, SUB-06).
- The unit of analysis is a GeoJSON FeatureCollection stored as an asset of a STAC item; non-GeoJSON
  content is stored as supporting-file assets of the same item (SUB-04, SUB-05).
- The STAC catalogue MUST be static and file-based; any index (e.g. SQLite) MUST be derived,
  rebuildable, and never authoritative (SUB-10, SUB-11).
- Storage access MUST sit behind an interface so a database backend can be added without changing
  the data model (SUB-08).
- Readability by older installed versions is NOT required: IT keeps all users on one version, and
  legacy v3 content enters v4 by one-way import only (SRD §2.4, §12.1; EXT-14). Newer versions MUST
  still read files written by earlier v4 releases from v4.0.0 onward.

Rationale: data outlives tools and is archived to third parties; open formats keep it usable
without Debrief.

### V. Offline First, Filesystem-Controlled Access

- All core functionality MUST work with no network. Network access is off by default; any sharing
  or online feature MUST be explicit opt-in (PRN-06, SEC-06).
- Debrief MUST NOT implement its own access control; it inherits filesystem permissions. Local
  services (MCP tool service, pygeoapi) MUST run per user under the user's own account
  (PRN-05, SEC-01, SEC-07).
- No telemetry. Logs MUST contain no plot data (NFR-15). No secrets or classified paths in the
  repository.
- Any language model (e.g. for CAP-23) MUST run locally so the feature works offline. Until a
  suitable local model is available and accredited, model-driven features MUST NOT be on the
  critical path of any outcome; OUT-05 is met by CAP-24 and CAP-25 alone.

Rationale: Debrief runs on accredited, often disconnected networks; the accreditation path depends
on not adding new security surface.

### VI. Python Domain Logic, Replaceable Presentation

- Domain logic MUST live in Python tool libraries served over MCP (PRN-03, TL-01). Performance MUST
  be met by budgets and batching, not by moving logic out of Python.
- Where a budget needs it, Python MAY return values sampled densely enough that the client only
  interpolates between them. That interpolation is presentation, not domain logic, and MUST handle
  bearing wrap-around at 360° (NFR-04).
- Units, position notation and date-time MUST be formatted for display through a single configurable
  layer, never within individual views or tools. Stored values are unaffected (NFR-16).
- Frontends (VS Code native views, webviews, standalone web) orchestrate and display only; they
  MUST NOT hold domain logic or own a divergent persistence path.
- Component logic MUST sit behind the host so UI libraries (vscrui) and native-vs-webview choices
  can be swapped without logic changes (PRN-09, CON-07).
- A capability unavailable in a host MUST be hidden or explained, never fail at point of use
  (CON-10).
- Domain logic MUST NOT depend on MCP; MCP wrappers are thin, replaceable layers.

Rationale: Python is the language of every user organisation with programming staff; the UI stack
(notably vscrui) is fragile and must stay replaceable.

### VII. The Analyst Owns the Data

- Checks advise; the analyst MAY override. Every override MUST be recorded in provenance
  (PRN-08, TL-17).
- Debrief MUST NOT silently fail, silently drop content, or silently overwrite another user's
  changes (SUB-29, EXT-15). Operations succeed fully or fail explicitly.
- Saves MUST be atomic (NFR-12).
- Agents act with exactly the same permissions as a user and are recorded the same way (TL-14).

Rationale: the analyst carries responsibility for the product; Debrief's job is to inform, record,
and never lose work.

### VIII. Extensible Without a Contractor

- The tool catalogue MUST be discovered at runtime; adding a tool MUST NOT require rebuilding or
  reinstalling Debrief (TL-05, NFR-09).
- A failing tool or library MUST NOT stop the extension or other libraries from loading (TL-03).
  The framework MUST NOT assume tools share a process (TL-02).
- Tools MUST declare applicable feature types and parameters via LinkML; unknown types MUST be
  reported, not offered (TL-06, TL-09).
- Capabilities MUST be replaceable without changing the substrate.

Rationale: scientists building their own tools (OUT-06) is a core outcome, and the platform must
outlive any single contributor or organisation.

### IX. Test-First, Verifiable Work

- Behaviour MUST be defined as executable tests or explicit acceptance criteria before
  implementation, including for AI-assisted work. Tests define "done".
- Ported legacy features (parsers, track operations, narrative dialects) MUST port their existing
  unit tests alongside the code.
- Schema adherence tests (golden fixtures, round-trip) MUST gate merges for all generated types.
- End-to-end workflows (import → transform → store → export) MUST have integration tests.
- Import MUST be strict and fail fast. Non-compliant fixtures are fixed; schemas are never relaxed
  to accommodate them.

Rationale: tests give humans and agents the same objective definition of correct.

### X. Performance as Budgets

- Interactive updates SHOULD complete within 500 ms; 5 s or more is a failure (NFR-01).
- Tote values MUST update within 100 ms of a time-slider change (NFR-04, provisional).
- Rendering MAY thin or resample to meet budgets; measurement MUST always use full-resolution data
  (NFR-02, NFR-03).
- Budgets MUST be verified against the legacy sample volumes (300 tracks, 12,000 narrative entries,
  109,000-line NMEA log) (NFR-06).

Rationale: analysts accept visible lag, not stalls; budgets keep implementation choices open.

## Technology & Security Constraints

- **Hosts**: primarily a VS Code extension; three hosts (native views, webviews, standalone web).
  Webview and web UI use vscrui and VS Code theme variables, honouring high contrast and full
  keyboard operation (CON-05, CON-06, NFR-14).
- **Platforms**: MUST run on Windows; SHOULD run on macOS and Linux (NFR-13).
- **Schemas**: LinkML is the single source of truth; derived Pydantic, JSON Schema and TypeScript
  are generated, never edited.
- **Classification**: each STAC catalogue holds a single protection level; enforcing classification
  and data release remains the user's responsibility (SEC-02, SEC-03).
- **Distribution**: the Python tool library ships in the Debrief payload, not from public package
  indexes; extension and tool-library versions MUST be matched and checked at start-up (DEP-03).
  Installation MUST work from a private extension registry or manual VSIX (DEP-02).
- **Dependencies**: minimal, justified, version-pinned, and free of single-vendor lock-in.
- **Public demo**: MUST never hold real data and MUST have no upload capability (DEP-08).

## Development Workflow & Quality Gates

- Specs before code: significant work starts from a spec-kit specification (`/speckit-specify`)
  that cites the SRD requirement IDs it satisfies.
- Every plan MUST include a Constitution Check against principles I–X; any deviation MUST be
  justified in the plan's Complexity Tracking section.
- No direct commits to `main`; all changes via reviewed PR with CI green (type check, lint, unit,
  schema adherence tests).
- Atomic commits with clear messages. Significant technical decisions recorded as ADRs.
- **Pre-release freedom**: until v4.0.0, breaking changes to the data model and APIs are permitted
  without deprecation. At v4.0.0, schema versioning with migration paths for existing v4 files and a
  maintained CHANGELOG become mandatory.

## Governance

- This constitution supersedes other project guidance. The SRD states *what* Debrief must do; this
  document states the rules for *how* it is built.
- Amendments require a PR with documented rationale, an updated Sync Impact Report, and explicit
  approval from the lead developer.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle, MINOR for
  adding a principle or materially expanding guidance, PATCH for clarifications.
- All PRs and reviews MUST verify compliance. A change to an SRD principle (PRN-xx) or constraint
  (CON-xx) MUST be reflected here in the same cycle.

**Version**: 1.0.0 | **Ratified**: 2026-09-28 | **Last Amended**: 2026-09-28
