# Conflicts

What happens when a plot changes on disk while an analyst has it open.

*The model, its sequence diagram and its reference implementation are written in Phase 2. Version 0 gathers the requirements it must satisfy.*

## Requirements cited

| SRD | Requirement |
| --- | --- |
| SUB-28 | Debrief detects the change and never silently overwrites it. |
| SUB-29 | Offer to save as a new plot; offer to merge non-overlapping changes by replaying deltas; never merge overlapping changes automatically; never lock files. |
| SUB-14, SUB-35 | Refuse newer-schema files; warn before writing a newer-schema file into a shared catalogue. |
| NFR-11 | Saves are atomic; a failed save leaves the original intact and says so. |

## Model

*Phase 2.*

## Reference implementation

*Phase 2.*
