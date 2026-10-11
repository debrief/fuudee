"""Running tools on a plot: results applied, provenance recorded, failures contained."""

import pytest

from debrief_schemas import models
from debrief_stac import Catalogue
from debrief_tools import Registry, ToolRunError, run_tool, tool
from debrief_tools.declare import Tool

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
    rng = outcome.result.non_spatial[0].columns[1]
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
    assert [r.properties.name for r in rings] == ["NELSON 1 nmi", "NELSON 2 nmi"]
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
    with pytest.raises(ToolRunError, match="outside NELSON"):
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
