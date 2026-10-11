# Tool invocation and forms

How an analyst runs a tool: the generated parameter form, its explanation, running it, and where the result goes.

*The model, its sequence diagram and its reference implementation are written in Phase 1. Version 0 gathers the requirements it must satisfy.*

## Requirements cited

| SRD | Requirement |
| --- | --- |
| TL-07 | Debrief generates the parameter form from the tool's declaration. |
| CAP-24 | The form shows the tool's explanation, and any judgement it involves. |
| SUB-04 | Values on the form use the analyst's units and notation. |
| TL-11, TL-13 | Results may be features, changes, deletions, non-spatial results, named sets or changes to shared state; non-spatial results appear in a temporary panel and can be saved. |
| TL-14 | Agents invoke the same tools with the same permissions. |
| SUB-19, SUB-24 | Every run is recorded, with the tool's version. |

## Model

1. **Choose.** The analyst picks a tool under **For this selection**.
2. **Form.** The tool's form opens beside the map. Debrief builds it from the declaration (TL-07):
   - the title and explanation, then any judgement, set apart so it is read (CAP-24);
   - what the tool will act on ("Applies to: NELSON, BLUE");
   - one field per parameter, with its explanation and default. A quantity has a unit picker, starting at the default's unit (SUB-04).
   - **Times** are typed as the language guide writes them: `09:30Z` (on the plot's day), `15 Jun 2023 09:30:00Z`, a date-time group such as `150930Z JUN 23`, or ISO. Under the field the form says what it understood ("Means 15 Jun 2023 09:30:00Z"), so a mistaken day is caught before the run.
3. **Run.** **Run** sends the values; **Cancel** closes the form and changes nothing. While the tool runs, the form shows *Running…* and can't be sent twice.
4. **Refused.** If a value is wrong, or the tool fails, the form stays open with the reason above the buttons, in the analyst's words. The plot is untouched (TL-03).
5. **Done.** The form closes.
   - **Features.** New or changed features appear on the map and in the outline at once. A notification says what changed ("Range rings added 3 features").
   - **Numbers and tables.** These open in a **Results** panel beside the map (TL-13). The panel:
     - repeats the tool's judgement, so a figure is never read without its caveat (CAP-24);
     - says what was added to the plot;
     - says that the figures themselves are not saved;
     - offers **Copy** for each table, as tab-separated text for a report or spreadsheet.
6. **History.** Every run that changes the plot is recorded with the tool, its version, who ran it, the selection and every value (SUB-19, SUB-24). A run that only returns a number or table changes nothing and records nothing.

Agents and keyboard users run the same tools through the **Run tool** command, without the form. The checks and the records are the same (TL-14).

```mermaid
sequenceDiagram
    actor Analyst
    participant Form as Tool form (webview)
    participant Host as Extension host
    participant Service as Tool service
    participant Worker as Tool worker
    participant Cat as Catalogue
    Analyst->>Form: Run (spacing 1.5 nmi, 3 rings)
    Form->>Host: run_tool
    Host->>Form: form_busy
    Host->>Service: tools/call (store, plot, selection, values, agent)
    Service->>Worker: run on a copy of the plot
    Worker->>Cat: check result, record history, save atomically
    Worker-->>Service: result, changed
    Service-->>Host: result
    Host->>Host: reload plot; show results if any
    Host->>Form: close
```

## Reference implementation

- **The form:** `vscode/webview/form.tsx`, built from vscrui components behind `vscode/webview/ui.tsx`.
- **Running from the host:** `vscode/src/extension.ts` (`runTool`).
- **Results panel:** `vscode/webview/results.tsx`.
- **The service side:** `debrief_tools.service` and `debrief_tools.run`.

*Not yet:* echoing values other than times back to the analyst, progress and cancelling a run that's under way (long-running operations, Phase 2), undo (Phase 2), graphs (shown as tables until then), and saving a result.
