# Time controller

How an analyst sets the plot's time window and current time, plays through them, and what is saved where.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-28 | One time window for the whole plot, independent of its overall time range, saved in the plot file as view state. A tool's time outside it is shown, never saved, until the analyst keeps or reverts it. |
| CAP-29 | Tracks for a whole deployment at once, at least 3:1 against the map outside the window by default; sensor data only within the window. |
| SUB-22 | View state in the island is neither undoable nor recorded; two analysts changing it at once are told, not overwritten. |
| SUB-26, SUB-27 | Current time (an instant and a range) is shared state that views, extensions and tools read and set. |
| SUB-28 | A change made elsewhere is never silently overwritten. |
| NFR-13 | Everything works from the keyboard, in any theme. |

## Model

1. **One controller, every host.** VS Code shows it as the **Time** view at the top of the Debrief sidebar, above the catalogues, outline, tools and history. The playground shows the same component at the top of its side column. The map only draws: it has no control of its own.

    The controller is compact, so the whole of it shows without scrolling at the height VS Code first gives the view (at 1440 × 900, with the other Debrief views open), note and all. From the top: the window's start and end, with its length, on one line; the window's slider; the note, when there is one, on one line; current time's slider, with the step beside it; and **‹**, **▶**, **›**, the speed and current time on one line. Names that a caption would repeat are on hover and for screen readers instead.
2. **The time window** is a slider with two handles over the plot's whole period. Drag a handle to move that end; drag the band between them to move the whole window. Above it, the window's start and end, and how long it is. The window is never shorter than one second: the handles stop a second apart and never cross. A plot saved with a window of no length opens showing its first second, and that is saved only if the analyst moves it.
3. **Current time** is a slider over the window, never outside it. When the window moves past current time, current time moves with it. **‹** and **›** step back and forward; the step, about a hundredth of the window (1 s up to 1 day), shows beside the slider. Current time itself shows at the end of the buttons' line.
4. **Play** (**▶**, or Space) moves current time forward at the chosen speed and stops at the end of the window. Playing from the end starts again at the window's start. The speeds are multiples of real time:

    | Speed | Plays | For |
    | --- | --- | --- |
    | 1× | real time | a close-quarters encounter, second by second |
    | 10× | ten minutes a minute | an approach |
    | 60× (the default) | a minute a second | a four-hour serial in four minutes |
    | 600× | ten minutes a second | a serial in under half a minute |
    | 3600× | an hour a second | a week's deployment in under three minutes |

    Current time moves ten times a second while playing: smooth to follow, without flooding the views. A window shorter than one of those moves (the speed times a tenth of a second: 6 s at 60×) cannot be played: **Play** is off and says *Window too short to play at 60×: widen it or slow down*, on hover and to screen readers. It stays focusable, so the reason can be read.

5. **What the map shows.** Within the window, tracks are drawn in full: solid lines 2.5 px wide, direction ticks, a hollow dot at the first fix in the window and a filled, labelled dot at the last. Outside it, each whole track stays in view as a **context track**, so a deployment of weeks still reads as one picture (CAP-29): a solid line 1.5 px wide, with no ticks, dots or labels, in the track's hue made quieter (moved toward the theme's text colour). Annotations with a time or a period are drawn only while it falls in the window; annotations without one always are. Sensor data will be drawn only within the window (CAP-29); bearings are not drawn yet.

    **Context tracks** are set for the plot and saved in its island like the window. In VS Code they are in the Time view's **...** menu, on its title bar: **Context tracks: Visible**, **Faint** and **Hidden**, the plot's choice checked (the commands `debrief.contextTracks.visible`, `.faint` and `.hidden`, which run `debrief.setContextTracks`). When the analyst's setting draws faint as visible, the view's title says so. The playground has no title menu: its **Context** list is beside the window's length.

    | Setting | Draws them |
    | --- | --- |
    | Visible (the default) | At least 3:1 against the map's background on any theme, as drawn. Debrief works this out from the theme's editor background: opacity 0.6, and each colour's lightness moved away from the background only as far as it needs. |
    | Faint | Fainter (opacity 0.35), for a busy plot. No 3:1 promise. |
    | Hidden | Not at all: only the window shows. |

    An analyst who needs the contrast everywhere turns on the setting **Debrief › Map: Minimum Context Contrast** (`debrief.map.minimumContextContrast`): faint is then drawn visible on every plot they open, without changing the plot; hidden is still hidden. High-contrast themes draw context tracks in the track's own colour, opaque, 1 px wide. Selecting a feature dims the others, context tracks included, but never below opacity 0.3, and never on a high-contrast theme.
6. **Moving shows; letting go saves.** The map follows the window as it moves. The window is saved in the plot when the analyst lets go: the pointer is released, or the key is released. Holding an arrow key down saves once. Saving on every movement would rewrite the plot file many times a second and, on a shared folder, look to a colleague like a flood of changes.
7. **What is saved where.**

    | | Where | Undoable | In the history |
    | --- | --- | --- | --- |
    | Time window, context tracks | The plot file, in its island | No | No |
    | Current time | Shared state, not saved | No | No |
    | Colour, hiding, data | The plot, through its history | Yes | Yes |

    The window travels with the plot: a colleague given the plot file opens it on the same window. `Ctrl+Z` never changes the window, and moving the window never conflicts with a change to the plot's content.
