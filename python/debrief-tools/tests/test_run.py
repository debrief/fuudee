"""Running tools on a plot: results applied, provenance recorded, failures contained."""

import pytest

from debrief_schemas import SCHEMA_VERSION, models
from debrief_stac import Base, Catalogue, Changes, NewerSchemaError
from debrief_tools import Registry, ToolRunError, run_tool, tool
from debrief_tools.declare import Tool
from debrief_tools.run import ToolRunConflict, ToolRunNewerSchema

REGISTRY = Registry.discover()
ANALYST = models.AgentRef(kind="person", name="analyst")
ITEM = "serial"


def run(catalogue: Catalogue, name: str, selection: list[str], parameters=None, **kw):
    return run_tool(REGISTRY, catalogue, ITEM, name, selection, parameters, ANALYST, **kw)


def test_track_summary_returns_a_table_and_changes_nothing(catalogue: Catalogue) -> None:
    before = catalogue.read_plot(ITEM)
    outcome = run(catalogue, "core.track_summary", ["track-nelson", "track-blue"])
    assert not outcome.changed and outcome.record is None
    (table,) = outcome.result.non_spatial
    columns = {c.name: c for c in table.columns}
    assert columns["Track"].strings == ["NELSON", "BLUE"]
    assert columns["Duration"].numbers == [pytest.approx(1 / 3, abs=1e-4)] * 2
    assert columns["Mean speed"].numbers[0] == pytest.approx(12.0, abs=0.2)
    assert catalogue.read_plot(ITEM) == before


def test_closest_approach_adds_a_line_and_records_provenance(catalogue: Catalogue) -> None:
    outcome = run(catalogue, "core.closest_approach", ["track-nelson", "track-blue"])
    assert outcome.changed
    plot = catalogue.read_plot(ITEM)
    line = plot.features[-1]
    assert line.id == "cpa-track-nelson-track-blue"
    assert line.properties.time.startswith("1995-12-12T05:1")
    record = plot.provenance[-1]
    assert record.kind == "tool" and record.tool.name == "core.closest_approach"
    assert record.selected == ["track-nelson", "track-blue"]
    assert record.agent == ANALYST
    rng = outcome.result.non_spatial[0].columns[2]
    assert rng.unit == "[nmi_i]" and rng.numbers[0] < 0.5


def test_range_rings_use_parameters_and_record_them(catalogue: Catalogue) -> None:
    run(
        catalogue,
        "core.range_rings",
        ["track-nelson"],
        {"rings": 2, "spacing": {"value": 1, "unit": "[nmi_i]"}},
    )
    plot = catalogue.read_plot(ITEM)
    rings = [f for f in plot.features if f.id.startswith("rings-")]
    assert [r.properties.name for r in rings] == [
        "NELSON at 05:00:00Z",
        "NELSON 1 nmi",
        "NELSON 2 nmi",
    ]
    assert rings[0].geometry.type == "Point"
    rings = rings[1:]
    assert rings[0].geometry.coordinates[0][0] == rings[0].geometry.coordinates[0][-1]
    recorded = {p.name: p.value for p in plot.provenance[-1].parameters}
    assert recorded["rings"] == 2


def test_running_twice_gives_distinct_ids(catalogue: Catalogue) -> None:
    for _ in range(2):
        run(
            catalogue,
            "core.add_note",
            [],
            {"text": "Contact gained", "at": "1995-12-12T05:05:00.000Z"},
        )
    notes = [f.id for f in catalogue.read_plot(ITEM).features if f.id.startswith("note")]
    assert notes == ["note", "note-2"]


def test_tool_that_raises_fails_its_run_only(catalogue: Catalogue) -> None:
    before = catalogue.read_plot(ITEM)
    with pytest.raises(ToolRunError, match="do not overlap in time"):
        run(catalogue, "core.closest_approach", ["track-nelson", "track-late"])
    with pytest.raises(ToolRunError, match="^Range rings.*12 Dec 1995 09:00:00Z is outside NELSON"):
        run(catalogue, "core.range_rings", ["track-nelson"], {"at": "1995-12-12T09:00:00.000Z"})
    assert catalogue.read_plot(ITEM) == before


