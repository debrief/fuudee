# Panel parity — Software Requirements (Draft)

29 Oct 2026 · @Ian Mayo · supplements [srd.md](srd.md)

## 1. Purpose

The playground (`vscode/play/`) shall be a faithful stand-in for the VS Code extension, so that reviewing a change in the playground can replace most reviews in VS Code. Today the two front ends share the webview components (map, form, results, annotation, Time, Tote, Coverage, Timeline, Bearings) but **re-implement every panel that VS Code draws natively**: Catalogues, Outline, Tools and History. They also re-implement the command logic behind those panels. That code has already drifted. Appendix A lists about 60 differences in logical behaviour.

This document asks for one host-neutral model of each panel and each command, so that both front ends render the same thing by construction rather than by care.

### 1.1 Reading this document

- Identifiers are `PAR-nn`. They use **shall** and **should** as in srd.md §1.2.
- *Logical UI*: the structure of a panel (sections, groups, rows, order, counts), what each row says (label, detail, tags, tooltip, state), the actions on offer and where they are placed, when actions are enabled and the reason given when they are not, the questions asked and their choices, the messages shown and their buttons, selection and keyboard behaviour, and empty, loading and error states.
- *Cosmetic*: colour, font, spacing, icon artwork and animation. Cosmetic differences are acceptable.
- *Host difference*: a difference that the platform forces or that the product owner chose deliberately. It is acceptable only if it is listed in §5.

## 2. Root cause

1. **Native panels have no shared model.** VS Code builds each panel as a `TreeDataProvider` (`vscode/src/views/*.ts`). The playground builds the same panels as hand-written HTML in `vscode/play/host.ts` (3,660 lines). The playground started as a 20-line demo list (`3701e0b`, 11 Oct) and grew by adding features, not by porting from the extension.
2. **Sharing happened at the leaves, not the trunk.** Row text for cuts, legs and fixes (`webview/outlinemodel.ts`), question wording (`importmode.ts`, `narrativeimport.ts`, `sensorimport.ts`) and toolbar rules (`outlinetoolbar.ts`) are shared. Tree shape, menus, enablement and command flows are not.
3. **Menus live in two languages.** VS Code declares menus and enablement as `package.json` `menus` entries with `when` clauses and `contextValue`. The playground hard-codes them in TypeScript. Nothing compares the two.
4. **Commands are written twice.** Running a tool, undo and redo, collation steps, import, export and running a selection-dependent operation each exist in both `extension.ts` and `host.ts`. Appendix B lists them.
5. **No parity test.** Each front end is tested on its own, so drift is invisible until someone looks at both.

## 3. Requirements

### 3.1 Shared panel models

- **PAR-01** Each panel that VS Code draws natively (Catalogues, Outline, Tools, History) shall be built from one host-neutral **panel model**, in a module both front ends import (proposed: `vscode/webview/panels/`). The model is a tree of nodes. Each node has a stable key, kind, label, detail, tags, tooltip, icon *name* (a codicon identifier, which the playground may draw differently), selected and hidden state, branch and lazy flags, and the keys of the actions it offers. The model shall not import `vscode` or touch the DOM.
- **PAR-02** Section and group structure, ordering, counts, the 500-cut paging, which branches start open, and the empty, loading and error rows ("Open a plot to use tools.", "Starting tools…", "Not available", "None yet") shall be decided in the panel model only.
- **PAR-03** VS Code's `TreeDataProvider`s and the playground's `OutlineTree` (`play/outline.ts`) shall be thin **renderers** of the panel model. A renderer may map an icon name to artwork and choose fonts and spacing. It shall not add, drop, reorder or reword nodes.
- **PAR-04** Row text shall come from one function per node kind. This covers the tag order (e.g. `TMA · <contact> · DR · selected · hidden on map · <when>`) and the fall-back from `times` to `time` and `time_range`. The existing pieces (`cutRow`, `legRow`, `fixRow`, `sensorDetail`, `trackDetails`, `describeTimes`) shall be called from there and nowhere else.

