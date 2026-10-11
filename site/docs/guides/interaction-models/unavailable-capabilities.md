# Unavailable capabilities

What an analyst sees when a capability exists but cannot run here, for example a tool that does not run in the web build.

*The model, its sequence diagram and its reference implementation are written in Phase 1. Version 0 gathers the requirements it must satisfy.*

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CON-10 | Never fail at the point of use; show the capability with an explanation of where it is available, rather than hiding it. |
| TL-09 | Explain why a tool is not offered. |
| CON-09 | The web build runs Python tools in the browser; some cannot. |

## Model

A capability that exists but can't be used here is shown, greyed, with the reason. It is never hidden, and never left to fail at the point of use (CON-10).

| Case | Where it appears | What it says |
| --- | --- | --- |
| The tool doesn't apply to this selection | Tools view, **Other tools** | What to select: "select 2 tracks" |
| The tool names an unknown data type | Tools view, **Not available** | "It applies to contact_report, which is not a Debrief data type. Debrief knows: annotation, sensor_observations, track." |
| A tool library failed to load | Tools view, **Not available** | The library's error. The other libraries still load (TL-03). |
| The tool service isn't running | Tools view | "The tool service stopped. Run 'Debrief: Restart tool service'." |
| The catalogue is read-only | Catalogues view: lock icon, *read-only* | Tools that would change the plot are refused, with the reason. |
| A tool can't run in the browser | *Phase 3, with the web build (CON-09)* | Where it can run |

```mermaid
sequenceDiagram
    participant Host as Extension host
    participant Service as Tool service
    participant Worker as Tool worker
    Host->>Service: tools/list
    Service->>Worker: describe libraries
    Worker-->>Service: tools, and unavailable with reasons
    Service-->>Host: tools; _meta debrief/unavailable
    Host->>Host: Tools view: Not available (reason)
```

## Reference implementation

- **Tools view:** `vscode/src/views/tools.ts`. The wording of what a tool needs is in `vscode/src/wording.ts`.
- **Reasons from discovery:** `debrief_tools.registry` (`Unavailable`).
