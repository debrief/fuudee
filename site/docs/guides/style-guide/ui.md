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
- **The map.** It takes the main editor area. Tool forms and results open beside it, so the map stays in view while the analyst works.
- **Forms.** A single column, at most about 34 characters wide for each field. The explanation comes first, then the judgement, then the fields; buttons go last, primary first.
- **Messages.** Short ones go in VS Code notifications. Anything longer, such as what an import left out, goes in the **Debrief** output channel, opened from the notification.
