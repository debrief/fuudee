# Exported images

How an analyst exports the map as an image for a report or a slide, and how anyone holding that image, in a Word report or a PowerPoint deck months later, finds the plot it came from, as it was then.

## Requirements cited

| SRD | Requirement |
| --- | --- |
| SUB-25 | Images exported from Debrief carry an embedded GUID in their metadata linking back to their source. |
| EXT-05 | Report images: out, with embedded GUID metadata. |
| OUT-04 | Traceable figures in Word and PowerPoint: any exported image traces back to its source plot by GUID. |
| OUT-01 | Report figures produced without leaving Debrief. |
| SUB-19, SUB-21 | Every change is a recorded step; earlier states are reached by replay. |
| SUB-22 | View state in the island is neither undoable nor recorded. |
| SUB-30 | One map component in every host. |
| NFR-13 | Everything works from the keyboard, and by touch. |

## Model

1. **What is exported is what the analyst sees** (decision, product owner, 16 Oct 2026): the map drawn as it is drawn on screen, never redrawn another way. Tracks and their parts in the time window, context tracks, labels, symbols and arrows at their intervals, annotations and their labels, the narrative box beside its track, current time's markers, the Tote's lines, the north arrow and the scale bar, land and the graticule, and reference tiles. Labels are where the map placed them, kept clear of one another, because the image is written from the map as laid out. Not in it: the map's controls and key, its notes, the drawing toolbar, handles, fixes ringed to check, and the selection's outline and the dimming of everything else, which are for working, not for a report.
2. **Three sizes, two colours.** *As on screen* (the map's own size, twice over for sharpness), *Slide, 1600 × 900* (16:9, laid out at 1200 × 675 and scaled by 4/3 so its text reads at a slide's size) and *A4 landscape* (1754 × 1240, A4 at 150 dots an inch, laid out at 877 × 620 and doubled). For a size other than the screen's the map is laid out at that size for a moment, the same area fitted, so labels are placed and thinned for it, then put back exactly as it was. *As on screen* colours, or *Light, for print*: VS Code's Light Modern, whatever the editor's theme; data colours are the same in both.
3. **PNG or SVG; no JPEG** (decision, product owner, 16 Oct 2026). An SVG keeps every line and label as a vector, its text as text, reference tiles embedded as images. A PNG is that SVG drawn onto a canvas. The canvas only ever holds what Debrief wrote, so it is never *tainted* by another site's tile: a tile that cannot be read (another site's that does not allow it, or none offline) is left out, the export goes ahead, and the analyst is told how many were left out.
4. **Each image carries an ID** (decision, product owner, 16 Oct 2026) naming the plot, the exact revision exported (the plot's content hash, so the step on screen) and the export itself, so a figure traces to exactly what was on screen even after the plot is changed:

    | | Written | Where |
    | --- | --- | --- |
    | In full | `DBF1-PTETVDX3-KG8RB9E5X7Y58R98-M6SC7N75-Z` | The image's metadata: a PNG's iTXt chunk `debrief:figure` and its XMP (`dc:identifier`), before the image data; an SVG's `metadata` element, as XMP |
    | Short | `DBF-PTET-KG8R-B9E9` | The footer, and what an analyst types |

    In Crockford's base 32: digits and capital letters without I, L, O or U, so it reads aloud and types without confusion. In full: `DBF1`; the plot key, 8 symbols, the first 40 bits of the SHA-256 of the catalogue's own id and the item's id (as collation names items, never a title or a folder's name, so it means the same on every analyst's machine); the revision, 16 symbols, the first 80 bits of the plot's content hash; the export, 8 random symbols, so two exports of one view are two images; and a check symbol, Luhn mod 32 over the rest. The short form keeps 4 symbols of the plot key and 7 of the revision, with a check symbol of its own: enough to find the plot and the step among a catalogue's plots, and any one symbol mistyped is caught, never looked up. Typed, case, spaces and dashes do not matter, and O is read as 0, I and L as 1. Nothing else goes into the image: not the plot's title, its catalogue's name nor who exported it. Python and TypeScript hold the format to `schemas/vectors/figure-ids.json`.
5. **The footer** (decision, product owner, 16 Oct 2026): the short form, small (10.5 pixels at the map's scale), in the theme's quieter text colour and haloed in the background's, so it reads on any theme and over any track. It goes in the corner, of the four, where it covers least of the plot (the fewest points of its tracks, annotations and labels), beside, never over, the scale bar or the north arrow; bottom left where nothing is in the way. On by default, turned off for an export with **Image ID in a corner**. It is the backstop for an office program that drops an image's metadata.
6. **Each export is logged in the plot's island** (decision, product owner, 16 Oct 2026): its ID, the revision, when, who, the area exported (its viewport), current time and the time window, the format, size and colours, the file's name (not its folder) and whether it had the footer (`PlotView.exports`). View state: never a step, so an export changes neither the plot's revision nor any product that drew from it, and undo never takes one back. A plot in a read-only catalogue is exported, and the image traces by its ID, but its log is not written; the analyst is told.
7. **Find source of image.** Pick an image (Debrief reads its metadata: a PNG, an SVG, or each picture in a Word, PowerPoint or LibreOffice file) or type the ID from its footer. Debrief finds the plot in the analyst's catalogues, at the step whose revision the ID names, and opens it **read-only** as it was then: rebuilt by replay from its history and checked against the step that recorded it, as undo is, so it is exactly what was on screen. The view and the time come from the export log where it has the image; the map says *The plot at step 3 of 7, as when image DBF-PTET-KG8R-B9E9 was exported. Read-only.* with **Go to latest**. Nothing can be changed there: every change is refused, and said, until the analyst goes to the latest. The History shows the step as *shown read-only*. The Tote, worked out on the plot as it is now, is empty there.
8. **Copies.** A plot moved to another catalogue, or sent to a colleague, has another plot key but the same revisions: where no plot of the image's key has its revision, any plot that does is found, and said to be *a copy, with the same content then*. Several found are listed to choose from.
9. **An earlier revision exports as itself**: exported while shown read-only, an image's ID names that revision, so its short form is the same.

### What is a step, and what isn't

| | Where | Undoable | In the history |
| --- | --- | --- | --- |
| Exporting an image | The plot's island (`exports`: the export log) | No | No |
| Showing an earlier revision | Nowhere: the plot file is not changed | | |
| The image's ID | The image (metadata, footer) and the export log | | |

### In VS Code

- **Debrief: Export image…** (the camera on the map's title bar, the Outline's menu, the Command Palette) asks three things, each from the keyboard: the size (a list), what it shows (**Image ID in a corner** and **Light colours, for print**, ticked or not), and where to save it, as PNG or SVG by the name given. The choices are remembered for next time. A notification names the file and its ID, with **Copy ID** and **Show in folder**.
- **Debrief: Find source of image…** (Catalogues' title bar menu, the Command Palette): **Choose an image file…** or **Type the ID from the image's corner…**, the ID checked as it is typed. The plot opens read-only, at the view and time exported; **Go to latest** is on the map, its title bar and the History's.
- Agents and keyboard macros pass the choices and the file: `debrief.exportImage` with `{format, preset, theme, footer, file}`, `debrief.findImageSource` with `{file}` or `{id}`.

### In the playground

The **Export image** panel: **Format**, **Size**, **Colours** and **Image ID in a corner**, then **Export image…**, which hands the file to the browser to save. Below it, **Find source of image**: choose a file, or type the ID from its corner and press **Find** (or `Enter`). The plot is opened as it was, read-only, with **Go to latest** on the map; any plot found is also listed with **Open as exported**.

### For agents

`debrief/figure_id` gives a fresh ID for an export of a plot, at its current revision or an earlier one; `debrief/export_image` puts it into an image, writes the file and logs the export; `debrief/find_image_source` reads a file or a typed ID; `debrief/open_revision` gives the plot as it was at a revision. The map is drawn by a host, so an agent's `debrief/export_image` stamps, writes and logs an image it has.

### Keyboard and touch

| Where | Key or gesture | Does |
| --- | --- | --- |
| VS Code | **Export image…**: `↑` `↓` `Enter` on the size, `Space` to tick, `Enter`; the save dialog | Exports the map |
| VS Code | **Find source of image…**: `↑` `↓` `Enter`; the open dialog, or type the ID and `Enter` | Opens the plot as it was, read-only |
| The map, an earlier revision | `Tab` to **Go to latest**, `Enter`; tap | The plot as it is now |
| The playground's Export image panel | `Tab` through its lists, the tick box and **Export image…**; `Enter` in the ID box finds it | As VS Code |

There is no map gesture: exporting and tracing are commands and buttons, so they are the same from the keyboard, a mouse and a touch screen. The panel never scrolls sideways, down to 210 pixels and in a wider font.

```mermaid
sequenceDiagram
    actor Analyst
    participant Host as Extension host
    participant Map
    participant Service as Tool service
    participant Plot as Serial 1 (plot file)
    Analyst->>Host: Export image… (slide, footer, PNG)
    Host->>Service: debrief/figure_id
    Service-->>Host: DBF1-… and DBF-PTET-KG8R-B9E9 (revision now)
    Host->>Map: export_image (slide, footer text)
    Map-->>Host: image_rendered (PNG, viewport)
    Host->>Service: debrief/export_image (image, file, view, time)
    Service->>Plot: island: export log entry (no step)
    Service-->>Host: written, logged
    Note over Analyst: the figure goes into a report; the plot changes
    Analyst->>Host: Find source of image… (the PNG, or DBF-PTET-KG8R-B9E9)
    Host->>Service: debrief/find_image_source
    Service-->>Host: Serial 1, step 3 (now step 7), export log entry
    Host->>Service: debrief/open_revision
    Service-->>Host: the plot replayed to step 3, checked
    Host->>Map: show_plot (revision_shown), viewport and time exported
    Analyst->>Map: Go to latest
```

## Office programs (informative)

Tried on 16 Oct 2026, with a PNG exported from the sample (not a gate; Word and PowerPoint themselves were not available to try):

| Into | Then | The ID in the picture's metadata |
| --- | --- | --- |
| A `.docx` by python-docx | | Kept: the picture is stored byte for byte |
| A `.pptx` by python-pptx | | Kept: stored byte for byte |
| The `.docx` and `.pptx` | Saved again by LibreOffice 7 as `.docx`, `.pptx` and `.odt` | Kept |
| The `.docx` | Saved as PDF by LibreOffice | Gone: the picture is re-encoded |

Word's *Compress pictures* and saving as PDF re-encode a picture and drop its metadata: then the footer is the trace, typed into **Find source of image…**. **Find source of image…** reads a Word, PowerPoint or LibreOffice file picture by picture, so a whole report can be checked at once.

## Performance

Measured in the playground's test on 16 Oct 2026 (headless Chromium, the sample's serial 1), from **Export image…** to the file handed to the browser, Python under Pyodide minting, stamping and logging: a slide's PNG in 540 to 720 ms, A4 landscape in light colours in about 430 ms, a PNG as on screen in about 350 ms, an SVG as on screen in about 250 ms. The map is laid out at the image's size and put back within a few frames; the analyst sees *Preparing the image…*. Finding a plot by an image reads the item ids of each catalogue and only the plots whose key matches; a copy, found by its revision alone, reads every plot's history once.

## Reference implementation

- **The ID, stamping, reading and finding:** `python/debrief-stac/src/debrief_stac/figures.py` (`new_figure_id`, `parse_figure_id`, `stamp_png`, `stamp_svg`, `figure_ids_in`, `figure_for`, `prepare_export`, `log_export`, `find_sources`); `Catalogue.record_export` and `Catalogue.revision_shown`, `History.revisions` and `History.replay_checked`. Tested in `python/debrief-stac/tests/test_figures.py`, held to `schemas/vectors/figure-ids.json`; TypeScript reads the same format in `ts/kernel/src/figureid.ts`, tested in `ts/kernel/test/figureid.test.ts`.
- **The service:** `python/debrief-tools/src/debrief_tools/figures.py`; tested in `python/debrief-tools/tests/test_figures_service.py`.
- **Drawing the image:** `vscode/webview/exportimage.ts` (`composeSvg`, `readTiles`, `rasterise`) and `exportImage` in `vscode/webview/map.ts`; sizes, the footer's corner and text in `vscode/webview/exportlogic.ts`, tested in `vscode/test/unit/export.test.ts`.
- **VS Code:** `debrief.exportImage`, `debrief.findImageSource` and `debrief.openLatestRevision` in `vscode/src/extension.ts`, `renderImage` in `vscode/src/panels/map.ts`, the wording in `vscode/src/figures.ts`; read-only changes refused in `ToolService.guard`. Played in `vscode/test/integration/suite.ts` (`exportedImages`).
- **The playground:** the Export image panel in `vscode/play/host.ts`, `figure_id`, `export_image`, `find_image_source` and `open_revision` in `vscode/play/play.py`; played in `vscode/test/play/export.mjs`.
- **Schema:** 0.0.22: `figures.yaml` (`FigureId`, `ShortFigureId`, `ImageExport`, `ImageRequest`, `RenderedImage`, `RevisionShown`, `FigureSource`), `PlotView.exports`; messages `export_image`, `image_rendered`, `latest_asked`, and `revision_shown` on `show_plot`.

*Not yet:* a map drawn for an agent without a host's map; exporting several views at once (the storyboard, CAP-13, will); a choice of corner for the footer; reading an image's ID out of a PDF a report was saved as (its picture re-encoded: the footer is the trace).
