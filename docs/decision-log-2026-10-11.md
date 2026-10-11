# Future Debrief — Decision Log (SRD open issues, 11 Oct 2026)

Oct 11, 2026 · @Ian Mayo

Tags: **DEC** decided · **OPEN** unresolved · **CAUTION** accepted risk · **SUPERSEDES** replaces an earlier entry. Organisations are referred to by initial only (D, N, O, T). Applied to the SRD at revision 91 and the delivery plan at revision 37. Closes the five open issues and eleven of the twelve proxy statements carried in SRD rev 84.

## Open issues

- **DEC** Section 8 acceptance measures are split by how they can be confirmed. OUT-02, OUT-04 and OUT-06 are confirmed now (observed practice or objective test). OUT-01, OUT-05 and OUT-07 are pilot-exit criteria. OUT-03 was characterised by proxy later the same day (see T characterised).
- **DEC** OUT-01's secondary measure ("faster than legacy") is dropped. It needed a controlled trial nobody will run, and the primary measure (figures produced without leaving Debrief) captures the real win. The legacy-timing task goes with it.
- **DEC** NFR-04's 100 ms Tote budget is fixed. The prototype measurement is a milestone criterion, not an SRD question.
- **DEC** NFR-06's O overnight volume is assumed at 3–5× the legacy sample, with a source-mix shape added. Measurement against real O data is a criterion for the overnight-storyboard milestone.
- **DEC** Sample data is a hybrid: open AIS for the background picture, synthesised blue, red and sensor layer, scripted narrative, several serials. Now DEP-08, a Phase 1 workstream, because DEP-06, CAP-25 and DEV-06 all depend on it. It carries its own provenance as a worked example of SUB-18.
- **OPEN** Characterise T's work and tempo, then confirm OUT-03. The only item still open in the SRD.
- **DEC** SRD 12.2 now distinguishes open requirements from milestone criteria. The delivery plan owns the criteria (its Milestone criteria section).

## IT and accreditation proxies

- **DEC** VS Code is already present on target networks. DEP-01's extension-only route is primary and no longer a proxy. **CAUTION** The bundled route on a target network would require accrediting VS Code itself.
- **DEC** DEP-02's claim that no organisation runs a private registry stays a proxy; low stakes either way. **SUPERSEDES** the 25 Sep entry that made private registries primary and VSIX the fallback.
- **DEC** New SEC-07 (loopback-only listener) and SEC-08 (per-session token). The accreditor-listener assumption stays a proxy but is no longer load-bearing. Fallback if refused: MCP's stdio transport, a transport change rather than a redesign.
- **DEC** NFR-12 reframed: Windows 11 is the requirement; Windows 10 is supported while VS Code supports it. Windows 10 left Microsoft support in October 2025.
- **DEC** The version lock-step assumption is restated in schema terms (SUB-12), since the data-file schema changes less often than Debrief. New SUB-35: a shared catalogue declares its schema version, and Debrief warns before writing a newer-schema file into it.

## D analyst proxies

- **DEC** CAP-07 confirmed: measure groups live per study, owned by the lead analyst.
- **DEC** CAP-21 rewritten with a precondition: a TMA solution is rooted in a selected period of bearing data, and its positions correspond to the sensor observation times. That period is the same window CAP-28 sets. Priority order (drag first, SATC and multi-leg later) stands.
- **DEC** CAP-22 confirmed: bearings only. Frequency is not imported, not merely ignored, so it never enters the data model without an owner.
- **DEC** CAP-29 confirmed by the §3.1 problem statement. Rationale added: bearings are never all rendered, and the window is the volume strategy for D, not only a legibility aid.
- **DEC** NFR-06 gains a second profile. D datasets are observation-heavy: a handful of tracks with weeks of continuous bearings, potentially millions of observations. The sample data and O are track-heavy. CON-02 now names sensor observations as its primary case, so bearing sets are Arrow or Parquet payloads rather than one GeoJSON feature per observation.

## External interfaces

- **DEC** EXT-07: the archive handover stays on the legacy CSV. The column layout is defined by the ported Java exporter and its tests, so no sample-hunting is needed. A comment line carries the source plot's GUID (same mechanism as SUB-25), so provenance is traceable from the archive without changing the recipient's ingest. **SUPERSEDES** the 25 Sep "migration to GeoJSON desired" entry; the "ask them" action is replaced by a milestone criterion: verify the recipient's parser tolerates a comment line.

