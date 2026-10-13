# Keyboard equivalents

How every map action can be done without a mouse.

*The model, its sequence diagram and its reference implementation are written in Phase 3. Version 0 gathers the requirements it must satisfy.*

## Requirements cited

| SRD | Requirement |
| --- | --- |
| NFR-13 | The interface is operable by keyboard; every map action (dragging a track, drawing an annotation, measuring) has a keyboard or form-based equivalent; themes, including high contrast, are honoured. |

## Model

*Written so far for annotations; the rest of the map follows in Phase 3.*

| Map action | Without a pointer |
| --- | --- |
| Draw a line, area, circle, ellipse, label or marker | `Tab` to the map's *Draw an annotation* toolbar, `Enter` on a kind; the arrow keys pan the map under the cross in its middle, `Space` places a point there, `Enter` finishes, `Backspace` removes the last, `Escape` cancels. Or **Add annotation…** and type the positions ([annotations](annotations.md), items 1 to 6). |
| Drag a corner, centre, radius, axis or label | `Tab` to its handle; the arrow keys move it 5 pixels (25 with `Shift`); the run of presses is one step when they stop, on `Enter`, or when the keyboard moves on (presses made while it is saved follow as the next step); `Escape` puts it back. Or type the change on its properties form. |
| Add a corner between two | Arrow keys on the handle between them. |
| Remove a corner | `Delete` or `Backspace` on its handle. |
| Clear the selection | `Escape` on the map; or the outline, a native tree. |
| Pan, zoom | Arrow keys, and `+` and `-`, with the map focused. |

## Reference implementation

`vscode/webview/mapedit.ts` (keys while drawing and on handles) and `vscode/webview/drawing.ts`; the playground test `vscode/test/play/drawing.mjs` places a marker and changes an area from the keyboard alone.