### 3.2 Shared action catalogue

- **PAR-05** Every user action shall be declared once, in an **action catalogue**. Each entry gives the action's id, title, which node kinds and selections it applies to, its placement (panel toolbar, overflow, row context menu, group and order), and an enablement predicate that returns *enabled* or *a reason*. The catalogue covers outline, track, sensor, cut, fix, annotation, catalogue, tool and history actions.
- **PAR-06** VS Code's `package.json` `commands` and `menus` (with `when` clauses and `enablement`) and each node's `contextValue` shall be **generated** from the catalogue at build time, the same way walkthroughs are generated from `walkthroughs/tours.json` by `scripts/walkthroughs.mjs`. Hand-edited menu entries for catalogued actions shall fail the build.
- **PAR-07** The playground shall draw its context menus and panel toolbars from the same catalogue. An action placed in a row's context menu in VS Code shall be in the same row's context menu in the playground, with the same title, group order and enablement. Track, annotation, sensor, cut and fix actions shall be offered from context menus only: the playground's Track, Annotation and Sensor button groups below the Outline shall be removed (decision, product owner, 29 Oct 2026). Context menus shall open by right-click, press and hold on a touch screen, and Shift+F10 or the menu key in both front ends.
- **PAR-08** An action that cannot run shall give the same reason in both front ends, whether it is shown disabled or refused on use. Undo and Redo shall be disabled, not refused after the click, when there is nothing to undo or redo, or while an earlier revision is shown.

### 3.3 Shared command flows

- **PAR-09** Each command's logic shall be written once as a **flow** against a small **host interface**. The interface provides: ask a question, show a message (severity, text, buttons), call the service, save or download a file, open a panel or plot, and read and set shared state (SUB-26). VS Code implements it with QuickPick, `showInformationMessage`, and so on. The playground implements it with its forms and toasts. Flows in scope: run tool (including the newer-schema confirmation and conflict handling), undo, redo and go to, run a selection operation (`runOperation`), import (REP, plot file, Word/PDF, narrative, sensor), export image and find source, the collation steps (take, not now, reviewed) and changing a track.
- **PAR-10** A question (title, choices with descriptions, a "remember" option, defaults) shall be one shared object. Each host may render it in its own way (QuickPick or form), but the choices, wording, order and defaults shall be identical. A sequence of questions (e.g. narrative import) shall be the same sequence in both. Neither host shall merge questions into one form or split one question into several.
- **PAR-11** Messages shall come from the flow with their text, severity and buttons. This covers import summaries, the review-flag notice ("Show in Catalogues"), "Open the new plot", the export finish message with "Copy ID" and "Show in folder", hidden features on open with "Show all", and "Nothing was imported.". Python messages shall be worded in one place (`src/wording.ts` or the service), not decorated per host.
- **PAR-12** What happens after a flow finishes shall be the same in both hosts. For example: whether an imported plot opens by itself, whether the results panel stays open after undo, and whether a result saved as a new plot opens.

### 3.4 Shared host glue

- **PAR-13** Messages between the webview components (Time, Tote, Coverage, Timeline, Bearings, map, form, annotation) and the host shall be handled by one shared dispatcher per component. Each host supplies only its transport. Every incoming message shall be checked (`src/messages.ts` `checkMessage`) in both hosts.
- **PAR-14** The mapping from service calls to walkthrough completion events (`src/walkthroughs.ts` `serviceEvent`, `play/tours.ts` `callEvent`) shall be one shared table. A step's button shall do the same thing in both hosts (`collate.take`, `annotate.export` and `annotate.trace` currently differ).
- **PAR-15** The Python side shall offer one entry point per operation. The playground's `play/play.py` shall call the same functions as `service.py` (offered tools, unavailable tools, undo, redo and go to with a base revision for conflict checks), not re-filter or re-sequence them.

