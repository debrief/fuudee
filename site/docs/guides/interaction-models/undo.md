# Undo

How an analyst steps back through changes to a plot, including its colours and what is hidden, and what undo leaves alone.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| SUB-21 | Undo is replay to a point; tools never implement undo. |
| SUB-19, SUB-20 | Prior states are rebuilt by deterministic replay of the recorded steps; the whole history is in the plot file, protected by checksums. |
| SUB-22 | Content (data, colours, hiding) is recorded and undoable; view state, including the plot's island, is neither undoable nor recorded. |
| NFR-10 | After an unexpected exit, at most the last operation is lost. |
| NFR-11 | Saves are atomic: the plot file is always the whole plot before a change or after it. |

## Model

1. **Every change is a step.** An import, a tool run or an edit becomes one step in the plot's history, recording what made it, who, when, and what it changed (SUB-19, SUB-24). The **History** view lists the steps, newest first, and marks the current one.
2. **Undo** (`Ctrl+Z` on the map, the outline or the History view, or the button on the History view) returns the plot to the step before. Nothing is deleted: the step undone stays in the list, marked *Undone*.
3. **Redo** (`Ctrl+Shift+Z` or `Ctrl+Y`) brings back the next undone step. Once anything new is done, there is nothing to redo: Debrief says so rather than bringing back an older undone step. Undone steps that a new change replaced stay in the History view, on record.
4. **Go back to a step.** On any step still in the plot, **Go back to this step** returns the plot to just after it; on an undone step, **Redo up to this step** brings everything back up to it. Each step shows its number, and whether it is current, undone or replaced.
5. **A new change after undoing** replaces the undone steps. They stay on record, marked *replaced by a later change*, and can't be redone (decision, 11 Oct 2026). Nothing is ever silently lost.
6. **The import can't be undone.** A plot's first step is where its history starts; to start again, import the source again.
7. **Colour and hiding are changes to the plot.** Changing a track's colour (blue friendly to red enemy, say) or hiding a feature on the map, from the outline's context menu, is a step like any other: recorded with who made it, named in the History view ("Colour of BLUE ONE set to red", "Cargo 01 hidden on the map"), and undone by `Ctrl+Z` (decision, 12 Oct 2026). A colour or hiding change made against a plot someone else has changed since is refused, as any change is, and Debrief shows the latest (SUB-28). Hidden features never go unseen: the map shows how many are hidden, with **Show all**, and opening a plot with hidden features says how many.
8. **The plot's island: view state that travels with the plot.** Some view state is saved in the plot file, so a colleague given the plot sees it as it was left: the plot's time window, for now (one window for the whole plot, CAP-28). It sits on the plot's own details (the whole-plot feature) as its *view*, an island outside the history. Changing it is never a step, is never undone and is never recorded. The history ignores it: every hash and every recorded step leaves it out, so moving the window never conflicts with a change to the plot, undo and redo leave it where it is, and a plot file whose only difference is its window is never treated as edited outside Debrief. Two people changing the window at once are told, not silently overwritten: a change of view names the view it started from.
9. **What isn't undone.** Current time, selection and viewport are view state: undo leaves them where they are, and they aren't recorded (SUB-22). Neither is the plot's island. Results panels stay open.
10. **After a crash.** Every change rewrites the plot file whole, and the new file replaces the old one only once it is complete, so a crash leaves the plot as it was before the change in progress. Opening the plot says a save was interrupted; at most that change is lost (NFR-10, NFR-11).
11. **The history travels with the plot.** The plot file holds the whole history, every step, undone and replaced ones included, so an analyst who sends a colleague the plot file sends its history. The colleague adds it to a catalogue with **Add a plot file…** (on the Catalogues view); one more step records where it came from, and the colleague can undo, redo and go back to any step, the sender's included (decision, 13 Oct 2026). That step changes nothing on the map, so `Ctrl+Z` takes it back together with the sender's last change, and redo brings both back; the History view marks both as *next to undo*. A step the sender had undone and not redone comes across replaced by that later step: kept on record, but it can't be redone. Source files don't travel and aren't needed: each step holds its output.
12. **Nothing is ever thrown away.** All history is kept: there is no limit on steps and nothing is folded together.
13. **Checked for changes made outside Debrief.** Each step carries a checksum that covers it and the step before, and the current step records the checksum of the plot's content. A history altered by hand is shown but never changed: undo, redo and every change are refused, and Debrief says what failed. Content that no longer matches its history is rebuilt from the history, with the file as found kept beside it. The island is outside every checksum, so a new time window is never mistaken for an edit.

Undo works by replay: the plot is rebuilt from the recorded outputs of the steps up to the one chosen, never by asking tools to reverse themselves (SUB-20, SUB-21). Replay rebuilds content only; the island on disk is carried over unchanged. Agents undo through the tool service's `debrief/undo`, `debrief/redo` and `debrief/goto`, colour and hide through `debrief/set_colour` and `debrief/set_hidden`, and change the view through `debrief/set_view`, with the same rules. Tools see a plot's content, never its island: a tool run is recorded by its selection and parameters, so it must not depend on view state outside the history; a tool that needs a time span takes it as a parameter.

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
        History->>History: replay to the step before; write the plot file whole
        Service-->>Host: new base
        Host->>Host: reload plot and History view
    end
```

## Reference implementation

- **The history:** `debrief_stac.history` (steps in the plot file, replay, undo, redo, recovery, checksums, moving a history folder into the plot file); `debrief_schemas.chain` (the hash chain and the content hash); `HistoryStep` and `PlotHistory` in `schemas/linkml/history.yaml`.
- **A plot file from a colleague:** `Catalogue.add_plot_file`; `debrief/add_plot_file`; **Add a plot file…** (`debrief.addPlotFile`) in `vscode/src/extension.ts`.
- **The service:** `debrief/open`, `debrief/history`, `debrief/undo`, `debrief/redo`, `debrief/goto` in `debrief_tools.service`.
- **The extension:** the History view, `vscode/src/views/history.ts`; commands and keys in `vscode/src/extension.ts` (`move`) and `vscode/package.json`.
- **The test:** the integration test's Phase 2 exit: edit, undo, a Debrief process killed mid-save, recover; and its last part, a plot file sent to a colleague, who undoes a step the sender made.
- **Colour and hiding:** `debrief_stac.Catalogue.set_colour` and `set_hidden`; `debrief/set_colour` and `debrief/set_hidden`; `restyle` and the colour and hide commands in `vscode/src/extension.ts`; `vscode/src/hidden.ts` (what the map shows).
- **The island:** `debrief_schemas.island`; in `debrief_stac.history`, `content_hash` (every hash leaves the island and the history out), `write_view` (under the history's lock, refused if the view changed since it was read) and the island carried over by commit, replay, undo and recovery; `debrief/set_view`, and the view and its hash from `debrief/open`.
- **Retired:** `presentation.json`. Before schema 1.0 a plot from an older schema version cannot be opened at all (SUB-13), so this rarely applies: a plot of the current version that still has one gets, the first time a writer opens it, one recorded step applying its colours and hidden features, and the file is deleted (`Catalogue.migrate_presentation`); a read-only catalogue applies it in memory.

The [time controller](time-controller.md) sets the plot's window and says what is saved where. *Not yet:* other view state in the island, which arrives with its features. Other presentation (line styles, labels) will be content, like colour.
