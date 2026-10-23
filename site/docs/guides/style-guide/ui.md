# User interface

**North Star:** look native to VS Code; keep colour for what the data means.

## Components

Webviews and the web build use vscrui (CON-06). They use it only through Debrief's own wrappers in `vscode/webview/ui.tsx`, so the library can be replaced in one place (PRN-09).

| Need | Wrapper | vscrui |
| --- | --- | --- |
| A labelled field, with its explanation and any problem | `Field` | `Label` |
| Text, numbers or a time | `TextInput` | `TextField` |
| One of a list, including units | `Choice` | `Dropdown` |
| Yes or no | `YesNo` | `Checkbox` |
| A button: one primary per form, the rest secondary | `Action` | `Button` |

**The browser's layout: Dockview, browser only** (decision, product owner, 23 Oct 2026). In the playground and the web demo, the panels are docked in tab groups with [Dockview](https://dockview.dev) (`dockview-core`, plain TypeScript, MIT), only through `vscode/play/dock.ts`, so it can be replaced in one place. VS Code needs none: it lays out its own views. Its rules:

- **Pinned, bundled, upgraded on purpose.** An exact version in `vscode/package.json`, bundled into the page, never loaded from a CDN, so the Content-Security-Policy is unchanged. An upgrade is its own pull request, with the layout's tests (`vscode/test/play/dock.mjs`) and the layout version (`LAYOUT_VERSION`) raised if a remembered layout would no longer read.
- **Never a frame inside it.** Moving a frame reloads it: the map and the form beside it are laid over the map's place, and every panel is rendered always (`renderer: "always"`), only hidden when its tab is not in front.
- **Themed from the theme.** Dockview's colours come only from `--vscode-*` variables (`vscode/play/dock.css`, held to it by `npm run check:theme`): tabs as VS Code's panel tabs, sashes and borders as its panel borders.
- **Every panel stays.** No tab closes; none floats or pops out. A panel moves by drag, or by its tab's menu from the keyboard.
- **Docked from 900 pixels wide and 480 high**, touch screens too (larger targets under `pointer: coarse`); narrower, the one side column with folding panels.
- **Its panels in one table** (`vscode/play/panels.mjs`): their names, the default layout and the side column's order, read by the page and the tests alike.
- **A remembered layout is checked before it is built** (`layoutProblem`), and a broken one forgotten: an upgrade that changes Dockview's saved form raises `LAYOUT_VERSION`.

**Native or webview (CON-07).** Lists and trees are native VS Code views: catalogues, outline, tools. They come with keyboard support, theming and accessibility for free. Webviews are for what native views can't draw: the map, forms and result tables.

## Icons

Codicons for interface actions; Debrief's own symbols for data.

| Thing | Codicon |
| --- | --- |
| Catalogue | `library`; read-only: `lock` |
| Plot | `map` |
| Track | `pulse` |
| Annotation | `symbol-misc` |
| Sensor observations | `radio-tower` |
| Source file | `lock`, because Debrief never changes it |
| A tool you can run | `play`; not for this selection: `circle-slash`; not available: `error` |

The activity bar icon (`vscode/media/debrief.svg`) is drawn in one colour, which VS Code tints to match the theme.

## Layout across hosts

The same layout rules apply to native views, webviews and the web build (CON-05, CON-07).

- **Debrief's side bar.** Catalogues, then the outline of the open plot, then tools: browse, inspect, act.
- **The browser.** A top bar (the plot, menus for import, export and the demonstrations, Reset layout) over the panels docked around the map, task-grouped: time, the Tote, the outline and catalogue, and the tools and history on the left; the Timeline under the map; the walkthroughs alone on the right ([browser layout](../interaction-models/browser-layout.md)).
- **The map.** It takes the main editor area. Tool forms and results open beside it, so the map stays in view while the analyst works.
- **Forms.** A single column, at most about 34 characters wide for each field. The explanation comes first, then the judgement, then the fields; buttons go last, primary first.
- **Messages.** Short ones go in VS Code notifications. Anything longer, such as what an import left out, goes in the **Debrief** output channel, opened from the notification.
