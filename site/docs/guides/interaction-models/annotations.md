# Annotations

How an analyst adds a line, area, circle, ellipse, label, marker or note to a plot, changes how it looks and when it is shown, deletes it, and finds notes by time. Part A: everything through forms. Part B: drawing annotations on the map, and changing them there by dragging handles or with the keyboard.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| CAP-03 | Annotations (shapes, labels, chart furniture) are ordinary GeoJSON features, with provenance, export and tool support. |
| CAP-04 | An annotation with only a time has no geometry. |
| CAP-05 | A temporal view shows narrative entries and time-only annotations. |
| SUB-19, SUB-21 | Every change is a recorded step; undo is replay to a point. |
| SUB-22 | Content, how features are styled included, is recorded and undoable. |
| SUB-04 | Positions, ranges, bearings and times are read and shown in the analyst's notation and units. |
| CAP-28 | An annotation with a time or a period is drawn only while it falls in the time window. |
| EXT-14, EXT-15 | Legacy plots' annotations come in as far as the data model allows; what doesn't is listed. |
| NFR-13 | Every map action, drawing an annotation included, has a keyboard or form-based equivalent. |
| SUB-26, SUB-28 | Drawing changes neither current time, the window nor the selection; a change made elsewhere is never overwritten. |

## Model

1. **Seven kinds, one form.** **Add annotation…** (the **+** on the Outline view's title bar, or on the Timeline's; **Add annotation…** under the outline in the playground) opens the annotation form beside the map. Its **Kind** is one of:

    | Kind | Is | Positions |
    | --- | --- | --- |
    | Line | a line through two or more positions, drawn along geodesics | one per line |
    | Area | a closed area with three or more corners | one per line |
    | Circle | every position at one range from a centre | the centre, and a radius with its unit |
    | Ellipse | an ellipse about a centre | the centre; semi-major and semi-minor axes with their unit; the longer axis's orientation in degrees true |
    | Label | text at a position | one |
    | Marker | a marked position | one |
    | Note | text at a time, with no position | none: it needs a time |

    A new annotation starts as a circle in the middle of the map, with nothing else filled in. The word *shape* is not used in the interface: shapes are kinds of annotation (style guide, language).

2. **Positions in the analyst's notation.** A position may be typed as Debrief writes it (`50°20.120'N 004°07.210'W`), in degrees, minutes and seconds, in decimal degrees, without the symbols (`50 20.12 N 4 7.21 W`), with the hemisphere first (`N50 20.12 W4 7.21`), or as two signed decimals, latitude first (`50.335, -4.120`). Under each, the form says what it understood (*Means 50°20.120'N 004°07.210'W*) or what is wrong with it. The same reading runs in Python and TypeScript, held to shared test vectors (`schemas/vectors/positions.json`), and agents may send positions as text too.

3. **Sizes in their units.** A radius or semi-axes is a number and a unit: nautical miles, yards, metres or kilometres. The unit is kept with the value (SUB-02), so a circle of 2 nmi stays 2 nmi when the analyst's display unit is yards. A radius or semi-axis is at most 10,000 km: beyond about half the world, a circle drawn along geodesics folds back on itself. Orientation is degrees true, clockwise from north; 405 is read as 045.

4. **Time.** **No time** (always shown), **At a time** or **Over a period**. Times are typed as for a tool's time fields (`09:30Z`, `15 Jun 2023 09:30:00Z`, `150930Z JUN 23`), with what was understood said beneath; a new annotation's time starts at current time. With a time or a period, it is drawn only while that falls in the time window (CAP-28). A note always has a time.

5. **Style.** Colour (the annotation amber, a track colour by name, or any colour as `#rrggbb`, its swatch beside the list); line solid, dashed or dotted, and its width in pixels; for areas, circles and ellipses a fill colour and how opaque it is; the label's size in pixels and where it goes (above, below, left, right, centre, or not shown). An area's, a circle's or an ellipse's label is hidden while the shape is too small on screen to carry it: under 70 pixels across where Debrief placed the label, or under 24 where the analyst (or a legacy plot) chose its place. Anything left at its default is drawn as Debrief draws annotations: amber, dashed, an area faintly tinted, so nothing a tool draws is mistaken for a track. An annotation drawn solid still has no direction ticks or end dots, and is still labelled. Style is content: changing it is a step (decision, 12 Oct 2026).