def test_tool_returning_rubbish_cannot_damage_the_plot(catalogue: Catalogue) -> None:
    registry = Registry()
    declaration = REGISTRY.tools["core.add_note"].declaration.model_copy(update={"name": "lab.bad"})

    def bad(context):
        return "not a result"

    def clashing(context):
        return models.ToolResult(new_features=[context.plot.features[0]])

    registry.tools["lab.bad"] = Tool(declaration, bad)
    registry.tools["lab.clash"] = Tool(
        declaration.model_copy(update={"name": "lab.clash"}), clashing
    )
    before = catalogue.read_plot(ITEM)
    params = {"text": "x", "at": "1995-12-12T05:05:00.000Z"}
    with pytest.raises(ToolRunError, match="result Debrief cannot use"):
        run_tool(registry, catalogue, ITEM, "lab.bad", [], params, ANALYST)
    with pytest.raises(ToolRunError, match="id is already used"):
        run_tool(registry, catalogue, ITEM, "lab.clash", [], params, ANALYST)
    assert catalogue.read_plot(ITEM) == before


@pytest.mark.parametrize(
    ("name", "selection", "message"),
    [
        ("core.closest_approach", ["track-nelson"], "does not apply to this selection"),
        ("core.track_summary", ["track-nobody"], "no feature 'track-nobody'"),
        ("lab.missing", [], "no tool called lab.missing"),
    ],
)
def test_requests_that_cannot_run(catalogue: Catalogue, name, selection, message) -> None:
    with pytest.raises(ToolRunError, match=message):
        run(catalogue, name, selection)


def test_read_only_store_refuses_tools_that_change_plots(catalogue: Catalogue) -> None:
    with pytest.raises(ToolRunError, match="read-only"):
        run(catalogue, "core.range_rings", ["track-nelson"], read_only=True)
    assert run(catalogue, "core.track_summary", ["track-nelson"], read_only=True).result


def test_scientist_tool_with_decorator_runs(catalogue: Catalogue) -> None:
    @tool(
        name="lab.count",
        version="0.1.0",
        title="Count",
        explanation="Counts.",
        applies_to=["*"],
        min_selected=1,
        outputs=["non_spatial"],
    )
    def count(context):
        return models.ToolResult(
            non_spatial=[
                models.NonSpatialResult(
                    title="Count",
                    presentation="number",
                    columns=[
                        models.ResultColumn(name="Selected", numbers=[len(context.selection)])
                    ],
                )
            ]
        )

    registry = Registry()
    registry.tools["lab.count"] = count.debrief_tool
    outcome = run_tool(
        registry, catalogue, ITEM, "lab.count", ["track-nelson", "track-blue"], None, ANALYST
    )
    assert outcome.result.non_spatial[0].columns[0].numbers == [2]


def test_change_saved_while_a_tool_runs_is_not_overwritten(catalogue: Catalogue) -> None:
    registry = Registry()
    declaration = REGISTRY.tools["core.add_note"].declaration

    def meanwhile(context):
        # Another process saves the plot while this tool is still running.
        plot = catalogue.read_plot(ITEM)
        record = plot.provenance[0].model_copy(update={"id": "elsewhere"})
        others = [f.id for f in plot.features[1:] if f.properties.kind != "plot"]
        catalogue.commit(ITEM, [record], Changes(deleted_ids=others))
        return REGISTRY.tools["core.add_note"].run(context)

    registry.tools["core.add_note"] = Tool(declaration, meanwhile)
    params = {"text": "x", "at": "1995-12-12T05:05:00.000Z"}
    with pytest.raises(ToolRunConflict, match="changed elsewhere") as conflict:
        run_tool(registry, catalogue, ITEM, "core.add_note", [], params, ANALYST)
    assert conflict.value.mergeable  # the note touches nothing the other change touched
    assert [f.id for f in catalogue.read_plot(ITEM).features] == ["track-nelson", "plot"]
    # Combined: the other change stays, and the note is added on top (SUB-29).
    run_tool(registry, catalogue, ITEM, "core.add_note", [], params, ANALYST, on_conflict="merge")
    assert [f.id for f in catalogue.read_plot(ITEM).features] == ["track-nelson", "plot", "note"]


def test_provenance_ids_are_unique(catalogue: Catalogue) -> None:
    params = {"text": "x", "at": "1995-12-12T05:05:00.000Z"}
    ids = {run(catalogue, "core.add_note", [], params).record.id for _ in range(3)}
    assert len(ids) == 3


def test_a_run_from_an_older_view_of_the_plot_is_a_conflict(catalogue: Catalogue) -> None:
    seen = catalogue.history(ITEM).base()  # what the analyst was looking at
    run(catalogue, "core.add_note", [], {"text": "Elsewhere", "at": "1995-12-12T05:05:00.000Z"})
    with pytest.raises(ToolRunConflict) as raised:
        run(catalogue, "core.closest_approach", ["track-nelson", "track-blue"], base=seen)
    assert raised.value.mergeable is True
    merged = run(
        catalogue,
        "core.closest_approach",
        ["track-nelson", "track-blue"],
        base=seen,
        on_conflict="merge",
    )
    assert merged.changed and len(catalogue.history(ITEM).steps()) == 3
    with pytest.raises(ToolRunError, match="not one this plot's history holds"):
        run(catalogue, "core.track_summary", ["track-nelson"], base=Base(9, seen.plot_hash))