## Uncertainty

- **DEC** What scientific management asked for was an error on each sensor bearing, rendered as a wedge, so the analyst can see the play in a TMA leg. That is a field on a sensor observation, supplied as an optional field in the DSF or REP file, and is in scope under CAP-22. **SUPERSEDES** the 25 Sep "uncertainty is a new layer type" entry.
- **DEC** A derived envelope swept along a solution from those errors stays deferred until an analyst asks for it.
- **OPEN** (milestone criterion, Phase 4 D stream) Confirm REP and DSF carry an optional bearing error field. If not, the field must be agreed with the acoustic replay application's owners, which touches EXT-03's "stable for decades" status.

## Delivery plan open decisions

Closed in the same session, after the SRD rescan.

- **DEC** Electron loader dropped, with no replacement scaffolding. Import builds straight into the VS Code catalogue browser.
- **DEC** Milliseconds stand (SUB-01). Sub-millisecond timestamps in a v3 file are truncated on import and recorded in provenance (EXT-14). The 25 Sep **DEC** is unchanged.
- **DEC** PRN-04 names hand-written JSON Schema as the fallback for affected types only, gated on the Phase 0 LinkML spike failing its exit criterion. The generation rule still applies to everything else.
- **DEC** If six people cannot staff both Phase 4 streams, the O/N storyboard and D sensor import run first; TMA follows once the storyboard ships.
- **DEC** The budget-holder paragraph is written: SRD 1.1, "Why fund this now". **CAUTION** Two of its claims (dwindling maintainers; every legacy change through a contractor) are inferred, not verified.
- Nine 25 Sep **OPEN** items were already answered by the SRD and are now marked closed or parked in that log.

## T characterised (proxy)

From the lead developer's knowledge of T, 11 Oct. All of it is proxy until confirmed with T at pilot.

- **DEC** T analyses simulated trials only, including Monte Carlo runs. No real data. Tempo is bounded by simulation run time (often a weekend), then by analysing many runs by hand in Debrief, plot by plot.
- **DEC** T's product is aggregate-first, then drill into outliers. Measures are a standard core per trial type plus per-trial extras. Data arrives as REP, so no new importer.
- **DEC** T sits off the fidelity axis; its variation is in the number of runs (SRD 2.2).
- **DEC** New CAP-30 (aggregate result rows identify and open their source plot) and CAP-31 (cross-plot runs execute unattended from the CLI, in parallel where tools permit). CAP-07 allows a measure group to extend a shared core.
- **DEC** OUT-03 rewritten with three measures: unattended batch over every run; aggregate-to-outlier drill-down end to end; time per trial cut by a fraction T states.
- **CAUTION** T's value case is cross-plot analysis, which the plan places in Phase 5. If T matters commercially, that is late.
- **CAUTION** The slow part of T's work is per-run analysis, a Python performance question. Debrief's contribution is batching and parallelism (PRN-03); per-tool speed stays with the tool author.
- The SRD now has no open issues. Every remaining uncertainty is either a proxy or a milestone criterion.

## Still proxy, and next

Two proxy statements survive this log:

- SRD 12.1: accreditors accept a loopback-only, token-protected listener. Kept as REST with stdio fallback by decision (11 Oct); only an accreditor can close it.
- T's characterisation (section 3, OUT-03, CAP-30, CAP-31), confirmed at pilot.
- DEP-02's registry claim is now a stated fact (11 Oct): no target organisation runs one.

Sequencing:

- **DEC** Cross-plot analysis stays in Phase 5. T's value case is real, but Phase 4 is already two streams for six people; a third would push TMA out further. Revisit once Phase 0 spikes report and durations are estimated.

Next actions:

- [ ] Characterise T, then confirm OUT-03. Done by proxy 11 Oct; confirm with T at pilot.
- [ ] Decide whether sample data (DEP-08) stays in Phase 1 or moves earlier for visibility. Decided 11 Oct: stays in Phase 1.
- [ ] Renumber SUB-35 into sequence if the SRD is reordered before freeze.
