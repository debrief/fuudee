# Keyboard equivalents

How every map action can be done without a mouse.

*The model, its sequence diagram and its reference implementation are written in Phase 3. Version 0 gathers the requirements it must satisfy.*

## Requirements cited

| SRD | Requirement |
| --- | --- |
| NFR-13 | The interface is operable by keyboard; every map action (dragging a track, drawing an annotation, measuring) has a keyboard or form-based equivalent; themes, including high contrast, are honoured. |

## Model

*Written so far for annotations and for moving and rotating tracks; the rest of the map follows in Phase 3.*

| Map action | Without a pointer |
| --- | --- |
| Draw a line, area, circle, ellipse, label or marker | `Tab` to the map's *Draw an annotation* toolbar, `Enter` on a kind; the arrow keys pan the map under the cross in its middle, `Space` places a point there, `Enter` finishes, `Backspace` removes the last, `Escape` cancels. Or **Add annotation…** and type the positions ([annotations](annotations.md), items 1 to 6). |
| Drag a corner, centre, radius, axis or label | `Tab` to its handle; the arrow keys move it 5 pixels (25 with `Shift`); the run of presses is one step when they stop, on `Enter`, or when the keyboard moves on (presses made while it is saved follow as the next step); `Escape` puts it back. Or type the change on its properties form. |
| Add a corner between two | Arrow keys on the handle between them. |
| Remove a corner | `Delete` or `Backspace` on its handle. |
| Drag a track, or its fixes in the time window | `Tab` to the selected track's move handle; the arrow keys move it 5 pixels (25 with `Shift`), and the run of presses is one step, as for an annotation's handle. *Whole track* and *Time window* are buttons on the map. Or **Move track…** and type the distance and bearing ([track operations](track-operations.md), item 11). |
| Rotate a track | `Tab` to its rotate handle; `Right` and `Up` turn it 1° clockwise, `Left` and `Down` anticlockwise, 10° with `Shift`; one step for the run. The pivot handle moves with the arrow keys. Or **Rotate track…**, with the pivot and angle typed. |
| Split or merge tracks | **Split track at current time…** and **Merge selected tracks** on the outline's context menu (buttons under the outline in the playground); there is no map gesture for either. |
| Clear the selection | `Escape` on the map; or the outline, a native tree. |
| Pan, zoom | Arrow keys, and `+` and `-`, with the map focused. |

## Reference implementation

`vscode/webview/mapedit.ts` (keys while drawing and on handles) and `vscode/webview/drawing.ts`; `vscode/webview/trackmap.ts` and `vscode/webview/trackedit.ts` for a track's handles. The playground tests `vscode/test/play/drawing.mjs` and `vscode/test/play/tracks.mjs` place a marker, change an area, and move and rotate a track from the keyboard alone.
