# Undo

How an analyst steps back through changes to data and to presentation.

*The model, its sequence diagram and its reference implementation are written in Phase 2. Version 0 gathers the requirements it must satisfy.*

## Requirements cited

| SRD | Requirement |
| --- | --- |
| SUB-21 | Undo is replay to a point; tools never implement undo. |
| SUB-19, SUB-20 | Prior states are rebuilt by deterministic replay from sources. |
| SUB-22 | Presentation changes have a local history; view state is neither undoable nor recorded. |
| NFR-10 | After an unexpected exit, at most the last operation is lost. |

## Model

*Phase 2.*

## Reference implementation

*Phase 2.*
