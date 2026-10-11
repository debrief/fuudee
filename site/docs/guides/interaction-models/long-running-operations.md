# Long-running operations

How Debrief shows and controls work that takes more than a moment.

*The model, its sequence diagram and its reference implementation are written in Phase 2. Version 0 gathers the requirements it must satisfy.*

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-26, CAP-27 | Cross-plot runs show progress, can be cancelled, and record what was skipped, failed or not reached. |
| CAP-31 | The same runs execute unattended from the command line. |
| NFR-01, NFR-02 | Interactive updates within 500 ms; beyond 5 s is a failure; thin the display rather than stall. |
| TL-03 | A failing tool never stops Debrief. |

## Model

*Phase 2.*

## Reference implementation

*Phase 2.*