def test_saving_a_newer_schema_into_a_shared_catalogue_asks_first(catalogue: Catalogue) -> None:
    # Before 1.0 an older catalogue can't be opened at all (SUB-13), so this
    # stands in for one an older Debrief keeps using alongside this one.
    catalogue.model.debrief_schema_version = "0.0.1"
    pair = ["track-nelson", "track-blue"]
    with pytest.raises(ToolRunNewerSchema, match="other users of the catalogue may not"):
        run(catalogue, "core.closest_approach", pair)
    assert len(catalogue.history(ITEM).steps()) == 1  # nothing saved
    with pytest.raises(NewerSchemaError):
        catalogue.history(ITEM).undo()
    assert run(catalogue, "core.closest_approach", pair, allow_newer_schema=True).changed
    assert catalogue.schema_version == SCHEMA_VERSION


def test_a_tool_sees_content_never_the_island(catalogue: Catalogue) -> None:
    """A run is recorded by its selection and parameters, so it may not read view state
    kept outside the history (SUB-19, SUB-22)."""
    registry = Registry()
    declaration = REGISTRY.tools["core.add_note"].declaration
    seen = {}

    def look(context):
        seen["views"] = [
            f.properties.view for f in context.plot.features if f.properties.kind == "plot"
        ]
        return REGISTRY.tools["core.add_note"].run(context)

    registry.tools["core.add_note"] = Tool(declaration, look)
    assert catalogue.read_view(ITEM)[0] is not None  # imported with a window
    params = {"text": "x", "at": "1995-12-12T05:05:00.000Z"}
    run_tool(registry, catalogue, ITEM, "core.add_note", [], params, ANALYST)
    assert seen["views"] == [None]
    assert catalogue.read_view(ITEM)[0] is not None  # and the run kept it
    with pytest.raises(ToolRunError, match="not on the plot's own details"):
        run(catalogue, "core.add_note", ["plot"], params)


def _window_tool(state_change):
    """A test tool whose purpose is to set the time window (no shipped tool does yet)."""

    @tool(
        name="lab.set_window",
        version="0.1.0",
        title="Set window",
        explanation="Sets the time window.",
        applies_to=["*"],
        min_selected=0,
        outputs=["state_change"],
    )
    def set_window(context):
        return models.ToolResult(state_change=state_change)

    registry = Registry()
    registry.tools["lab.set_window"] = set_window.debrief_tool
    return registry


def test_a_tool_may_ask_for_its_range_to_be_saved_as_the_window(catalogue: Catalogue) -> None:
    # The host decides whether to honour it: only for a run the analyst made by hand (CAP-28).
    window = models.TimeRange(start="1995-12-12T05:10:00.000Z", end="1995-12-12T05:40:00.000Z")
    change = models.SharedStateChange(
        time=models.TimeState(current="1995-12-12T05:10:00.000Z", range=window), save_window=True
    )
    before = catalogue.read_plot(ITEM)
    outcome = run_tool(_window_tool(change), catalogue, ITEM, "lab.set_window", [], None, ANALYST)
    assert outcome.result.state_change.save_window is True
    assert outcome.result.state_change.time.range == window
    # Shared state only: the plot, its provenance and its view are untouched.
    assert not outcome.changed and outcome.record is None
    assert catalogue.read_plot(ITEM) == before


def test_asking_to_save_the_window_without_a_time_is_refused(catalogue: Catalogue) -> None:
    change = models.SharedStateChange(save_window=True)
    with pytest.raises(ToolRunError, match="save_window needs a time"):
        run_tool(_window_tool(change), catalogue, ITEM, "lab.set_window", [], None, ANALYST)


def test_closest_approach_records_its_time_not_a_window(catalogue: Catalogue) -> None:
    outcome = run(catalogue, "core.closest_approach", ["track-nelson", "track-blue"])
    change = outcome.result.state_change
    assert change is None or not change.save_window  # never asks for its range to be saved
    plot = catalogue.read_plot(ITEM)
    record = plot.provenance[-1]
    assert "time_window" not in record.model_dump_json()
    assert plot.features[-1].properties.time.startswith("1995-12-12T05:1")
