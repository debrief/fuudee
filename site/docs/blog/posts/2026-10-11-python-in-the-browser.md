---
date: 2026-10-11
authors: [ian]
categories: [Architecture]
slug: python-in-the-browser
---

# Debrief's Python, in your browser

The public demonstration of Debrief will run its Python analysis tools inside your web browser. We checked that it works before building on it.

<!-- more -->

Pyodide is Python compiled to run in a browser. We ran the same test under ordinary Python and under Pyodide and compared every answer: geodesic measurements, closest approach, formatted values and over eighty example files.

```mermaid
flowchart LR
    test["Same test script"] --> cp["Ordinary Python"]
    test --> pyo["Python in the browser<br/>(Pyodide)"]
    cp --> cmp{"Identical?"}
    pyo --> cmp
    cmp -- yes --> ok["Pass"]
```

The answers were identical. Calculations run about half as fast in the browser, and the demonstration needs a few seconds to start.

Half as fast is quick, but not always instant. In the demo below, *Closest approach* between two four-hour tracks of 241 fixes each takes about 1.5 seconds of Python in Chrome, against 0.8 seconds under ordinary Python on the same machine. From pressing **Run** to seeing the result takes about 2.5 seconds, because the plot is saved, with its history, and shown again. Building the demo halved that tool's time on every platform: it now works out the geodesic between each pair of fixes once, rather than at every step of its search.

This check now runs on every change. It also sets a rule for the future: any library a Debrief tool relies on must be able to run in the browser too, or the tool must say plainly that it is only available on the desktop.

Nothing in the demonstration leaves your browser, and it only ever holds unclassified sample data.

## Update: try it

The spike's promise is now a demo. The panel below runs Debrief's real Python tools, history and importers in your browser, under Pyodide, with the same map and forms as VS Code:

<div class="debrief-demo" data-demo=""></div>
