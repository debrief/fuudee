"""Debrief's core tools: the first library, and a worked example for tool authors (DEV-09).

Each is chosen to exercise a different part of the framework: a table from
several tracks, a pair of tracks giving both a table and new features, a
quantity parameter drawing geodesic shapes, and a tool for any selection,
including none. All are pure Python on the kernel, so they run under
Pyodide too (CON-09).
"""

from __future__ import annotations

from debrief_kernel.geodesy import TrackPath, closest_approach, destination, range_between
from debrief_kernel.time import format_utc
from debrief_kernel.units import Quantity, angle
from debrief_schemas import models
from debrief_tools.declare import ToolContext, tool

VERSION = "0.0.1"
RING_POINTS = 72


def _path(feature: models.TrackFeature) -> TrackPath:
    return TrackPath.from_feature(feature)


def _table(title: str, columns: list[models.ResultColumn]) -> models.NonSpatialResult:
    return models.NonSpatialResult(title=title, presentation="table", columns=columns)


@tool(
    name="core.track_summary",
    version=VERSION,
    title="Track summary",
    explanation=(
        "Gives the start, end, duration, distance run and mean speed of each selected track."
    ),
    judgement=(
        "Distance runs straight between fixes, so a gap in the track shortens it. "
        "Check for gaps before relying on distance run or mean speed."
    ),
    applies_to=["track"],
    min_selected=1,
    max_selected=50,
    outputs=["non_spatial"],
)
def track_summary(context: ToolContext) -> models.ToolResult:
    names, starts, ends, hours, distances, speeds = [], [], [], [], [], []
    for feature in context.selection:
        path = _path(feature)
        run_m = sum(
            range_between(a, b).value
            for a, b in zip(path.positions, path.positions[1:], strict=False)
        )
        elapsed_h = (path.end_ms - path.start_ms) / 3_600_000
        names.append(feature.properties.name)
        starts.append(format_utc(path.start_ms))
        ends.append(format_utc(path.end_ms))
        hours.append(round(elapsed_h, 4))
        distances.append(round(run_m / 1852, 3))
        speeds.append(round(run_m / 1852 / elapsed_h, 2) if elapsed_h > 0 else 0.0)
    return models.ToolResult(
        non_spatial=[
            _table(
                "Track summary",
                [
                    models.ResultColumn(name="Track", strings=names),
                    models.ResultColumn(name="Start", strings=starts),
                    models.ResultColumn(name="End", strings=ends),
                    models.ResultColumn(
                        name="Duration", quantity_kind="duration", unit="h", numbers=hours
                    ),
                    models.ResultColumn(
                        name="Distance run",
                        quantity_kind="length",
                        unit="[nmi_i]",
                        numbers=distances,
                    ),
                    models.ResultColumn(
                        name="Mean speed", quantity_kind="speed", unit="[kn_i]", numbers=speeds
                    ),
                ],
            )
        ]
    )


@tool(
    name="core.closest_approach",
    version=VERSION,
    title="Closest approach",
    explanation=(
        "Finds when the two selected tracks were closest, and how close, and draws "
        "the line between them at that moment."
    ),
    judgement=(
        "Only the time both tracks cover is searched, and positions between fixes are "
        "interpolated. Check that neither track has a gap around the time found."
    ),
    applies_to=["track"],
    min_selected=2,
    max_selected=2,
    outputs=["non_spatial", "new_features"],
)
def closest(context: ToolContext) -> models.ToolResult:
    a, b = context.selection
    cpa = closest_approach(_path(a), _path(b))
    if cpa is None:
        raise ValueError(f"{a.properties.name} and {b.properties.name} do not overlap in time")
    when = format_utc(cpa.time_ms)
    name = f"Closest approach {a.properties.name} – {b.properties.name}"
    line = models.AnnotationFeature(
        type="Feature",
        id=context.new_id(f"cpa-{a.id}-{b.id}"),
        geometry=models.LineStringGeometry(
            type="LineString",
            coordinates=[
                [cpa.position_a.longitude, cpa.position_a.latitude],
                [cpa.position_b.longitude, cpa.position_b.latitude],
            ],
        ),
        properties=models.AnnotationProperties(
            kind="annotation",
            style="shape",
            name=name,
            text=f"{cpa.range.to('[nmi_i]').value:.2f} nmi at {when}",
            time=when,
        ),
    )
    table = _table(
        name,
        [
            models.ResultColumn(name="Time", strings=[when]),
            models.ResultColumn(
                name="Range",
                quantity_kind="length",
                unit="[nmi_i]",
                numbers=[round(cpa.range.to("[nmi_i]").value, 3)],
            ),
        ],
    )
    return models.ToolResult(non_spatial=[table], new_features=[line])


