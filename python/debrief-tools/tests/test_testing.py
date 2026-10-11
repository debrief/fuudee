"""The testing helpers give scientists what Debrief would give them."""

import pytest

from debrief_schemas import models
from debrief_tools import tool
from debrief_tools.core import closest, track_summary
from debrief_tools.testing import ToolRunError, sample_plot, try_tool


def test_sample_plot_is_valid_and_core_tools_run_on_it() -> None:
    plot = sample_plot()
    result = try_tool(closest, plot, ["track-nelson", "track-blue"])
    assert result.new_features[0].id == "cpa-track-nelson-track-blue"
    summary = try_tool(track_summary, plot, ["track-nelson", "track-blue", "track-late"])
    assert summary.non_spatial[0].columns[0].strings == ["NELSON", "BLUE", "LATE"]


def test_try_tool_rejects_what_debrief_would_reject() -> None:
    @tool(
        name="lab.rate",
        version="0.1.0",
        title="Rate",
        explanation="Gives a rate.",
        applies_to=["track"],
        outputs=["non_spatial"],
    )
    def unitless(context):
        return models.ToolResult(
            non_spatial=[
                models.NonSpatialResult(
                    title="Rate",
                    presentation="number",
                    columns=[models.ResultColumn(name="Rate", unit="deg/min", numbers=[1.0])],
                )
            ]
        )

    with pytest.raises(ToolRunError, match="unit given without a quantity kind"):
        try_tool(unitless, sample_plot(), ["track-nelson"])
    with pytest.raises(ToolRunError, match="does not apply"):
        try_tool(unitless, sample_plot(), [])


def test_bearing_rate_column_carries_its_unit() -> None:
    @tool(
        name="lab.rate",
        version="0.1.0",
        title="Bearing rate",
        explanation="Gives a bearing rate.",
        applies_to=["track"],
        outputs=["non_spatial"],
        parameters=[
            {
                "name": "limit",
                "title": "Limit",
                "kind": "quantity",
                "quantity_kind": "angular_rate",
                "default": {"value": 2.0, "unit": "deg/min"},
            }
        ],
    )
    def rate(context):
        limit = context.parameters["limit"].to("deg/min").value
        return models.ToolResult(
            non_spatial=[
                models.NonSpatialResult(
                    title="Rate",
                    presentation="number",
                    columns=[
                        models.ResultColumn(
                            name="Rate",
                            quantity_kind="angular_rate",
                            unit="deg/min",
                            numbers=[min(1.5, limit)],
                        )
                    ],
                )
            ]
        )

    result = try_tool(
        rate, sample_plot(), ["track-nelson"], {"limit": {"value": 0.02, "unit": "deg/s"}}
    )
    assert result.non_spatial[0].columns[0].numbers == [1.2]