8. **Shared state follows the window.** The range of current time in shared state is the window as shown, so tools and other extensions see it, and it follows a drag at once.
9. **A tool's time outside the saved window.** Closest approach, say, moves current time to the moment it finds. If that is outside the saved window, Debrief shows it without saving anything:

    - the window shown widens by the least amount that takes the time in, but never to more than twice the saved window's length. Beyond that, the window moves instead: the saved length, centred on the time, kept within the plot's period;
    - the part of the window bar that differs from the saved window is hatched, and a note says *Showing beyond saved window* (or *Showing a different period from the saved window*, when it moved), with **Keep** and **Revert** at its right. The note is one line: in a narrow view its text is cut short, and shows whole on hover. It stays until the analyst chooses, and screen readers hear all of it (a polite live region);
    - the tool's message adds *(outside your saved window)*. The history records the tool's run and its result, such as the closest approach's time, never a window.

    **Keep** saves the window shown, as letting go does, conflict checks included (SUB-28). **Revert** shows the saved window again, with current time moved to its nearest edge. Dragging a handle or the band, or moving a handle from the keyboard, saves the window as left, so it counts as Keep. Moving current time, stepping and playing inside the window shown neither save it nor clear the note. If the plot is closed or VS Code reloads, the window shown is lost and the saved one returns.

    A tool whose purpose is to set the window (none ships yet) can ask for its range to be saved (`save_window` on its `state_change`). Debrief saves it, through the same path, only when the analyst ran that tool by hand from its form on the plot still open; a run by an agent, a command, a chain or a replay is shown as above, never saved.
10. **A colleague's window.** If someone else changes the plot's window, Debrief notices (it watches the plot file as well as its history), shows the new window without reading the plot's content again, and says so. If the analyst lets go of a window after a colleague changed it, theirs is kept: Debrief shows it and says *Someone else changed the time window, so yours was not saved*. Nothing is merged or overwritten silently (SUB-28).

### Keyboard

| Focus | Key | Does |
| --- | --- | --- |
| A window handle | ← → ↑ ↓ | Moves that end by a step (a hundredth of the plot's period); saved when the key is released |
| A window handle | Page Up, Page Down | Ten steps |
| Window start | Home, End | To the plot's start; to a second before the window's end |
| Window end | Home, End | To a second after the window's start; to the plot's end |
| Current time | ← → ↑ ↓ | One step (a hundredth of the window) |
| Current time | Page Up, Page Down | Ten steps |
| Current time | Home, End | The window's start and end |
| Any slider | Space | Play or pause |
| Speed | ↑ ↓ | Choose a speed |
| Keep, Revert | Enter, Space | Save the window shown; show the saved window again |
| Context tracks (the playground's list) | ↑ ↓ | Visible, faint or hidden. In VS Code, the view's **...** menu, or the commands in the Command Palette |

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

- **The component:** `vscode/webview/timecontrol.ts` and `timecontrol.css`; its rules, free of the page, in `vscode/webview/timelogic.ts` (window limits, steps, speeds, `Player`, `WindowGesture`, `windowForTime`, `placeToolTime`, `SavedWindow`), tested in `vscode/test/unit/timecontrol.test.ts` and `timewindow.test.ts`.
- **Context tracks:** `vscode/webview/contrast.ts` (`contextStyle`: colour, opacity and width per theme), tested against every palette colour on Dark+ and Light+ in `vscode/test/unit/contrast.test.ts`; drawn by `applyContext` in `vscode/webview/map.ts`.
- **VS Code:** the Time view, `vscode/src/panels/timeview.ts` and `vscode/webview/time.ts`; saving and noticing the island in `vscode/src/extension.ts` (`saveWindow`, `saveContext`, `saveView`, `applyToolState`, `refreshView`, `watch`); the window in shared state in `vscode/src/session.ts` (`windowChanged`, `onView`); what the map draws in `vscode/webview/map.ts` (`drawWindow`). The commands `debrief.setTimeWindow` and `debrief.setContextTracks` set them for agents and keyboard macros; the Time view's title menu runs `debrief.contextTracks.visible`, `.faint` and `.hidden`, checked through the context key `debrief.contextTracks`.
- **The playground:** `vscode/play/host.ts` (`saveView`, `showToolTime`) and `set_view` in `vscode/play/play.py`. It has no settings: the minimum-contrast setting is always off there.
- **Messages:** `show_time` (with `saved_window`, `context_tracks`, `minimum_context_contrast`), `window_changed`, `context_changed` and `set_context` (`WebviewMessage`). VS Code's Time view no longer sends `context_changed`, since the choice moved to its title menu; the kind stays in the schema.
- **The service:** `debrief/set_view` and `debrief/open`; `Catalogue.write_view`. The island's `context_tracks` and a result's `save_window` are in the schema (0.0.10).
- **The tests:** the integration test's time window and context steps; the playground test's `playTheTimeController` and its closest approach steps, and `vscodeTimeView`, which loads VS Code's Time view page at the view's first size and checks that everything shows without scrolling, with the note and without.

*Not yet:* drawing sensor data (bearings arrive with Phase 4's D stream, and will be limited to the window); the window following current time while playing; a choice of step.