### 3.5 Verification

- **PAR-16** A **parity test** shall build each panel model and the action catalogue for each sample plot, in each selection state listed in Appendix C. It shall check that the VS Code renderer's output (the `TreeItem` label, description, tooltip, `contextValue` and resolved menus) and the playground renderer's output (row text, ARIA attributes, menu items, `disabled` and `title`) describe the same model. It shall run in CI on every pull request that touches `vscode/`.
- **PAR-17** Each shared flow shall have unit tests run against a recording fake host, so that the questions asked, messages shown and service calls made are asserted once for both front ends.
- **PAR-18** A check in CI shall fail when `play/` or `src/views/` defines rows, menus or enablement outside the shared modules. For example, it can forbid `TreeItem` construction outside the renderer, and `textContent` assignment of row labels in `host.ts`.
- **PAR-19** A short playground review checklist, `docs/notes/playground-review.md`, shall list the host differences (§5), so that a reviewer knows what the playground cannot show. Written: [playground-review.md](notes/playground-review.md).

## 4. Approach and phasing

Each phase is shippable on its own and removes code from `host.ts`.

| Phase | Scope | Requirements | Fixes in Appendix A |
|---|---|---|---|
| 1 | Outline panel model and renderers; parity test harness | PAR-01–04, 16 | A1 |
| 2 | Action catalogue; `package.json` menus generated from it; playground context menus | PAR-05–08, 18 | A1 menus, A3 enablement |
| 3 | Tools and History panel models; undo, redo and run-tool flows | PAR-01, 09, 12, 15 | A3 |
| 4 | Catalogues panel model; collation, import and export flows; question objects | PAR-09–12 | A2 |
| 5 | Shared webview dispatchers; walkthrough event table | PAR-13–14 | A4 |

The order follows where drift is worst and most visible. The Outline is reviewed most often, and the catalogue is a prerequisite for menus everywhere.

## 5. Permitted host differences

Only the differences listed here are acceptable. Any other difference is a defect.

