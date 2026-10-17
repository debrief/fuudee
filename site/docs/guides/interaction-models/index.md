# Interaction models

**North Star:** predictable and forgiving: the same gesture does the same thing everywhere, and nothing is silent or irreversible (SUB-21, SUB-28).

Worked patterns applied the same way across hosts, tools and agents (DEV-08). Each model is one short page: the requirements it cites, a Mermaid sequence diagram, and a pointer to its reference implementation. Where an interaction is already a requirement, the model cites it rather than restating it.

| Model | Written in | Status |
| --- | --- | --- |
| [Selection and tool offering](selection.md) | Phase 1 | Requirements gathered |
| [Tool invocation and forms](tool-invocation.md) | Phase 1 | Requirements gathered |
| [Unavailable capabilities](unavailable-capabilities.md) | Phase 1 | Requirements gathered |
| [Undo](undo.md) | Phase 2 | Written |
| [Conflicts](conflicts.md) | Phase 2 | Written |
| [Long-running operations](long-running-operations.md) | Phase 2 | Requirements gathered |
| [Check overrides](check-overrides.md) | Phase 2 | Requirements gathered |
| [Time controller](time-controller.md) | Phase 3 | Written |
| [Annotations](annotations.md) | Phase 3 | Written (forms; drawing and editing on the map) |
| [Track operations](track-operations.md) | Phase 3 | Written (part A: move, rotate, split, merge; part B1: shear, stretch; part B2: jumps, smoothing, marked fixes; part B3: single fixes, dead reckoning) |
| [Labels, symbols and arrows](labels-symbols-arrows.md) | Phase 3 | Written (intervals per track, aligned to the clock as legacy Debrief; thinning; a fix's own label or symbol) |
| [Tote](tote.md) | Phase 3 | Written (part A: primary and secondaries, the core measures, latency) |
| [Timeline and narrative](timeline.md) | Phase 3 | Written (part A: narrative entries, REP and .dpf import, the Timeline following current time, filter, search, editing, scale) |
| [Collation](collation.md) | Phase 3 | Written (coverage, platforms across items, source preference per period, new data, taking it, review flags) |
| [Exported images](export.md) | Phase 3 | Written (the map as an image with an ID naming the plot and the revision, the footer, the export log; finding an image's source, read-only) |
| [Keyboard equivalents](keyboard-equivalents.md) | Phase 3 | Partly written (annotations, tracks, the Tote, the Timeline, collation, exported images) |

Analysts review the Phase 1 models before they are built.