@tool(
    name="core.range_rings",
    version=VERSION,
    title="Range rings",
    explanation="Draws rings at equal ranges around a track's position at a chosen time.",
    applies_to=["track"],
    min_selected=1,
    max_selected=1,
    parameters=[
        {
            "name": "spacing",
            "title": "Spacing",
            "explanation": "Range between one ring and the next.",
            "kind": "quantity",
            "quantity_kind": "length",
            "default": {"value": 2.0, "unit": "[nmi_i]"},
            "minimum": 0.1,
            "maximum": 100.0,
        },
        {
            "name": "rings",
            "title": "Number of rings",
            "kind": "integer",
            "default": 3,
            "minimum": 1,
            "maximum": 10,
        },
        {
            "name": "at",
            "title": "Time",
            "explanation": "Leave empty for the start of the track.",
            "kind": "time",
            "required": False,
        },
    ],
    outputs=["new_features"],
)
def range_rings(context: ToolContext) -> models.ToolResult:
    (track,) = context.selection
    path = _path(track)
    at = context.parameters["at"]
    at = path.start_ms if at is None else at
    centre = path.position_at(at)
    if centre is None:
        raise ValueError(
            f"{format_utc(at)} is outside {track.properties.name}, which runs from "
            f"{format_utc(path.start_ms)} to {format_utc(path.end_ms)}"
        )
    spacing: Quantity = context.parameters["spacing"]
    features = []
    for n in range(1, context.parameters["rings"] + 1):
        radius = spacing * n
        ring = [
            destination(centre, angle(360.0 * i / RING_POINTS), radius) for i in range(RING_POINTS)
        ]
        ring.append(ring[0])
        features.append(
            models.AnnotationFeature(
                type="Feature",
                id=context.new_id(f"rings-{track.id}-{n}"),
                geometry=models.PolygonGeometry(
                    type="Polygon", coordinates=[[[p.longitude, p.latitude] for p in ring]]
                ),
                properties=models.AnnotationProperties(
                    kind="annotation",
                    style="shape",
                    name=f"{track.properties.name} {radius.value:g} {_unit_label(radius.unit)}",
                    time=format_utc(at),
                ),
            )
        )
    return models.ToolResult(new_features=features)


def _unit_label(unit: str) -> str:
    return {"[nmi_i]": "nmi", "[yd_i]": "yd", "[ft_i]": "ft"}.get(unit, unit)


@tool(
    name="core.add_note",
    version=VERSION,
    title="Add note",
    explanation="Adds a note at a time. With features selected, the note names them.",
    applies_to=["*"],
    min_selected=0,
    parameters=[
        {"name": "text", "title": "Note", "kind": "string"},
        {"name": "at", "title": "Time", "kind": "time"},
    ],
    outputs=["new_features"],
)
def add_note(context: ToolContext) -> models.ToolResult:
    text: str = context.parameters["text"].strip()
    about = [f.properties.name for f in context.selection]
    note = models.AnnotationFeature(
        type="Feature",
        id=context.new_id("note"),
        geometry=None,
        properties=models.AnnotationProperties(
            kind="annotation",
            style="note",
            name=text.splitlines()[0][:60],
            text=f"{text}\n\nAbout: {', '.join(about)}" if about else text,
            time=format_utc(context.parameters["at"]),
        ),
    )
    return models.ToolResult(new_features=[note])


__all__ = ["add_note", "closest", "range_rings", "track_summary"]
