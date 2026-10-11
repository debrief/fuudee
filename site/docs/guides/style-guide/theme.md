# Theme

**North Star:** look native to VS Code; keep colour for what the data means.

## Interface colours

Interface colours come only from VS Code theme tokens (`--vscode-*` variables), so Debrief follows the analyst's theme, including high contrast (CON-06, NFR-13). The web build supplies the same variables.

| Need | Token |
| --- | --- |
| Background of a webview, and of the map's sea | `--vscode-editor-background` |
| Text | `--vscode-foreground`; secondary text `--vscode-descriptionForeground` |
| Selection outline on the map: dotted, never a force colour | `--vscode-editor-foreground` |
| Floating readouts (cursor position, scale) | `--vscode-editorWidget-*` |
| Hover tooltips | `--vscode-editorHoverWidget-*` |
| A tool's judgement | `--vscode-textBlockQuote-*` |
| Errors on a form | `--vscode-errorForeground`, `--vscode-inputValidation-error*` |

Native views (the catalogues, outline and tools views) use `ThemeIcon` and `ThemeColor`, never colours of their own.

**The check (DEV-10).** `npm run check:theme`, run in CI, fails on any hard-coded colour in the extension or its webviews, except in `vscode/webview/palette.ts`, which holds the data colours.

## Data colours

Data colours are separate from the theme and do not change with it (DEV-07). That covers track conventions such as red and blue forces, and sensor and annotation colours.

- **Tracks.** A track's colour is stored with it (`style.colour`). On import it comes from the legacy REP symbology, so a red track stays red. Legacy's palette is kept: red `#e01c3e`, blue `#0064bd`, green `#00800b`, and so on (`debrief_io.rep.SYMBOLOGY_COLOURS`).
- **Tracks.** Tracks are drawn solid, with:
  - chevrons showing the direction of travel;
  - a hollow dot at the first fix;
  - a filled, labelled dot at the latest fix, where analysts look for a track's name.
  
  Hovering a track shows the nearest fix: time, position, course, speed, and depth where known.
- **Annotations.** One amber, `#c7820a`, until annotations carry their own colours. Every annotation is dashed and labelled, so nothing a tool draws can be mistaken for a track. That includes lines, areas and points, and everything tools draw. *Known clash:* the amber is close to legacy orange (`F`, `#ff9600`), so an orange track and an annotation line differ by dash alone.
- **Legend.** The map carries a legend for these conventions.
- **Reference data.** Land is a neutral grey-green at 35% opacity. The graticule is neutral grey. Both are chosen to sit behind the data on any theme.

All of these live in `vscode/webview/palette.ts`. *Analysts review the palette before Phase 1 exits.*

## Contrast and accessibility

Data colours shall remain distinguishable on light, dark and high-contrast themes (NFR-13).

- **Track labels.** These take the theme's text colour, with a halo in the background colour, so they read on any theme.
- **Not yet checked.** The legacy red and blue have not been measured for contrast on light themes, or for colour-blind analysts. That check comes with the analysts' review.