6. **Checked as typed, saved as one step.** Each field says what is wrong beside it once the analyst has tried to save; nothing is sent until every field is right. **Add** (or **Save changes**) sends the description to the tool service, which checks it again, makes the annotation and records it as **one step**, named in the History view: *Circle 'Exclusion zone' added*, *Style of Circle 'Exclusion zone' changed*, *Time of …*, *… renamed …*, *Circle 'Exclusion zone' changed* (anything else, or several at once). Saving changes that change nothing records nothing: a field left as it was shown keeps its exact value, even where the form shows it rounded (a position to a thousandth of a minute, a time to the second). A field emptied is cleared: text, time and style go back to none. `Ctrl+Z` undoes it like any step.

7. **Changing one.** Its properties form opens from the outline's context menu (**Change annotation…**), from **Change…** in the playground, or by double-clicking it on the map. It shows everything the annotation is, in the same fields; its kind stays as it is. A change made elsewhere since the plot was opened is never overwritten: Debrief shows the latest and says nothing was changed (SUB-28).

8. **Deleting.** **Delete** on its form, **Delete annotation** on the outline's context menu (several at once, as one step), or **Delete** in the playground. Named sets keep their other members; a set left empty goes too. Undo brings everything back.

9. **Chart furniture.** The scale bar is always drawn, in the analyst's distance unit. The north arrow is chart furniture the plot carries: **North arrow** on the Outline view's **...** menu (checked when shown), or the **North arrow** button in the playground, adds or removes it as a step. The map is Web Mercator, north up everywhere, so the arrow points up. Grids, legends and other furniture are not done.

10. **The Timeline (CAP-05).** A view below the outline lists the plot's time-only annotations, such as narrative notes and periods of interest, in time order: each entry its time (or period), name and first line of text. The entry current time is at, the last to start at or before it, is marked; in VS Code the view keeps it in sight as current time moves, so a narrative can be read along with a replay. Choosing an entry (click, or Enter) moves current time to it, or to its start. If that is outside the window shown, the window widens or moves to take it in, shown but never saved, exactly as for a tool's time, with **Keep** and **Revert** on the time controller (CAP-28). It is a native tree in VS Code, read by screen readers and used from the keyboard like any view; in the playground, a list of buttons, the current one marked for screen readers as well as by sight.

11. **What is a step, and what isn't.**

    | | Step in the history | Undone by `Ctrl+Z` |
    | --- | --- | --- |
    | Adding, changing, restyling, deleting an annotation | Yes, one each | Yes |
    | Drawing on the map: placing points, cancelling | No: the step is **Add** on the form that follows | No |
    | Letting go of a handle, or a run of arrow keys on one | Yes, one each | Yes |
    | Showing or removing the north arrow | Yes | Yes |
    | Hiding an annotation on the map | Yes (as for any feature) | Yes |
    | Choosing a Timeline entry (current time), opening a form | No | No |

12. **Drawing on the map.** The map has a toolbar, *Draw an annotation*, below the zoom buttons: **Line**, **Area**, **Circle**, **Ellipse**, **Label**, **Marker** and **Cancel**. Choosing a kind starts drawing it: the button shows pressed, the map gets a focus outline and a cross for a pointer, and a note at the top of the map says what to do next and what has been drawn so far. Choosing the pressed kind again, **Cancel** or `Escape` stops and keeps nothing; `Backspace` removes the last point placed.

    | Kind | Draw it by | The map says |
    | --- | --- | --- |
    | Line | clicking each position; double-click or `Enter` finishes | positions placed, the leg to the pointer, range and bearing from the start, length |
    | Area | clicking each corner; double-click or `Enter` finishes | corners placed, the leg, range and bearing from the start, the area |
    | Circle | clicking the centre, then the radius; or dragging from the centre | radius, its bearing, the area |
    | Ellipse | clicking the centre, the end of the longer axis (which sets the orientation), then the side (the width); or dragging from the centre to the axis end | semi-major, semi-minor, orientation, the area |
    | Label, marker | one click | the position |

    Ranges and bearings are along geodesics and in the analyst's units and notation (`4.25 nmi 045.0°T`); an area is in the square of the length unit (`12.30 nmi²`). A double-click places one point, not two. A line needs two different positions and an area three; finishing too soon says so and keeps drawing. A circle's radius and an ellipse's axes are kept in the analyst's length unit, to the decimals the map showed, so what is saved is what was read; an ellipse's side can never make the shorter axis the longer. While drawing, a click on a track places a point there; `Ctrl` or `Cmd` click still selects. Drawing never changes current time, the window or the selection.

