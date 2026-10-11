---
date: 2026-10-11
authors: [ian]
categories: [Architecture]
slug: architecture
---

# How Debrief v4 fits together

Debrief v4 starts with foundations rather than features. Here is the shape everything else will hang from.

<!-- more -->

```mermaid
flowchart LR
    subgraph host["VS Code (or the web demo)"]
        ext["Debrief extension<br/>TypeScript"]
        views["Map, outline and tool panels<br/>webviews"]
        ext <--> views
    end

    subgraph python["Per-user Python services"]
        tools["Tool service<br/>MCP over REST"]
        kernel["Kernel<br/>time, units, geodesy, formatting"]
        tools --> kernel
    end

    subgraph disk["Your filesystem"]
        cat["STAC catalogue"]
        plot["Plots: GeoJSON<br/>with provenance inside"]
        src["Imported sources<br/>never modified"]
        cat --> plot
        cat --> src
    end

    schema["One schema in LinkML<br/>generates Python and TypeScript types"]

    ext -- "loopback only,<br/>per-session token" --> tools
    agent["AI agents"] -- MCP --> tools
    tools <--> cat
    ext <--> cat
    schema -.-> ext
    schema -.-> tools
```

A few choices shape everything:

- **Plots are plain files.** A plot is a GeoJSON FeatureCollection, catalogued with STAC and carrying its own provenance. Anyone can read it without Debrief, and access control is simply the folder's permissions.
- **Analysis lives in Python.** Every operation is a Python tool served over MCP, so the same tool serves the Debrief interface, an analyst's script and an AI agent. A scientist adds a tool by writing a Python file, without rebuilding Debrief.
- **One vocabulary.** Every type that crosses between Python and TypeScript is generated from a single LinkML schema, so the two sides cannot drift apart.
- **Everything is recorded.** Each change to a plot is recorded so it can be replayed, which is also how undo works.
- **The web demo runs the same tools.** In the browser, the Python tools run under Pyodide; nothing is sent to a server.

The first foundations are in place: the schema and its generated types, and a kernel for time, units, geodesic measurement and display formatting. Three early checks came back positive. The schema approach works end to end; the Python code runs unchanged in the browser; and asking the Python service for each Tote update takes a few milliseconds, well inside the 100 ms an analyst needs to drag the time slider smoothly.
