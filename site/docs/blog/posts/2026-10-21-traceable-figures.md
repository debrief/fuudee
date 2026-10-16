---
date: 2026-10-21
authors: [ian]
categories: [Capability]
slug: traceable-figures
---

# Traceable figures: every image knows where it came from

A figure in a post-exercise report is only as good as the analysis behind it. Months later, someone asks: which plot is this, and was it before or after the track was corrected? Debrief's exported images now answer that themselves. Each carries an ID naming its plot and the exact step of the plot's history it was exported at, in its metadata and, small, in its corner; and **Find source of image…** takes the image, or that ID typed in, back to the plot as it was then.

<!-- more -->

*The pictures come from the playground test, which plays the demo below in a browser, and from VS Code's own test, on the sample exercise, which is made up.*

## The map, as you see it

**Export image…** draws the map as the analyst sees it: tracks, labels, symbols and arrows at their intervals, annotations, the narrative box, current time's markers, the north arrow and the scale bar. It is written from the map as the map drew it, so labels are where the map placed them, kept clear of one another, not placed again by something else. The map's buttons, its key, handles and the selection's highlighting are left out: they are for working, not for a report.

Three sizes: as on screen, a 16:9 slide (1600 × 900) and A4 landscape (1754 × 1240, 150 dots an inch). For a slide or A4 the map is laid out at that size for a moment, so its labels are placed for it, then put back. The colours are the editor's, or light ones for print whatever the theme. PNG or SVG; no JPEG.

![A slide-sized PNG exported from Serial 1, in the playground's light colours: the exercise area, BLUE ONE and RED ONE with their direction arrows and current time's squares, the narrative box beside RED ONE, the scale bar bottom right, and the ID DBF- and twelve symbols small in the bottom-left corner](images/phase-3/export-01-slide.png)

## An ID in every image

Every image carries an ID like `DBF1-PTETVDX3-KG8RB9E5X7Y58R98-M6SC7N75-Z` in its metadata: a PNG's own text chunk and its XMP, an SVG's metadata. It names three things: the plot (by its catalogue and item, hashed: never its title), the plot's revision at the moment of export (the content hash its history records for that step), and the export itself. Nothing else goes into the image.

Word and PowerPoint often keep a picture's metadata, but not always: compressing pictures, or saving as PDF, drops it. So a short form of the ID, `DBF-PTET-KG8R-B9E9`, is drawn small in a corner, haloed so it reads on any colours, in whichever corner it covers least of the plot. It is on unless the analyst turns it off for an export. Twelve letters and digits, with no I, L, O or U to confuse, and a check: a mistyped one is caught, not looked up.

![The playground's Export image panel: Format PNG, Size Slide 1600 × 900, Colours As on screen, Image ID in a corner ticked, Export image…, and the note that the file Serial-1 DBF-… .png was exported, its ID in its metadata and its corner, and that the plot's export log has it](images/phase-3/export-02-panel.png)

Each export is recorded in the plot itself, in its export log: the ID, when, who, the area and time shown, the size and the file's name. The log is view state, like the time window, so an export is never a step in the plot's history: it changes neither the plot's revision nor anything that drew data from it.

## Back to the source

The plot moves on: a track recoloured, a fix corrected. The figure in the report still shows the plot as it was. **Find source of image…** takes the image file (or a Word or PowerPoint file, read picture by picture) or the ID typed from its corner, finds the plot in the analyst's catalogues and opens it at the step the image was exported at, rebuilt from its history and checked, as undo is, at the area and time exported. It is shown read-only: the map says so, every change is refused and said, and **Go to latest** returns to the plot as it is now.

![The plot shown as it was when the image was exported: the map's banner says The plot at step 1 of 2, as when image DBF-… was exported. Read-only, with Go to latest; BLUE ONE is blue again, though the plot has it teal now; History marks step 1 as shown read-only](images/phase-3/export-03-traced.png)

A plot that has since moved to another catalogue, or been sent to a colleague, is still found, by its revision, and said to be a copy.

## In VS Code

**Export image…** is on the map's title bar (the camera), the Outline's menu and the Command Palette: a size, what it shows (the ID in a corner, light colours), and where to save it. **Find source of image…** is on the Catalogues' menu: choose a file, or type the ID.

![VS Code: the map showing Serial 1 as it was when an image was exported, read-only, with the banner and Go to latest; the History view marks the step shown](images/phase-3/export-vscode-traced.png)

## For agents

`debrief/figure_id`, `debrief/export_image`, `debrief/find_image_source` and `debrief/open_revision` do the same for an agent. An agent has no map to draw with, so `debrief/export_image` stamps, writes and logs an image it gives: a chart it made, say.

## Try it

Export the map, change the plot (recolour a track), then choose the image you saved, or type its ID, under **Find source of image**:

<div class="debrief-demo" data-demo="?panels=export,history" data-height="760px" data-caption="Export image… saves the map with its ID. Change the plot, then find the image's source: the plot as it was, read-only. Everything runs in your browser."></div>

## Not yet

- **Agents draw no maps.** An agent stamps an image it has; drawing the map for an agent without a host's map is a question for the product owner.
- **A PDF of a report loses the metadata.** Its pictures are re-encoded; the footer is the trace there.
- **One view at a time.** Several views exported together come with the storyboard.
