# Try Debrief

This is Debrief v4 running in your browser: the same map, tool forms and results panel as the VS Code extension, and the same Python catalogue, history, tools and importers. Nothing is installed, and nothing you do or import leaves your browser.

<div class="debrief-demo" data-demo=""></div>

## Things to try

- **Select and run a tool.** Click **BLUE ONE** in the outline, then Ctrl-click **RED ONE**. **Closest approach** is now on offer. Run it: the line appears on the map, the result opens beside it, and current time moves to the moment it found.
- **Look at a moment.** Drag the time control along the bottom of the map. Each track's position at that time is a square in its colour.
- **Undo.** Every change is a step in **History**. **Undo** replays the plot to the step before. Nothing is deleted: the undone step stays listed, and **Redo** brings it back.
- **Crash part-way through a save.** This stops a save after the step is written but before it's made current, as a power cut would. **Reopen the plot**: Debrief finishes the change and says so.
- **Work alongside a colleague.** **A colleague changes the plot** shows what happens when someone else saves a change: Debrief shows the latest and tells you. **…while your next tool runs**, then run a tool: Debrief asks whether to combine the changes or save yours as a new plot. It never overwrites theirs.
- **Import your own file.** Choose a REP file or a legacy Debrief `.dpf` plot. It's read and imported in your browser, and everything that couldn't be imported is listed.

## Measuring on the real Earth

Drag two positions and compare the range and bearing Debrief v4 measures with what legacy Debrief gave:

<div class="debrief-demo" data-page="geodesic.html" data-height="560px" data-caption="Runs in your browser; no Python needed."></div>

## How it works

The page plays the part of VS Code. Debrief's webviews run unchanged in frames, and Debrief's Python packages run under [Pyodide](https://pyodide.org) in a web worker, installed from the same wheels the desktop uses.

The sample exercise is copied into the browser's memory. Every change, undo and crash happens there, and is gone when you close the page.

The first start downloads Pyodide and its packages, about 30 MB, from the jsDelivr CDN. Later visits use your browser's cache.