13. **Finishing opens the form.** A finished drawing opens the annotation form (**Add annotation**), with its kind, positions and size filled in, at the name. The analyst names it, gives it a time or a style if they want, and **Add** saves it as **one step** (*Area 'Patrol box' added*); **Cancel** (or closing the form) keeps nothing, and the dashed drawing leaves the map. Until then nothing is in the plot. *Why the form, rather than adding at once with a made-up name:* adding at once and then naming it would be two steps for one annotation, and Undo would take away only the name; a made-up name ("Area 1") would end up in plots. With the form, each finished annotation is one undoable step with the analyst's own name, and Cancel leaves no trace in the history.

14. **Changing it on the map.** An annotation selected on its own, and drawn on the map now, shows handles in the theme's focus colour, and the note at the top says how to use them:

    | Kind | Handles |
    | --- | --- |
    | Line, area | one at each position or corner; a smaller, dashed one between each pair (an area's closing side too); a filled one in the middle that moves it all |
    | Circle | its centre (moves it); its radius |
    | Ellipse | its centre (moves it); the end of its longer axis (length and orientation); its side (width) |
    | Label, marker | its position |

    Dragging a handle changes the annotation as the pointer moves, saying what it now measures; letting go saves the change as **one step**, named for what was done: *Circle 'Keep clear' moved*, *Circle 'Keep clear' resized*, *Area 'Patrol box' reshaped* (a corner moved, added or removed, or an ellipse's axes), *Area 'Patrol box' moved* (all of it). `Escape` during a drag puts it back, and nothing is recorded. Dragging a between-handle adds a corner (or position) there. Moving a whole line or area moves every corner by the same change of latitude and longitude, as a parallel rule would on a chart. Sizes keep their own units: a circle of 4 km stays in km.

15. **The keyboard.** Every drawing and every change can be made without a pointer:

    - *Drawing:* `Tab` to the toolbar and press `Enter` on a kind; the keyboard goes to the map, which shows a cross in its middle. The arrow keys pan the map under the cross (as they always do), `Space` places a point at the cross, `Enter` finishes, `Backspace` removes the last point, `Escape` cancels.
    - *Changing:* `Tab` to a handle (each is named for a screen reader: *Area 'Patrol box': corner 2 of 4; drag it, or use the arrow keys; Delete removes it*). The arrow keys move it 5 pixels, 25 with `Shift`; a run of presses is saved as one step once they stop (under a second), on `Enter`, or when the keyboard moves on; `Escape` first puts it back. Arrow keys on a between-handle add a corner there. `Delete` or `Backspace` on a corner removes it, unless that would leave an area fewer than three corners or a line fewer than two, which the map says.
    - *Exactly:* the properties form (item 7) changes any position or size by typing it, as before.

16. **Shared state and conflicts.** Drawing and editing change neither current time, the time window nor the selection; tracks stay selectable with `Ctrl` or `Cmd` click. If the plot changes elsewhere during a drag (a colleague, an agent), the map shows the latest at once, drops the drag and says *The plot was changed elsewhere, so your change was not made. Debrief is showing the latest; try again if you still want to.* A change sent from a plot that has since moved on is refused the same way (SUB-28). A change the service refuses for any other reason is said in a notification, and the map shows the annotation as it is.

17. **For agents.** The same steps through the tool service: `debrief/add_annotation` (`annotation`: the description the form sends, positions as numbers or text), `debrief/edit_annotation` (`feature`, and `annotation` with only what changes, so `{"appearance": {...}}` restyles; a member given as `null` is cleared, and a time given replaces a period, or a period a time; the north arrow has nothing to change), `debrief/delete_annotations` (`features`) and `debrief/set_north_arrow` (`shown`), each with `base` as for any change. In VS Code the commands `debrief.addAnnotation`, `debrief.editAnnotation`, `debrief.deleteAnnotation`, `debrief.toggleNorthArrow` and `debrief.goToTime` take the same arguments instead of opening the form.

```mermaid
sequenceDiagram
    actor Analyst
    participant Map
    participant Form as Annotation form
    participant Host as Extension host
    participant Service as Tool service
    Analyst->>Map: Area; click each corner; double-click
    Map->>Map: sketch, with range, bearing and area as it goes
    Map->>Host: annotation_drawn (corners, name empty)
    Host->>Form: show_annotation_form (the drawing)
    Analyst->>Form: name it; Add
    Form->>Host: save_annotation
    Host->>Service: debrief/add_annotation (one step)
    Host->>Map: show_plot (it is selected: handles)
    Analyst->>Map: drag a corner, let go
    Map->>Host: edit_annotation (feature_id, the whole description, changed)
    Host->>Service: debrief/edit_annotation (base)
    alt changed elsewhere since base
        Service-->>Host: CONFLICT
        Host->>Map: show_plot (the latest); nothing was changed
    else
        Service-->>Host: one step: "Area 'Patrol box' reshaped"
        Host->>Map: show_plot
    end
```

```mermaid
sequenceDiagram
    actor Analyst
    participant Form as Annotation form
    participant Host as Extension host
    participant Service as Tool service
    participant Plot as Plot file
    Analyst->>Form: kind, name, centre, radius, style, time
    Form->>Form: read positions and times; say what they mean or what is wrong
    Analyst->>Form: Add
    Form->>Host: save_annotation (the description)
    Host->>Service: debrief/add_annotation (description, base)
    alt changed elsewhere since base
        Service-->>Host: CONFLICT
        Host->>Analyst: nothing was changed; showing the latest
    else
        Service->>Service: check it; make the feature (a circle: its polygon along geodesics)
        Service->>Plot: one step: "Circle 'Exclusion zone' added"
        Service-->>Host: new base, the feature's id
        Host->>Host: reload: map, outline, Timeline, History
    end
```

## How circles and ellipses are kept

GeoJSON has no curves. A circle or an ellipse is kept as a **polygon of 72 sides** approximating it, built along geodesics, as its geometry, so that any other GeoJSON tool draws the area it covers and a plot's extent includes it, plus **its own properties**: `shape` (`circle` or `ellipse`), `centre`, and `radius`, or `semi_major`, `semi_minor` and `orientation`, each with its unit. Debrief draws and edits it from those, along geodesics and smooth at any zoom, never from the polygon; every change makes the polygon again, and a rule checked on reading refuses a polygon that no longer matches its centre and size. A point with a radius would have been smaller, but other tools would see only a point, and a plot's extent would leave the circle out.

## Reference implementation

- **Schema (0.0.12):** `AnnotationProperties` (`shape`, `centre`, `radius`, `semi_major`, `semi_minor`, `orientation`, `furniture`, `appearance`), `AnnotationAppearance` and `AnnotationSpec` in `schemas/linkml/features.yaml`; the rules in `debrief_schemas.documents` (`_annotation_problems`); fixtures `plot/valid/annotations-every-shape.json` and the `circle-*`, `ellipse-*`, `line-*`, `chart-furniture-*` and `annotation-*` invalid ones.
- **Kernel:** `debrief_kernel.geodesy.circle_ring` and `ellipse_ring`; `debrief_kernel.formatting.parse_position` and its TypeScript twin `parsePosition` (`ts/kernel/src/positions.ts`).
- **Making and naming changes:** `debrief_stac.annotations` (`build`, `spec_of`, `describe_change`); `Catalogue.add_annotation`, `edit_annotation`, `delete_annotations`, `set_north_arrow`; the service methods in `debrief_tools.service`.
- **Drawing and editing on the map:** what each click, drag and key makes, the readouts and the handles in `vscode/webview/drawing.ts` (free of Leaflet, unit-tested); the toolbar, sketch, handles, dragging and nudging in `vscode/webview/mapedit.ts`; `rangeBearing`, `travel` and `geodesicArea` in `vscode/webview/geodesic.ts`; the messages `annotation_drawn` and `edit_annotation` with `annotation` (schema 0.0.13); the host side in `vscode/src/panels/map.ts` (`receive`) and the command `debrief.addDrawnAnnotation`; the step names in `debrief_stac.annotations.describe_change`.
- **VS Code:** the form `vscode/webview/annotationform.tsx`, its reading of fields `vscode/webview/annotationdraft.ts`; the panel `vscode/src/panels/annotation.ts`; drawing `vscode/webview/annotationlook.ts` and `drawAnnotation` in `vscode/webview/map.ts`; the Timeline `vscode/src/timeline.ts` and `vscode/src/views/timeline.ts`; commands in `vscode/src/extension.ts`.
- **The playground:** `vscode/play/host.ts` (the annotation form frame, the Timeline, the buttons) and `annotate` in `vscode/play/play.py`.
- **Legacy plots:** `debrief_io.dpf` (`_read_look`) and `debrief_io.dpf_import` (`_curve`, `_appearance`, `_look_notes`).
- **Tests:** `python/debrief-stac/tests/test_annotations.py`, the service test, `vscode/test/unit/annotations.test.ts` and `vscode/test/unit/drawing.test.ts`, the playground test's `vscode/test/play/annotations.mjs` and `vscode/test/play/drawing.mjs` (drawing by pointer and keyboard, dragging, nudging, a colleague's change during a drag), and the integration test's annotation and drawing steps.

*Not yet:* snapping to tracks, fixes or other annotations; rotating a whole line or area; arrowheads; label symbols; grids and other chart furniture; changing an annotation's kind.
