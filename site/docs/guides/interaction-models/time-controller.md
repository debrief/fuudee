# Time controller

How an analyst sets the plot's time window and current time, plays through them, and what is saved where.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-28 | One time window for the whole plot, independent of its overall time range, saved in the plot file as view state. |
| CAP-29 | Tracks for a whole deployment at once; sensor data only within the window. |
| SUB-22 | View state in the island is neither undoable nor recorded; two analysts changing it at once are told, not overwritten. |
| SUB-26, SUB-27 | Current time (an instant and a range) is shared state that views, extensions and tools read and set. |
| SUB-28 | A change made elsewhere is never silently overwritten. |
| NFR-13 | Everything works from the keyboard, in any theme. |

## Model

1. **One controller, every host.** VS Code shows it as the **Time** view at the top of the Debrief sidebar, above the catalogues, outline, tools and history. The playground shows the same component at the top of its side column. The map only draws: it has no control of its own.
2. **The time window** is a slider with two handles over the plot's whole period. Drag a handle to move that end; drag the band between them to move the whole window. The caption says how long the window is.
3. **Current time** is a slider over the window, never outside it. When the window moves past current time, current time moves with it. **‹** and **›** step back and forward; the caption shows the step, about a hundredth of the window (1 s up to 1 day).
4. **Play** (**▶**, or Space) moves current time forward at the chosen speed and stops at the end of the window. Playing from the end starts again at the window's start. The speeds are multiples of real time:

    | Speed | Plays | For |
    | --- | --- | --- |
    | 1× | real time | a close-quarters encounter, second by second |
    | 10× | ten minutes a minute | an approach |
    | 60× (the default) | a minute a second | a four-hour serial in four minutes |
    | 600× | ten minutes a second | a serial in under half a minute |
    | 3600× | an hour a second | a week's deployment in under three minutes |

    Current time moves ten times a second while playing: smooth to follow, without flooding the views.

5. **What the map shows.** Within the window, tracks are drawn in full: solid lines, direction ticks, a hollow dot at the first fix in the window and a filled, labelled dot at the last. Outside it, each whole track stays as a faint line, so a deployment of weeks still reads as one picture (CAP-29). Annotations with a time or a period are drawn only while it falls in the window; annotations without one always are. Sensor data will be drawn only within the window (CAP-29); bearings are not drawn yet.
6. **Moving shows; letting go saves.** The map follows the window as it moves. The window is saved in the plot when the analyst lets go: the pointer is released, or the key is released. Holding an arrow key down saves once. Saving on every movement would rewrite the plot file many times a second and, on a shared folder, look to a colleague like a flood of changes.
7. **What is saved where.**

    | | Where | Undoable | In the history |
    | --- | --- | --- | --- |
    | Time window | The plot file, in its island | No | No |
    | Current time | Shared state, not saved | No | No |
    | Colour, hiding, data | The plot, through its history | Yes | Yes |

    The window travels with the plot: a colleague given the plot file opens it on the same window. `Ctrl+Z` never changes the window, and moving the window never conflicts with a change to the plot's content.
8. **Shared state follows the window.** The range of current time in shared state is the window as shown, so tools and other extensions see it, and it follows a drag at once. A tool that moves current time outside the window widens the window on screen, not in the plot file; the next window the analyst sets is saved as usual.
9. **A colleague's window.** If someone else changes the plot's window, Debrief notices (it watches the plot file as well as its history), shows the new window without reading the plot's content again, and says so. If the analyst lets go of a window after a colleague changed it, theirs is kept: Debrief shows it and says *Someone else changed the time window, so yours was not saved*. Nothing is merged or overwritten silently (SUB-28).

### Keyboard

| Focus | Key | Does |
| --- | --- | --- |
| A window handle | ← → ↑ ↓ | Moves that end by a step (a hundredth of the plot's period); saved when the key is released |
| A window handle | Page Up, Page Down | Ten steps |
| Window start | Home, End | To the plot's start; to the window's end |
| Window end | Home, End | To the window's start; to the plot's end |
| Current time | ← → ↑ ↓ | One step (a hundredth of the window) |
| Current time | Page Up, Page Down | Ten steps |
| Current time | Home, End | The window's start and end |
| Any slider | Space | Play or pause |
| Speed | ↑ ↓ | Choose a speed |

Each slider has a name and says its time to screen readers (`aria-valuetext`). Colours come from the theme only.

```mermaid
sequenceDiagram
    actor Analyst
    participant Controller as Time controller
    participant Host as Extension host
    participant Map
    participant Service as Tool service
    participant Plot as Plot file
    Analyst->>Controller: drag a window handle
    loop as it moves
        Controller->>Host: time_changed (current time; range = window)
        Host->>Map: set_time: draw the window
    end
    Analyst->>Controller: let go
    Controller->>Host: window_changed (the window)
    Host->>Service: debrief/set_view (view, hash last read)
    alt changed elsewhere since it was read
        Service-->>Host: CONFLICT
        Host->>Service: debrief/open: read the view again
        Host->>Controller: show_time (their window)
        Host->>Analyst: yours was not saved; showing theirs
    else
        Service->>Plot: rewrite the island only, under the history's lock
        Service-->>Host: new view hash
    end
```

## Reference implementation

- **The component:** `vscode/webview/timecontrol.ts` and `timecontrol.css`; its rules, free of the page, in `vscode/webview/timelogic.ts` (window limits, steps, speeds, `Player`, `WindowGesture`), tested in `vscode/test/unit/timecontrol.test.ts`.
- **VS Code:** the Time view, `vscode/src/panels/timeview.ts` and `vscode/webview/time.ts`; saving and noticing windows in `vscode/src/extension.ts` (`saveWindow`, `refreshView`, `watch`); the window in shared state in `vscode/src/session.ts` (`windowChanged`); what the map draws in `vscode/webview/map.ts` (`drawWindow`). The command `debrief.setTimeWindow` sets it for agents and keyboard macros.
- **The playground:** `vscode/play/host.ts` (`saveWindow`) and `set_view` in `vscode/play/play.py`.
- **Messages:** `show_time` and `window_changed` (`WebviewMessage`).
- **The service:** `debrief/set_view` and `debrief/open`; `Catalogue.write_view`.
- **The tests:** the integration test's time window steps; the playground test's `playTheTimeController`.

*Not yet:* drawing sensor data (bearings arrive with Phase 4's D stream, and will be limited to the window); the window following current time while playing; a choice of step.
