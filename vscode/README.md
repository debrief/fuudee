# Debrief for VS Code

The Phase 1 tracer, as a VS Code extension (CON-05):

- **Catalogues view.** Browse your catalogues and import REP files (CAP-08). **Add a plot file…** adds a plot file a colleague sent you, with its whole history, so you can undo what they did (SUB-19, decision 13 Oct).
- **The map.** Opens beside the views in Web Mercator, with lines drawn along geodesics (SUB-03, SUB-30).
- **Outline.** Plot features, supporting files and reference data (SUB-31).
- **One selection.** Selecting in the map or the outline selects everywhere (SUB-26).
- **Tools view.** Offers the tools that apply to the selection, and explains the rest (TL-08, TL-09, CON-10).
- **Tool forms.** Generated from each tool's declaration (TL-07, CAP-24).
- **Results.** Shown in a panel beside the map (TL-13).
- **Time view.** At the top of the sidebar: the plot's time window, current time within it, and play (CAP-28, SUB-26). The window is saved in the plot file, outside its history. See the [time controller](../site/docs/guides/interaction-models/time-controller.md).

How these behave is set out in the [interaction models](../site/docs/guides/interaction-models/index.md) and the [style guide](../site/docs/guides/style-guide/index.md).

## How it works

| Part | Where | Notes |
| --- | --- | --- |
| Extension host | `src/` | Reads catalogues to display them (`catalogue.ts`). Anything that changes data goes through the Python tool service (`service.ts`), where domain logic lives (PRN-03). |
| Tool service | `python/debrief-tools` | Started by the extension with a fresh token for each session, on `127.0.0.1` only (SEC-06 to SEC-08). |
| Webviews | `webview/` | The map (Leaflet), the tool form and results (React with vscrui, behind `ui.tsx`). Every message to and from a webview is validated against `WebviewMessage` (CON-08). |
| Colours | `webview/palette.ts` | The only place with hard-coded colours, all of them data colours. Interface colours are `--vscode-*` tokens (DEV-07). |

## Running it

Needs Node 22, and a Python with Debrief's packages installed. From the repository root, `uv sync` provides one.

```bash
for p in schemas kernel config; do npm ci --prefix ts/$p && npm run --prefix ts/$p build; done
cd vscode && npm ci && npm run build
```

Then open `vscode/` in VS Code and press F5. Set **Debrief: Python** to the interpreter, such as `.venv/bin/python` in the repository.

## Checks

```bash
npm run typecheck
npm test                 # unit tests, including reading a catalogue Python wrote
npm run check:theme      # no hard-coded interface colours (DEV-10)
npm run check:language   # no terms the language guide says to avoid (DEV-10)
xvfb-run -a npm run test:integration   # the tracer in real VS Code; set DEBRIEF_SCREENSHOTS to keep screenshots
```

The integration test:

1. builds the sample catalogue (DEP-08);
2. opens serial 1;
3. selects tracks and opens a tool form;
4. runs range rings, closest approach and track summary;
5. checks that each run was recorded in the plot's history.

CI runs it on every pull request and keeps the screenshots as an artifact.

## Not yet

- **Removing a catalogue from the list.**
- **Keyboard selection on the map** (NFR-13, Phase 3).
- **Drawing bearings** (Phase 4).
- **Graphs.** These are shown as tables for now.
- **Packaging as a VSIX** (Phase 3, DEP-01).