| Difference | Reason |
|---|---|
| Playground's **Try** menu, **Reset layout** and sample-plot list | Demo only; VS Code has no equivalent need |
| Docking and layout (tab groups vs VS Code's sidebar and panel areas) | Platform |
| Bearings pop-out window (VS Code only) | Platform; *Open*: confirm |
| Files: VS Code saves and opens files on disk; the playground uploads and downloads them | Platform. The flow and its questions stay the same (PAR-09) |
| Catalogue management: Add catalogue, Add plot file, Refresh, choosing a catalogue on import | The playground has one in-browser catalogue. The Catalogues *tree* still matches (PAR-01), and a plot opens from it in both front ends |
| Playground's top-bar plot list | A shortcut to open a plot, kept beside the Catalogues tree (decision, product owner, 29 Oct 2026) |
| Playground's top-bar Export menu | A shortcut to Export image…, kept beside the map's title bar, which has it as VS Code's does; blog posts' demos embed it (decision, product owner, 30 Oct 2026) |
| Playground's next-walkthrough button, below the steps | Kept (decision, product owner, 29 Oct 2026). VS Code offers the same in its own way (§6, open issue 4): a link on each walkthrough's last step, and a notification with a button when the last step is done. Both say "<walkthrough>: done." and "Next walkthrough: <title>" in the same words |
| "Starting Python…" state in the playground | Pyodide start-up. It shall reuse VS Code's loading row and disabled reasons, not invent new ones |
| Where view state persists (webview state vs `localStorage`) | Platform; not visible |
| Rendering: QuickPick vs inline form; native tree vs HTML tree; icon artwork | Cosmetic, within PAR-03 and PAR-10 |

## 6. Open issues

1. ~~Button groups below the Outline~~. **Decided 29 Oct 2026:** context menus only (PAR-07). The walkthrough text, `site/docs/try.md` and the interaction-model guides, which pointed to buttons "below the outline", are reworded to match. Dated blog posts are left as they were published.
2. ~~Plot switching~~. **Decided 29 Oct 2026:** the playground's Catalogue panel opens plots from the tree; the top-bar list stays as a shortcut (§5).
3. ~~Tote context items~~. **Decided 29 Oct 2026:** the Tote items act on every selected track (as VS Code does). Only items that apply to the selection are shown: *Add to Tote* when any selected track is not in the Tote, *Remove from Tote* when any is. *Set as Tote primary* is shown for tracks and disabled, with its reason, when more than one track is selected or the track already is the primary (PAR-08).
4. ~~Next-walkthrough button~~. **Decided 29 Oct 2026:** keep it in the playground. **Done 30 Oct 2026:** VS Code's last step of each walkthrough links to the next (since 23 Oct), and when that walkthrough's steps are all ticked a notification offers the next, in the playground's words (`doneLabel`, `nextLabel`). After the last walkthrough it says all are done.

## Appendix A. Differences found (29 Oct 2026)

These were found by reading code on `main` at `b20755c`; nothing was run. Each item is a logical difference unless marked. Paths are under `vscode/`.

### A1. Outline (`src/views/outline.ts` vs `play/host.ts` `outlineRoots`, `play/outline.ts`, `play/outlinebar.ts`)

- **Structure.** VS Code has three sections: Plot features (Tracks, Annotations and Sensor observations groups, with counts; a Narrative row), Supporting files and Reference data (SUB-31). The playground has one flat list.
- **Features shown.** The playground lists tracks and features that have a geometry only (`host.ts:1677`). Sensor observations, time-only notes and chart furniture have no geometry, so they are missing.
- **Large sensors.** Sensors with more than 500 cuts: VS Code shows pages of 500 by time; the playground lists every cut.
- **Tags.** The "selected" tag is text in VS Code and styling only in the playground. VS Code tags a TMA solution "TMA · contact"; the playground shows "TMA". The tag order differs.
- **Annotation without `times`.** VS Code shows its `time` or `time_range`; the playground shows the kind name.
- **Frequencies line.** The playground shows an extra track frequencies line; VS Code does not.
- **Cut icons.** VS Code marks a hidden cut and an ambiguous cut with icons. The playground greys a hidden cut and does not mark an ambiguous one.
- **Context menus:**

  | Row | VS Code | Playground |
  |---|---|---|
  | Annotation | Change, Delete, Hide/Show | None |
  | Track | 12 editing items, presentation items and Tote items | Tote items only; the edits are buttons below the Outline, with shorter titles ("Move…" vs "Move track…") |
  | Sensor, cut, fix | Full menus | Partial (sensor) or none (cut, fix) |
  | Tote items | All three shown; act on the whole selection | Only those that apply; act on the right-clicked track |

- **Toolbar enablement.** Clear selection and Select all are enabled under different rules.
- **Placement.** VS Code has Add annotation, North arrow, Read sensor data and Export image on the Outline toolbar and overflow menu. The playground puts these elsewhere.

### A2. Catalogues, import and export (`src/views/catalogues.ts`, `extension.ts` vs `host.ts`)

- **Catalogue tree.** VS Code shows catalogue → plot → track, with a plot count, a read-only state and a problem row. The playground shows a flat list of collation items, which is empty until a plot is open.
- **Track rows.** VS Code shows a link state ("linked to", "proposed as") with Same platform and Not this platform actions. The playground shows plain text with no actions.
- **Collation.** The action titles and the success messages are worded differently.
- **Review flags.** VS Code gives one combined notice for all catalogues, with a "Show in Catalogues" button. The playground gives one toast per flag, and only while a plot is open.
- **After import.** VS Code shows a summary, with "Show what was not imported" and "Open plot". The playground always opens the plot. The newer-schema "Save anyway" confirmation exists in VS Code only.
- **Narrative import.** VS Code asks a chain of QuickPicks; the playground shows one form. The "Ask again" message is worded differently.
- **Export.** VS Code asks in three steps; the playground uses one form. The option labels differ, and "Copy ID" and "Show in folder" are missing in the playground. Find source of image is placed in a different menu.
- **Enablement with no plot.** The playground's narrative, sensor and export inputs are enabled with no plot open, and do nothing silently when used.

### A3. Tools and History (`src/views/tools.ts`, `history.ts`, `historyrows.ts` vs `host.ts`)

- **Tools layout.** VS Code shows a "N selected" status row, then sections with counts ("For the Outline's selection", "For this selection", "Other tools", "Not available"). The playground shows a flat sorted list, has no status row, and does not list unavailable tools.
- **Tools empty states.** The playground lists tools when no plot is open. Its tooltips give the explanation only, without the title and judgement.
- **Running a tool.** The playground has no newer-schema confirmation, and opens a new plot without asking. The refusal wording differs ("Select what this acts on…" vs "That is not offered…").
- **History rows.** The playground does not use `historyRows`, so the "next to undo" marker is missing. Its step actions are inline links with different labels. Its step tooltip shows status only. The marker separator differs (cosmetic).
- **Undo and redo.** The playground's buttons are always enabled, it sends no base revision (so no conflict check), and it closes the results panel. It has no Go to latest revision in History. "Nothing to redo" shows a raw Python error.

### A4. Webview panels and walkthroughs

- **Shared code.** The components are the same code in both hosts. Their message glue is written twice, and the playground does not check incoming messages.
- **Placement.** The control for how context tracks are drawn is in the Time panel's title menu in VS Code and inside the panel in the playground. Bearings pop-out is VS Code only. Map editor-title actions are elsewhere in the playground.
- **Walkthrough buttons.** The `collate.take`, `annotate.export` and `annotate.trace` buttons act in VS Code but only show something in the playground. `solutionMade` ticks under different conditions.
- **Timeline filter memory.** VS Code remembers it; the playground does not.

## Appendix B. Logic written twice today

| Logic | VS Code | Playground |
|---|---|---|
| Outline tree building and row text | `src/views/outline.ts:67-115, 363-401` | `play/host.ts:1659-1779` |
| Context menu rules | `package.json` `menus` and `when` | `host.ts:1787-1791, 1900-1917, 2317-2326` |
| Tools listing | `src/views/tools.ts` | `host.ts:2433-2456` |
| History rows | `src/views/historyrows.ts` | `host.ts:2458-2480` |
| `runOperation` and `operationContext` | `extension.ts:235-246, 2740-2787` | `host.ts:2164-2231` |
| Run tool and conflict handling | `extension.ts:647-731` | `host.ts:663-716` |
| Undo, redo and go to | `extension.ts:1390-1411` | `host.ts:1608-1614`, `play.py:188` |
| Catalogue and collation rows and steps | `catalogues.ts:113-121`, `extension.ts:3196-3224` | `host.ts:2557-2669` |
| Import, narrative and sensor flows | `extension.ts:2944-3100, 3305-3510` | `host.ts:2396-2426, 3251-3434` |
| Export and find source | `extension.ts:1482-1700` | `host.ts:2717-2790` |
| Webview message glue | `webview/*.ts`, `src/panels/*` | `host.ts:207-2544` |
| Walkthrough events | `src/walkthroughs.ts:41-80` | `play/tours.ts:85-127` |
| Offered-tools filter | `service.py:414-418` | `play/play.py:109-111` |

## Appendix C. Parity test states (PAR-16)

For each sample plot (serial-1 and the TMA sample):

1. No plot open.
2. A plot open with nothing selected.
3. One track selected.
4. Two tracks selected.
5. A track carrying a sensor of more than 500 cuts, opened.
6. A cut selected.
7. A TMA solution leg selected.
8. An annotation selected.
9. A hidden feature selected.
10. Mixed hidden and shown features selected.
11. An earlier revision shown (read-only).
12. Python or the service still starting.
