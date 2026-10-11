# Tool-author guide

**North Star:** a scientist's first tool should take an afternoon.

This guide is for scientists writing their own analysis tools (DEV-09, OUT-06). A tool is a Python function with a declaration. Debrief builds its form from the declaration and offers it whenever it applies, without being rebuilt (TL-05, NFR-08).

*This is the Phase 1 draft, written from the team's first four tools in `python/debrief-tools/src/debrief_tools/core.py`, which are worth reading alongside it. In Phase 5 a scientist will test the guide by building a real tool.*

## A whole tool

```python
from debrief_schemas import models
from debrief_tools import ToolContext, tool


@tool(
    name="lab.fix_count",
    version="0.1.0",
    title="Fix count",
    explanation="Counts the fixes in each selected track.",
    applies_to=["track"],
    min_selected=1,
    outputs=["non_spatial"],
)
def fix_count(context: ToolContext) -> models.ToolResult:
    names = [t.properties.name for t in context.selection]
    counts = [len(t.properties.times) for t in context.selection]
    return models.ToolResult(
        non_spatial=[
            models.NonSpatialResult(
                title="Fix count",
                presentation="table",
                columns=[
                    models.ResultColumn(name="Track", strings=names),
                    models.ResultColumn(name="Fixes", numbers=counts),
                ],
            )
        ]
    )
```

That's all a tool needs. Put it in a module and register the module (see [Making Debrief find your tools](#making-debrief-find-your-tools)). It then appears whenever an analyst selects one or more tracks.

## The declaration

The declaration is what Debrief, the analyst and any agent see (TL-04, TL-06). Its schema is `ToolDeclaration` in `schemas/linkml/tools.yaml`. Debrief checks it when your library loads.

| Field | What to write |
| --- | --- |
| `name` | Dotted and unique: your library's prefix, then the tool, such as `lab.fix_count` |
| `version` | Raise it when results would change. Provenance records it, so a plot says which version made each change (SUB-24). |
| `title` | What the analyst sees in the tool list. Sentence case, no full stop. |
| `explanation` | One or two sentences on what the tool does, shown on its form (CAP-24). Say what it does, not how. |
| `judgement` | Any judgement the result involves, and what to check afterwards. Leave it out if there's none. |
| `applies_to` | The feature kinds it works on: `track`, `annotation`, `sensor_observations`, or `*` for any |
| `min_selected`, `max_selected` | How many selected features it needs. Use `min_selected: 0` for a tool that needs no selection. |
| `parameters` | The settings on its form (see below) |
| `outputs` | What it may return: `new_features`, `modified_features`, `deleted_features`, `non_spatial`, `named_sets`, `state_change` |

Write the explanation and the judgement for an analyst, following the [language section](../style-guide/language.md) of the style guide: glossary terms, British English, no software jargon. "Draws rings at equal ranges around a track's position" is right; "Generates buffer polygons" is not.

### Which tools are offered

Debrief offers a tool only when every selected feature is a kind it applies to, and the number selected is within its limits (TL-08). An analyst who selects two tracks sees **Closest approach**. An analyst who selects a track and an annotation does not.

If a tool names a kind Debrief doesn't know, Debrief doesn't offer it, and says why in the tools list (TL-09). If your library fails to import, its tools are listed as unavailable with the error, and every other library still loads (TL-03).

## Parameters

Each parameter becomes a field on the form (TL-07). Debrief checks the value before your tool runs, so your tool never sees a missing or out-of-range value.

| `kind` | Form field | Your tool receives |
| --- | --- | --- |
| `number`, `integer` | Number box | `float` or `int` |
| `string` | Text box | `str` |
| `boolean` | Checkbox | `bool` |
| `choice` | Drop-down of `choices` | `str` |
| `quantity` | Number with a unit picker, for a `quantity_kind` of `length`, `speed`, `angle` or `duration` | A kernel `Quantity`; convert it with `.to("m")` |
| `time` | UTC time | Epoch milliseconds (`int`) |

