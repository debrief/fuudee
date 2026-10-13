# Try Debrief

This is Debrief v4 running in your browser: the same map, tool forms and results panel as the VS Code extension, and the same Python catalogue, history, tools and importers. Nothing is installed, and nothing you do or import leaves your browser.

<div class="debrief-demo" data-demo=""></div>

## Things to try

- **Select and run a tool.** Click **BLUE ONE** in the outline, then Ctrl-click **RED ONE**. **Closest approach** is now on offer. Run it: the line appears on the map, the result opens beside it, and current time moves to the moment it found.
- **Look at a moment.** Drag **Current time** at the top of the side column. Each track's position at that time is a square in its colour.
- **Narrow the time window.** Drag either handle of **Time window**, or the band between them. The map shows the window as you drag: tracks are drawn in full within it and faintly outside it, and the tug's track, which ends at 10:35, loses its label once the window starts after that. Let go and the window is saved in the plot, but it's not a step in **History**, and **Undo** leaves it alone.
- **Play.** Press **▶**, or Space on any of the sliders. Choose a speed: at 60× a minute of the exercise passes each second. Playing stops at the end of the window.
- **A colleague changes the window.** **A colleague changes the time window**, under **Try**, changes it as if from another computer: Debrief shows theirs and says so.
- **Add an annotation.** **Add…** under *Annotation*, below the outline, opens a form for a line, area, circle, ellipse, label, marker or note. Type positions as you would write them (`37°00.000'N 075°30.000'W`), give a circle a radius and a colour, and press **Add**. Select it and press **Change…** to restyle it: each is one step in **History**. **North arrow** shows the chart's north arrow.
- **Draw on the map.** Choose **Area** on the map's toolbar, click each corner and double-click the last; the map says ranges, bearings and the area as you go. Name it in the form and press **Add**. Select it and drag a corner, or `Tab` to a handle and use the arrow keys: each change is one step in **History**.
- **Clean a track.** Select RED ONE and choose **Put GPS glitches into the selected track** under **Try**, then **Jumps…** under *Track*, below the outline: the jumps found are ringed on the map and listed, all ticked; untick any and **Remove** the rest as one step. **Smooth…** shows the track as smoothing would leave it before you apply it. **Fixes…** lists every fix: choose one (or right-click it on the map) to colour, label or comment on it.
- **Move a track.** Select BLUE ONE and drag the filled square: the map says how far and which way, along geodesics. Drag the ring to rotate it about the pivot. Choose **Time window** on the map to move only the fixes in the window, and watch the joins jump. Drag the diamond beside a track's last fix to shear it: the first fix stays put, and the map gives the new course and speed. Choose **Stretch** on the map to change only its speed. **Move…**, **Rotate…**, **Shear…**, **Stretch…**, **Split…** (at current time) and **Merge** are under *Track*, below the outline. Each is one step in **History**.
- **Read the narrative.** The **Timeline** lists the plot's notes in time order. Choose one and current time moves to it.
- **Undo.** Every change is a step in **History**. **Undo** replays the plot to the step before. Nothing is deleted: the undone step stays listed, and **Redo** brings it back.
- **Crash part-way through a save.** This stops a save after the new plot file is written but before it replaces the old one, as a power cut would. **Reopen the plot**: it is exactly as it was before that save, and Debrief says a save was interrupted.
- **Add a plot file.** Under **Import your own**, choose a Debrief plot file (`.geojson`), such as one a colleague sent you. Its whole history comes with it: undo, redo and going back to a step work on what they did.
- **Work alongside a colleague.** **A colleague changes the plot** shows what happens when someone else saves a change: Debrief shows the latest and tells you. **…while your next tool runs**, then run a tool: Debrief asks whether to combine the changes or save yours as a new plot. It never overwrites theirs.
- **Import your own file.** Choose a REP file or a legacy Debrief `.dpf` plot. It's read and imported in your browser, and everything that couldn't be imported is listed.

## Measuring on the real Earth

Drag two positions and compare the range and bearing Debrief v4 measures with what legacy Debrief gave:

<div class="debrief-demo" data-page="geodesic.html" data-height="560px" data-caption="Legacy figures use its FlatEarth model: mid-latitude sailing, 1° = 60 nmi. Runs in your browser; no Python needed."></div>

## How it works

The page plays the part of VS Code. Debrief's webviews run unchanged in frames, and Debrief's Python packages run under [Pyodide](https://pyodide.org) in a web worker, installed from the same wheels the desktop uses.

The sample exercise is copied into the browser's memory. Every change, undo and crash happens there, and is gone when you close the page.

The first start downloads Pyodide and its packages, about 16 MB, from the jsDelivr CDN (`cdn.jsdelivr.net`). Later visits use your browser's cache. If your network blocks the CDN, the map still works, and the page says that tools, history and import need Python.
