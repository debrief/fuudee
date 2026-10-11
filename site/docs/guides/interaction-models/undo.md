# Undo

How an analyst steps back through changes to data and to presentation.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| SUB-21 | Undo is replay to a point; tools never implement undo. |
| SUB-19, SUB-20 | Prior states are rebuilt by deterministic replay from sources. |
| SUB-22 | Presentation changes have a local history; view state is neither undoable nor recorded. |
| NFR-10 | After an unexpected exit, at most the last operation is lost. |

## Model

1. **Every change is a step.** An import, a tool run or an edit becomes one step in the plot's history, recording what made it, who, when, and what it changed (SUB-19, SUB-24). The **History** view lists the steps, newest first, and marks the current one.
2. **Undo** (`Ctrl+Z` on the map, the outline or the History view, or the button on the History view) returns the plot to the step before. Nothing is deleted: the step undone stays in the list, marked *Undone*.
3. **Redo** (`Ctrl+Shift+Z` or `Ctrl+Y`) brings back what was last undone in this window. Once anything new is done, a change to the plot or to its presentation, there is nothing to redo: Debrief says so rather than bringing back an older undone step. Undone steps of the plot stay in the History view, where **Redo up to this step** still reaches them.
4. **Go back to a step.** On any step still in the plot, **Go back to this step** returns the plot to just after it; on an undone step, **Redo up to this step** brings everything back up to it. Each step shows its number, and whether it is current, undone or replaced.
5. **A new change after undoing** replaces the undone steps. They stay on record, marked *replaced by a later change*, and can't be redone (decision, 11 Oct 2026). Nothing is ever silently lost.
6. **The import can't be undone.** A plot's first step is where its history starts; to start again, import the source again.
7. **Presentation changes** (a track's colour, hiding a feature on the map, from the outline's context menu) are undoable too, through a local history: they are listed in a **Presentation (this window)** group at the top of the History view, and are kept beside the plot but never in its history or provenance (SUB-22). One undo takes back whatever the analyst did last, a presentation change or a change to the plot; the History view marks that entry *next to undo*. An undo or redo that can't be saved leaves the timeline as it was, so trying again takes back the same thing.
8. **Presentation is shared.** Colours and hidden features belong to the plot, so everyone who opens it sees them, and Debrief shows a change someone else makes. Undoing a presentation change puts back only the values that change set, on the presentation as it is now, so someone else's colours or hiding are never wiped (SUB-28). Hidden features never go unseen: the map shows how many are hidden, with **Show all**, and opening a plot with hidden features says how many.
9. **What isn't undone.** Current time, selection and viewport are view state: undo leaves them where they are, and they aren't recorded (SUB-22). Results panels stay open.
10. **After a crash.** Opening a plot finishes a change that was interrupted part-way, and says so; at most the change in progress is lost (NFR-10).

Undo works by replay: the plot is rebuilt from the recorded outputs of the steps up to the one chosen, never by asking tools to reverse themselves (SUB-20, SUB-21). Agents undo through the tool service's `debrief/undo`, `debrief/redo` and `debrief/goto`, with the same rules.

```mermaid
sequenceDiagram
    actor Analyst
    participant Host as Extension host
    participant Service as Tool service
    participant History as Plot history
    Analyst->>Host: Undo (Ctrl+Z)
    Host->>Service: debrief/undo (plot, base it is showing)
    Service->>History: under a short lock: is base still current?
    alt changed elsewhere
        History-->>Service: Conflict
        Service-->>Host: -32001
        Host->>Host: show the latest; say nothing was undone
    else
        History->>History: replay to the step before; write head, then plot
        Service-->>Host: new base
        Host->>Host: reload plot and History view
    end
```

## Reference implementation

- **The history:** `debrief_stac.history` (deltas, replay, undo, redo, recovery).
- **The service:** `debrief/open`, `debrief/history`, `debrief/undo`, `debrief/redo`, `debrief/goto` in `debrief_tools.service`.
- **The extension:** the History view, `vscode/src/views/history.ts`; commands and keys in `vscode/src/extension.ts` (`move`) and `vscode/package.json`.
- **The test:** the integration test's Phase 2 exit: edit, undo, a Debrief process killed mid-save, recover.
- **Presentation:** `debrief_stac.Catalogue.read_presentation` and `write_presentation`; `debrief/presentation` and `debrief/set_presentation`; `vscode/src/presentation.ts` (per-feature steps and the undo timeline, `UndoTimeline`), `vscode/src/views/historyrows.ts` (what the History view lists) and the undo and redo commands in `vscode/src/extension.ts`.

*Not yet:* other presentation (line styles, labels, layer settings) and display windows (CAP-28), which arrive with their features. The local history of presentation changes is kept in memory for the VS Code window, one per plot: opening another plot and coming back keeps it, but closing or reloading the window clears it. The presentation itself is saved with the plot and stays.