- **Defaults.** Give one wherever there's a sensible value; it fills the form.
- **Optional parameters.** Mark one optional with `required: false`. It reaches your tool as `None` when left empty.
- **Limits.** `minimum` and `maximum` are in the default's unit for a quantity.

Every value is recorded in provenance, so a replay can repeat the run (SUB-19).

```python
{
    "name": "spacing",
    "title": "Spacing",
    "explanation": "Range between one ring and the next.",
    "kind": "quantity",
    "quantity_kind": "length",
    "default": {"value": 2.0, "unit": "[nmi_i]"},
    "minimum": 0.1,
    "maximum": 100.0,
}
```

## Debrief data types

Your tool receives Debrief's own types (TL-09), generated from the schema. Each selected feature is one of:

- **Track**: `properties.times` (UTC strings), `geometry.coordinates` (longitude, latitude), and optionally `speeds`, `courses` and `depths`. Each of these carries its unit, so convert it rather than assume it. `debrief_kernel.geodesy.TrackPath.from_feature(track)` gives positions at any time.
- **Annotation**: a point, line or polygon, or no geometry for a note or a period.
- **Sensor observations**: bearings and their payload.

**Use the kernel for geometry.** `debrief_kernel.geodesy` gives range, bearing, destination and closest approach along geodesics on WGS84 (SUB-03). Don't write your own flat-earth arithmetic: Debrief's figures must agree everywhere.

## Results

Return a `models.ToolResult` holding any of:

- **New features.** Give each a fresh id with `context.new_id("prefix")`.
- **Changed features.** Same id, new content.
- **Deleted feature ids.**
- **Non-spatial results.** A number, a table or a graph, held column by column. Give a column with a quantity its `quantity_kind` and `unit`, so Debrief can show it in the analyst's chosen units (SUB-04).
- **Named sets.**

What happens next:

1. Debrief checks the result before anything is saved. A result that isn't valid fails the run and leaves the plot unchanged.
2. A result that changes features is saved with one provenance record, naming your tool, its version, the selection and the parameter values (SUB-18).
3. A result that is only a number, table or graph changes nothing, so nothing is recorded.

**Don't change `context.plot`.** It's a copy, so changing it has no effect. Return your changes instead.

## When something is wrong

Raise an exception with a message the analyst can act on:

```python
raise ValueError(f"{a.properties.name} and {b.properties.name} do not overlap in time")
```

The analyst sees "Closest approach failed: NELSON and LATE do not overlap in time". The plot is unchanged, and Debrief and every other tool carry on (TL-03).

## Randomness

If your tool uses random numbers, set `uses_randomness: true`. Debrief then records the seed so the run can be replayed (SUB-20). *This arrives with replay in Phase 2.*

## Running in the browser

The web build runs tools in the browser under Pyodide (CON-09). Use the Python standard library, the Debrief kernel, and libraries that Pyodide provides, such as numpy and pyproj. Don't read or write files, and don't use the network. Debrief passes your tool everything it needs.

CI runs the core tools under both CPython and Pyodide and requires identical results (`spikes/pyodide`).

## Making Debrief find your tools

Register your module under the `debrief.tools` entry point in your package's `pyproject.toml`:

```toml
[project.entry-points."debrief.tools"]
lab = "lab_tools"
```

Install the package into Debrief's Python environment and restart the tool service. While you're developing, you can skip packaging and name the module directly:

```bash
python -m debrief_tools list --library lab_tools    # check your declarations load
python -m debrief_tools serve --library lab_tools   # serve them alongside the core tools
```

## Testing your tool

A tool is a plain function, so test it directly. Build a `ToolContext` from a plot, and use `debrief_tools.bind` to check parameters the way Debrief does:

```python
from debrief_tools import ToolContext, bind

values, _ = bind(fix_count.debrief_tool.declaration, {})
result = fix_count(ToolContext(plot=plot, selection=plot.features[:2], parameters=values))
```

`python/debrief-tools/tests/test_run.py` shows tools run end to end against a catalogue.
