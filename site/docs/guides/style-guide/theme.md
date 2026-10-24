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
| Guidance accent: what guides a newcomer (the Walkthroughs panel), set apart from the panels around it: a 3 px edge, a heading bar tinted with it at 14% over the panel's background, step numbers in it, the next step's a disc of it with the panel's background as its text, and the folded tab edged and tinted the same | `--vscode-textLink-foreground`, or `--vscode-focusBorder` where a theme has none (`--debrief-guide-accent` in the playground's `host.css`). Text on it and beside it keeps WCAG AA, 4.5:1, on light and dark themes, tested |

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
- **Annotations.** By default one amber, `#c7820a`, dashed and labelled, so nothing a tool draws can be mistaken for a track. That includes lines, areas and points, and everything tools draw; an area is tinted faintly (5%) so what lies inside stays clear. An analyst may give an annotation its own colour (the amber, a track colour by name, or any colour), a solid, dashed or dotted line and its width, a fill and its opacity, and its label's size and place (schema 0.0.12). An annotation drawn solid in a track's colour still has no direction ticks or end dots and is still labelled; the analyst chose it, and it is recorded. A legacy plot's annotations keep the colours and line styles legacy Debrief drew them in. *Known clash:* the amber is close to legacy orange (`F`, `#ff9600`), so an orange track and an annotation line differ by dash alone.
- **Chart furniture.** The scale bar and the north arrow take the theme's text colour on the editor widget's background: they are interface, not data.
- **Drawing and handles.** The drawing toolbar is the theme's secondary buttons, the kind being drawn a primary one. What is being drawn is sketched dashed in the annotation amber, since it will be an annotation; the handles on a selected annotation, the cross in the map's middle and the note saying what to do are the theme's focus colour on its background, so they read as interface on any theme, high contrast included.
- **Cleaning a track.** Jumps found, and a fix chosen in the fix list, are ringed in the theme's warning colour (`editorWarning.foreground`, the focus colour where a theme has none): they are for the analyst to check, not data. A smoothing preview is the track as it would be, dashed, in the theme's focus colour, over the track as it is. A marked fix's own colour is a data colour (the track colours, amber and yellow, in `palette.ts`): its dot and the line from it to the next fix; a fix with only a label or a comment is a ring in the track's colour. Labels beside fixes are the theme's text colour with a halo of the map's background, as a track's name is.
- **Moving a track.** A selected track's move, rotate and pivot handles, and the dashed arm from the pivot to the rotate handle, are the theme's focus colour on its background, like an annotation's handles. While a track is dragged, it is drawn moved in its own force colour, solid, over the track as it was, dashed and fainter in the same colour: the data keeps its colour, and the interface around it is the theme's. The *What changes* control is the theme's secondary buttons, the choice made a primary one; so is its *Drag the ends* choice, *Shear* or *Stretch*. The diamonds at a track's ends are the focus colour on the theme's background, the same for a shear and a stretch except that a stretch's has a double edge, so the choice is seen without colour.
- **Legend.** The map carries a legend for these conventions.
- **Reference data.** Land is a neutral grey-green at 35% opacity. The graticule is neutral grey. Both are chosen to sit behind the data on any theme.

All of these live in `vscode/webview/palette.ts`. *Analysts review the palette before Phase 1 exits.*

## Contrast and accessibility

Data colours shall remain distinguishable on light, dark and high-contrast themes (NFR-13).

- **Track labels.** These take the theme's text colour, with a halo in the background colour, so they read on any theme.
- **Not yet checked.** The legacy red and blue have not been measured for contrast on light themes, or for colour-blind analysts. That check comes with the analysts' review.
