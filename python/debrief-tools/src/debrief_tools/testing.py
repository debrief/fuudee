"""Helpers for testing a tool the way Debrief runs it.

    from debrief_tools.testing import sample_plot, try_tool

    plot = sample_plot()
    result = try_tool(my_tool, plot, ["track-nelson", "track-blue"], {"rings": 2})

try_tool binds the values, runs the tool on a copy and checks the result
exactly as the service does, so a test passes only if Debrief would accept
the result. It raises ToolRunError with the analyst's message otherwise.
"""

from __future__ import annotations

from typing import Any

from debrief_kernel.geodesy import Position, destination
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import angle, length
from debrief_schemas import SCHEMA_VERSION, DebriefFeatureCollection, models
from debrief_tools.declare import Run, Tool
from debrief_tools.run import ToolRunError, execute

__all__ = ["ToolRunError", "sample_plot", "track", "try_tool"]


def track(
    feature_id: str,
    name: str,
    start: Position,
    course_deg: float,
    speed_kn: float,
    start_time: str = "1995-12-12T05:00:00.000Z",
    fixes: int = 13,
    interval_s: int = 300,
    colour: str = "#e01c3e",
) -> models.TrackFeature:
    """A straight track at steady course and speed, with speeds and courses filled in."""
    t0 = parse_utc(start_time)
    times, positions = [], []
    for n in range(fixes):
        times.append(format_utc(t0 + n * interval_s * 1000))
        run_m = speed_kn * 1852 / 3600 * interval_s * n
        positions.append(destination(start, angle(course_deg), length(run_m)))
    return models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[p.longitude, p.latitude] for p in positions]
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=times,
            speeds=models.SpeedSeries(unit="[kn_i]", values=[speed_kn] * fixes),
            courses=models.AngleSeries(unit="deg", values=[course_deg] * fixes),
            style=models.TrackStyle(colour=colour),
        ),
    )


def sample_plot() -> DebriefFeatureCollection:
    """Three tracks off Plymouth for an hour from 05:00Z on 12 December 1995.

    - track-nelson: east at 12 kn.
    - track-blue: south at 10 kn, crossing NELSON's path.
    - track-late: an hour later, overlapping neither.
    """
    return DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version=SCHEMA_VERSION,
        features=[
            track("track-nelson", "NELSON", Position(-4.20, 50.30), 90.0, 12.0),
            track("track-blue", "BLUE", Position(-4.05, 50.40), 180.0, 10.0, colour="#0064bd"),
            track(
                "track-late",
                "LATE",
                Position(-4.00, 50.00),
                0.0,
                5.0,
                start_time="1995-12-12T07:00:00.000Z",
                colour="#00a000",
            ),
        ],
        provenance=[],
    )


def try_tool(
    tool: Run | Tool,
    plot: DebriefFeatureCollection,
    selection: list[str],
    parameters: dict[str, Any] | None = None,
    state: models.SharedState | None = None,
) -> models.ToolResult:
    """Run a tool as Debrief would, without saving: values checked, result checked.

    state is the shared state the tool sees in context.state (TL-10).
    """
    declared = tool if isinstance(tool, Tool) else getattr(tool, "debrief_tool", None)
    if declared is None:
        raise TypeError("try_tool needs a function decorated with @tool")
    result, _ = execute(declared, plot, selection, parameters, state)
    return result
