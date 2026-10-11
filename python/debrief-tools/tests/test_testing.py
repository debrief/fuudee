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


def _state(current: str, start: str, end: str) -> models.SharedState:
    return models.SharedState(
        time=models.TimeState(current=current, range=models.TimeRange(start=start, end=end)),
        selection=models.Selection(plot="plot.geojson", feature_ids=["track-nelson"]),
        viewport=models.Viewport(bbox=[-5.0, 50.0, -4.0, 51.0]),
    )


def test_tools_read_shared_state_and_set_it() -> None:
    plot = sample_plot()
    pair = ["track-nelson", "track-blue"]
    assert try_tool(closest, plot, pair).state_change is None  # no state passed, none set
    state = _state(
        "1995-12-12T05:00:00.000Z", "1995-12-12T05:00:00.000Z", "1995-12-12T08:00:00.000Z"
    )
    moved = try_tool(closest, plot, pair, state=state).state_change
    assert moved.time.current.startswith("1995-12-12T05:")
    assert moved.time.range == state.time.range and moved.selection is None
    narrow = _state(
        "1995-12-12T07:00:00.000Z", "1995-12-12T07:00:00.000Z", "1995-12-12T08:00:00.000Z"
    )
    widened = try_tool(closest, plot, pair, state=narrow).state_change.time
    assert widened.range.start == widened.current < "1995-12-12T07:00:00.000Z"


def test_a_tool_cannot_select_features_the_plot_lacks() -> None:
    @tool(
        name="lab.pick",
        version="0.1.0",
        title="Pick",
        explanation="Selects.",
        applies_to=["*"],
        min_selected=0,
        outputs=["state_change"],
    )
    def pick(context):
        seen = context.state.selection.feature_ids
        return models.ToolResult(
            state_change=models.SharedStateChange(
                selection=models.Selection(plot="plot.geojson", feature_ids=[*seen, "ghost"])
            )
        )

    state = _state(
        "1995-12-12T05:00:00.000Z", "1995-12-12T05:00:00.000Z", "1995-12-12T06:00:00.000Z"
    )
    with pytest.raises(ToolRunError, match="selected a feature the plot does not have: ghost"):
        try_tool(pick, sample_plot(), [], state=state)
