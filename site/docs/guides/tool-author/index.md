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
| `quantity` | Number with a unit picker, for a `quantity_kind` of `length`, `speed`, `angle`, `duration` or `angular_rate` | A kernel `Quantity`. `.to("m")` gives another `Quantity`; `.to("m").value` gives the number. |
| `time` | UTC time | Epoch milliseconds (`int`) |

Units are written as UCUM codes, the same everywhere in Debrief:

| Kind | Units |
| --- | --- |
| `length` | `m`, `km`, `[nmi_i]` (nautical miles), `[yd_i]`, `[ft_i]` |
| `speed` | `m/s`, `[kn_i]` (knots), `km/h` |
| `angle` | `deg`, `rad` |
| `duration` | `ms`, `s`, `min`, `h` |
| `angular_rate` | `deg/min` (the analysts' standard for bearing rate), `deg/s`, `rad/s` |

A range rate is a speed. A bearing rate is an `angular_rate`, shown in degrees per minute: `1.2°/min`. In the kernel, an angle divided by a duration gives one: `angle(3) / duration(2, "min")` is 1.5°/min.

- **Defaults.** Give one wherever there's a sensible value; it fills the form.
- **Optional parameters.** Mark one optional with `required: false`. It reaches your tool as `None` when left empty.
- **Times.** A `time` has no sensible fixed default. Make it optional and choose a time in the tool when it's `None`, as `core.range_rings` does with the start of the track.
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
- **Sensor observations**: `sensor_name`, `host_track_id`, `observation_type` (such as `bearing`), `time_range`, `observation_count`, and a `payload` describing the file that holds the observations. *Tools can't yet read the observations themselves; that arrives with the sensor work in Phase 4.*

**Use the kernel for geometry.** It gives range, bearing, destination and closest approach along geodesics on WGS84 (SUB-03). Don't write your own flat-earth arithmetic: Debrief's figures must agree everywhere.

| Call | Gives |
| --- | --- |
| `TrackPath.from_feature(track)` | A path with `.times_ms`, `.positions`, `.start_ms`, `.end_ms` |
| `path.position_at(time_ms)` | A `Position(longitude, latitude)`, or `None` outside the track |
| `range_bearing(a, b)` | `(range, bearing)` as two `Quantity`s, metres and degrees true |
| `range_between(a, b)` | Range as a `Quantity` |
| `destination(position, bearing, distance)` | The `Position` reached; bearing and distance are `Quantity`s |
| `closest_approach(path_a, path_b)` | `.time_ms`, `.range`, `.position_a`, `.position_b`, or `None` if the tracks never overlap |
| `series_values(track.properties.speeds, "[kn_i]")` | A speed or course series as plain numbers in the unit you ask for |
| `parse_utc(text)`, `format_utc(ms)` | UTC strings to epoch milliseconds and back |
| `length(5, "[nmi_i]")`, `speed(...)`, `angle(...)`, `duration(...)`, `angular_rate(...)` | A `Quantity` |

The geometry calls are in `debrief_kernel.geodesy`, the time calls in `debrief_kernel.time`, and the quantity calls in `debrief_kernel.units`. For thousands of points, `debrief_kernel.geodesy_arrays` does the same over numpy arrays, about fifty times faster.

## Results

Return a `models.ToolResult` holding any of:

- **New features.** Give each a fresh id with `context.new_id("prefix")`.
- **Changed features.** Same id, new content.
- **Deleted feature ids.**
- **Non-spatial results.** A number, a table or a graph, held column by column. Give a column with a quantity its `quantity_kind` and `unit`, so Debrief can show it in the analyst's chosen units (SUB-04).
- **Named sets.**
- **A change to shared state** (`state_change`): current time, selection or viewport. Declare `state_change` in `outputs`.

What happens next:

1. Debrief checks the result before anything is saved. A result that isn't valid fails the run and leaves the plot unchanged.
2. A result that changes features is saved with one provenance record, naming your tool, its version, the selection and the parameter values (SUB-18).
3. A result that is only a number, table or graph changes nothing, so nothing is recorded.

A **graph** plots its first column against the others. A **number** is one column holding one value.

A new annotation, here a line between two positions at a time:

```python
line = models.AnnotationFeature(
    type="Feature",
    id=context.new_id("cpa"),
    geometry=models.LineStringGeometry(
        type="LineString", coordinates=[[lon_a, lat_a], [lon_b, lat_b]]
    ),
    properties=models.AnnotationProperties(
        kind="annotation", style="shape", name="Closest approach", time=format_utc(time_ms)
    ),
)
return models.ToolResult(new_features=[line])
```

Use `style="label"` for a labelled point, `"shape"` for lines and areas, and `"note"` with `geometry=None` for a note at a time.

## Current time, selection and viewport

`context.state` holds the shared state when the analyst ran your tool: `state.time.current` and `state.time.range`, `state.selection.feature_ids`, and `state.viewport.bbox` as `[west, south, east, north]` in degrees (TL-10). It is `None` when the caller didn't pass it, for example an agent calling the tool service directly, so check before using it.

To move current time, select features or show an area, return a `SharedStateChange`. Closest approach moves current time to the moment it finds:

```python
change = models.SharedStateChange(
    time=models.TimeState(current=when, range=context.state.time.range)
)
return models.ToolResult(non_spatial=[table], new_features=[line], state_change=change)
```

Current time must be inside its range, and a selection may name only features the plot will have once your result is applied, including those you add. Shared state is never recorded in provenance and can't be undone (SUB-22). A tool that only changes shared state can run on a read-only catalogue.

**Don't change `context.plot` or the selected features.** They're copies, so changing them has no effect. Return your changes instead. A result that includes something your declaration's `outputs` doesn't list is refused.

## When something is wrong

Raise an exception with a message the analyst can act on:

```python
raise ValueError(f"{a.properties.name} and {b.properties.name} do not overlap in time")
```

The analyst sees "Closest approach failed: NELSON and LATE do not overlap in time". Any exception works the same way, so write its message for the analyst. The traceback goes to the tool service's log, not to the analyst.

The plot is unchanged, and Debrief and every other tool carry on (TL-03). The same holds for a tool that never returns: after two minutes it is stopped. And it holds for one that crashes the Python interpreter, because tools run in a separate worker process.

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

Install the package into Debrief's Python environment and restart the tool service.

While you're developing, you can skip packaging. Put your module's folder on `PYTHONPATH` and name the module directly. From a clone of the Debrief repository:

```bash
PYTHONPATH=~/my-tools uv run python -m debrief_tools list --library lab_tools   # check your declarations load
PYTHONPATH=~/my-tools uv run python -m debrief_tools serve --library lab_tools  # serve them alongside the core tools
```

If a declaration is wrong, `list` names the tool and the parameter, and says what is allowed.

## Testing your tool

Test with `debrief_tools.testing`. `try_tool` runs your tool exactly as Debrief does: it checks the values, runs the tool on a copy and checks the result. A test passes only if Debrief would accept the result. `sample_plot()` gives a small plot to run on: NELSON and BLUE, which cross, and LATE, an hour later.

```python
import pytest
from debrief_tools.testing import ToolRunError, sample_plot, try_tool
from lab_tools import fix_count


def test_fix_count():
    result = try_tool(fix_count, sample_plot(), ["track-nelson", "track-blue"])
    assert result.non_spatial[0].columns[1].numbers == [13, 13]


def test_fix_count_needs_a_track():
    with pytest.raises(ToolRunError, match="does not apply"):
        try_tool(fix_count, sample_plot(), [])
```

`testing.track(...)` builds a straight track of your own. `python/debrief-tools/tests/test_run.py` shows tools run end to end against a catalogue.
