"""Annotations made, changed, restyled and deleted by hand: each one step in the
plot's history, named plainly, and undone and redone like any change (CAP-03 to
CAP-05, SUB-19, SUB-21)."""

import json
from pathlib import Path

import pytest

from debrief_kernel.geodesy import CURVE_SIDES, Position, range_between
from debrief_schemas import DocumentKind, dump_document, load_document, models
from debrief_stac import Catalogue, CatalogueError, Changes, Conflict
from debrief_stac.annotations import (
    AnnotationError,
    build,
    describe_change,
    shape_of,
    spec_from,
    spec_of,
)

AGENT = models.AgentRef(kind="person", name="analyst")
CENTRE = [-4.12, 50.33]
CIRCLE = {
    "shape": "circle",
    "name": "Exclusion zone",
    "positions": [CENTRE],
    "radius": {"value": 2, "unit": "[nmi_i]"},
}


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    origin = models.ProvRecord(
        id="op-1", kind="import", started_at="2026-10-11T10:00:00.000Z", agent=AGENT
    )
    note = models.AnnotationFeature(
        type="Feature",
        id="note-1",
        geometry=None,
        properties=models.AnnotationProperties(
            kind="annotation", style="note", name="Start", time="2026-10-11T09:30:00.000Z"
        ),
    )
    catalogue.commit("p", [origin], Changes(added=[note]))
    return catalogue


def feature(catalogue: Catalogue, feature_id: str):
    return next(f for f in catalogue.read_plot("p").features if f.id == feature_id)


def last_note(catalogue: Catalogue) -> str:
    step = catalogue.history("p").steps()[-1]
    return step.records[0].notes[0]


# --- Building each shape ------------------------------------------------------------


def test_a_circle_is_a_polygon_for_other_tools_and_exact_in_its_properties() -> None:
    circle = build(spec_from(CIRCLE), "zone")
    assert circle.geometry.type == "Polygon"
    ring = circle.geometry.coordinates[0]
    assert len(ring) == CURVE_SIDES + 1 and ring[0] == ring[-1]
    for lon, lat in ring:
        assert range_between(Position(*CENTRE), Position(lon, lat)).value == pytest.approx(3704)
    props = circle.properties
    assert (str(props.shape), props.centre, props.radius.value, str(props.radius.unit)) == (
        "circle",
        CENTRE,
        2,
        "[nmi_i]",
    )
    # Valid GeoJSON as Debrief writes it: the plot rules accept it.
    plot = {
        "type": "FeatureCollection",
        "schema_version": load_plot_version(),
        "features": [json.loads(circle.model_dump_json(exclude_none=True))],
        "provenance": [],
    }
    load_document(DocumentKind.PLOT, plot)


def load_plot_version() -> str:
    from debrief_schemas import SCHEMA_VERSION

    return SCHEMA_VERSION


def test_an_ellipse_keeps_its_axes_and_orientation() -> None:
    ellipse = build(
        spec_from(
            {
                "shape": "ellipse",
                "name": "Search area",
                "positions": [CENTRE],
                "semi_major": {"value": 3000, "unit": "[yd_i]"},
                "semi_minor": {"value": 1, "unit": "km"},
                "orientation": {"value": 405, "unit": "deg"},
            }
        ),
        "search",
    )
    props = ellipse.properties
    assert props.orientation.value == 45  # within a turn
    assert str(props.semi_major.unit) == "[yd_i]" and str(props.semi_minor.unit) == "km"
    assert len(ellipse.geometry.coordinates[0]) == CURVE_SIDES + 1


@pytest.mark.parametrize(
    ("spec", "geometry", "style"),
    [
        ({"shape": "line", "positions": [[0, 0], [1, 1], [2, 0]]}, "LineString", "shape"),
        ({"shape": "area", "positions": [[0, 0], [1, 1], [2, 0]]}, "Polygon", "shape"),
        ({"shape": "label", "positions": [[0, 0]], "text": "Buoy"}, "Point", "label"),
        ({"shape": "marker", "positions": [[0, 0]]}, "Point", "shape"),
        ({"shape": "note", "time": "2026-10-11T09:30:00.000Z"}, None, "note"),
    ],
)
def test_each_shape_has_its_geometry(spec: dict, geometry: str | None, style: str) -> None:
    made = build(spec_from({**spec, "name": "It"}), "it")
    assert (made.geometry.type if made.geometry else None) == geometry
    assert str(made.properties.style) == style
    assert shape_of(made) == spec["shape"]
    if spec["shape"] == "area":
        ring = made.geometry.coordinates[0]
        assert ring[0] == ring[-1] and len(ring) == 4  # closed for GeoJSON


def test_positions_can_be_typed_in_the_analysts_notation() -> None:
    made = spec_from({**CIRCLE, "positions": ["50°19.800'N 004°07.200'W"]})
    assert made.positions == [[pytest.approx(-4.12), pytest.approx(50.33)]]


@pytest.mark.parametrize(
    ("spec", "message"),
    [
        ({"shape": "line", "name": "L", "positions": [[0, 0]]}, "at least 2 positions"),
        ({"shape": "area", "name": "A", "positions": [[0, 0], [1, 1]]}, "at least 3 corners"),
        ({"shape": "circle", "name": "C", "positions": [[0, 0]]}, "radius"),
        ({**CIRCLE, "radius": {"value": 0, "unit": "m"}}, "more than zero"),
        (
            {
                "shape": "ellipse",
                "name": "E",
                "positions": [[0, 0]],
                "semi_major": {"value": 1, "unit": "km"},
                "semi_minor": {"value": 2, "unit": "km"},
                "orientation": {"value": 0, "unit": "deg"},
            },
            "no longer than",
        ),
        ({"shape": "note", "name": "N"}, "needs a time"),
        ({**CIRCLE, "name": "  "}, "name"),
        (
            {
                "shape": "line",
                "name": "L",
                "positions": [[0, 0], [1, 1]],
                "appearance": {"fill_colour": "#ff0000"},
            },
            "only areas, circles and ellipses can be filled",
        ),
        (
            {
                **CIRCLE,
                "time": "2026-10-11T09:30:00.000Z",
                "time_range": {
                    "start": "2026-10-11T09:30:00.000Z",
                    "end": "2026-10-11T09:40:00.000Z",
                },
            },
            "not both",
        ),
        ({**CIRCLE, "positions": ["somewhere"]}, "Not a position"),
        # Beyond about half the world, a geodesic circle folds back on itself.
        ({**CIRCLE, "radius": {"value": 25_000, "unit": "km"}}, "at most 10,000 km"),
    ],
)
def test_a_description_that_cannot_be_made_is_refused_plainly(spec: dict, message: str) -> None:
    with pytest.raises(AnnotationError, match=message):
        build(spec_from(spec), "x")


def test_a_feature_reads_back_into_its_description() -> None:
    styled = {
        **CIRCLE,
        "time_range": {"start": "2026-10-11T09:30:00.000Z", "end": "2026-10-11T10:30:00.000Z"},
        "appearance": {"colour": "#0064bd", "line_style": "dotted", "fill_colour": "#0064bd"},
    }
    spec = spec_from(styled)
    assert spec_of(build(spec, "zone")) == spec


# --- Recorded, undoable steps ----------------------------------------------------------


def test_adding_a_circle_is_one_named_step_and_undo_takes_it_away(catalogue: Catalogue) -> None:
    before = len(catalogue.history("p").steps())
    step, feature_id = catalogue.add_annotation("p", CIRCLE, AGENT)
    assert feature_id == "annotation-exclusion-zone"
    assert len(catalogue.history("p").steps()) == before + 1 == step
    assert last_note(catalogue) == "Circle 'Exclusion zone' added"
    catalogue.history("p").undo()
    assert feature_id not in {f.id for f in catalogue.read_plot("p").features}
    catalogue.history("p").redo()
    assert str(feature(catalogue, feature_id).properties.shape) == "circle"


def test_restyling_is_its_own_step_and_undo_restores_the_style(catalogue: Catalogue) -> None:
    _, feature_id = catalogue.add_annotation("p", CIRCLE, AGENT)
    style = {"colour": "#0064bd", "line_style": "solid", "line_width": 3, "fill_opacity": 0.2}
    style["fill_colour"] = "#0064bd"
    catalogue.edit_annotation("p", feature_id, {"appearance": style}, AGENT)
    assert last_note(catalogue) == "Style of Circle 'Exclusion zone' changed"
    assert feature(catalogue, feature_id).properties.appearance.line_width == 3
    catalogue.history("p").undo()
    assert feature(catalogue, feature_id).properties.appearance is None
    catalogue.history("p").redo()
    assert feature(catalogue, feature_id).properties.appearance.colour == "#0064bd"


def test_changing_the_radius_makes_the_polygon_again(catalogue: Catalogue) -> None:
    _, feature_id = catalogue.add_annotation("p", CIRCLE, AGENT)
    catalogue.edit_annotation("p", feature_id, {"radius": {"value": 5, "unit": "km"}}, AGENT)
    assert last_note(catalogue) == "Circle 'Exclusion zone' resized"
    ring = feature(catalogue, feature_id).geometry.coordinates[0]
    assert range_between(Position(*CENTRE), Position(*ring[10])).value == pytest.approx(5000)


@pytest.mark.parametrize(
    ("change", "note"),
    [
        ({"time": "2026-10-11T09:45:00.000Z"}, "Time of Circle 'Exclusion zone' changed"),
        ({"name": "Keep out"}, "Circle 'Exclusion zone' renamed 'Keep out'"),
    ],
)
def test_each_kind_of_change_is_named(catalogue: Catalogue, change: dict, note: str) -> None:
    _, feature_id = catalogue.add_annotation("p", CIRCLE, AGENT)
    catalogue.edit_annotation("p", feature_id, change, AGENT)
    assert last_note(catalogue) == note


AREA = {
    "shape": "area",
    "name": "Transit lane",
    "positions": [[-4.2, 50.3], [-4.1, 50.32], [-4.05, 50.28]],
}
ELLIPSE = {
    "shape": "ellipse",
    "name": "Search area",
    "positions": [CENTRE],
    "semi_major": {"value": 3, "unit": "[nmi_i]"},
    "semi_minor": {"value": 1, "unit": "[nmi_i]"},
    "orientation": {"value": 45, "unit": "deg"},
}


@pytest.mark.parametrize(
    ("spec", "change", "note"),
    [
        # Dragged or nudged whole on the map: every position by the same amount.
        (CIRCLE, {"positions": [[-4.1, 50.34]]}, "Circle 'Exclusion zone' moved"),
        (
            AREA,
            {"positions": [[-4.19, 50.31], [-4.09, 50.33], [-4.04, 50.29]]},
            "Area 'Transit lane' moved",
        ),
        # Moved across the antimeridian: each longitude is kept between -180 and 180.
        (
            {
                "shape": "area",
                "name": "Fiji box",
                "positions": [[179.6, -17.0], [179.9, -17.0], [179.8, -17.3]],
            },
            {"positions": [[179.9, -17.0], [-179.8, -17.0], [-179.9, -17.3]]},
            "Area 'Fiji box' moved",
        ),
        # A corner dragged, added or removed.
        (
            AREA,
            {"positions": [[-4.2, 50.3], [-4.1, 50.35], [-4.05, 50.28]]},
            "Area 'Transit lane' reshaped",
        ),
        (
            AREA,
            {"positions": [[-4.2, 50.3], [-4.15, 50.33], [-4.1, 50.32], [-4.05, 50.28]]},
            "Area 'Transit lane' reshaped",
        ),
        # An ellipse's axis handles: its size and orientation.
        (
            ELLIPSE,
            {
                "semi_major": {"value": 4, "unit": "[nmi_i]"},
                "orientation": {"value": 60, "unit": "deg"},
            },
            "Ellipse 'Search area' reshaped",
        ),
    ],
)
def test_changes_made_on_the_map_are_named_for_what_was_done(
    catalogue: Catalogue, spec: dict, change: dict, note: str
) -> None:
    _, feature_id = catalogue.add_annotation("p", spec, AGENT)
    steps = len(catalogue.history("p").steps())
    catalogue.edit_annotation("p", feature_id, change, AGENT)
    assert last_note(catalogue) == note
    assert len(catalogue.history("p").steps()) == steps + 1
    catalogue.history("p").undo()
    assert spec_of(feature(catalogue, feature_id)).positions == spec["positions"]


def test_a_change_that_changes_nothing_is_not_a_step(catalogue: Catalogue) -> None:
    _, feature_id = catalogue.add_annotation("p", CIRCLE, AGENT)
    steps = len(catalogue.history("p").steps())
    assert catalogue.edit_annotation("p", feature_id, {"name": "Exclusion zone"}, AGENT) is None
    assert len(catalogue.history("p").steps()) == steps


def test_a_form_clears_what_it_leaves_empty(catalogue: Catalogue) -> None:
    """The form sends the whole description, with None for what it leaves empty:
    text, style and time can be taken away again."""
    styled = {**CIRCLE, "time": "2026-10-11T09:45:00.000Z", "appearance": {"colour": "#0064bd"}}
    _, feature_id = catalogue.add_annotation("p", styled, AGENT)
    cleared = {**CIRCLE, "text": None, "time": None, "time_range": None, "appearance": None}
    catalogue.edit_annotation("p", feature_id, cleared, AGENT)
    props = feature(catalogue, feature_id).properties
    assert (props.time, props.appearance) == (None, None)


def test_a_time_replaces_a_period_and_a_period_a_time(catalogue: Catalogue) -> None:
    period = {"start": "2026-10-11T09:00:00.000Z", "end": "2026-10-11T10:00:00.000Z"}
    catalogue.edit_annotation("p", "note-1", {"time_range": period}, AGENT)
    props = feature(catalogue, "note-1").properties
    assert (props.time, props.time_range.start) == (None, period["start"])
    catalogue.edit_annotation("p", "note-1", {"time": "2026-10-11T09:40:00.000Z"}, AGENT)
    props = feature(catalogue, "note-1").properties
    assert (props.time, props.time_range) == ("2026-10-11T09:40:00.000Z", None)


def test_a_change_keeps_the_annotations_provenance(catalogue: Catalogue) -> None:
    made = models.ProvRecord(
        id="op-9", kind="tool", started_at="2026-10-11T10:00:00.000Z", agent=AGENT
    )
    note = feature(catalogue, "note-1")
    with_provenance = note.model_copy(
        update={"properties": note.properties.model_copy(update={"provenance": [made]})}
    )
    catalogue.commit("p", [made], Changes(modified=[with_provenance]))
    catalogue.edit_annotation("p", "note-1", {"text": "Started"}, AGENT)
    assert [r.id for r in feature(catalogue, "note-1").properties.provenance] == ["op-9"]


def test_the_north_arrow_has_nothing_to_change(catalogue: Catalogue) -> None:
    catalogue.set_north_arrow("p", True, AGENT)
    with pytest.raises(CatalogueError, match="chart furniture"):
        catalogue.edit_annotation("p", "furniture-north-arrow", {"name": "N"}, AGENT)


def test_hiding_survives_a_change(catalogue: Catalogue) -> None:
    _, feature_id = catalogue.add_annotation("p", CIRCLE, AGENT)
    catalogue.set_hidden("p", [feature_id], True, AGENT)
    catalogue.edit_annotation("p", feature_id, {"name": "Keep out"}, AGENT)
    assert feature(catalogue, feature_id).properties.hidden is True


def test_deleting_is_one_step_and_named_sets_keep_the_rest(catalogue: Catalogue) -> None:
    _, a = catalogue.add_annotation("p", CIRCLE, AGENT)
    _, b = catalogue.add_annotation("p", {**CIRCLE, "name": "Second"}, AGENT)
    sets = [
        models.NamedSet(id="both", name="Both", feature_ids=[a, b]),
        models.NamedSet(id="one", name="One", feature_ids=[a]),
    ]
    catalogue.commit("p", [catalogue.history("p").steps()[-1].records[0]], Changes(named_sets=sets))
    catalogue.delete_annotations("p", [a], AGENT)
    assert last_note(catalogue) == "Circle 'Exclusion zone' deleted"
    plot = catalogue.read_plot("p")
    assert [(s.id, s.feature_ids) for s in plot.named_sets] == [("both", [b])]
    catalogue.history("p").undo()
    plot = catalogue.read_plot("p")
    assert {s.id for s in plot.named_sets} == {"both", "one"}
    assert a in {f.id for f in plot.features}


def test_only_annotations_are_deleted_here(catalogue: Catalogue) -> None:
    with pytest.raises(CatalogueError, match="no feature"):
        catalogue.delete_annotations("p", ["nothing"], AGENT)


def test_the_north_arrow_is_chart_furniture_added_and_removed_as_steps(
    catalogue: Catalogue,
) -> None:
    catalogue.set_north_arrow("p", True, AGENT)
    assert last_note(catalogue) == "North arrow added"
    arrow = feature(catalogue, "furniture-north-arrow")
    assert (arrow.geometry, str(arrow.properties.furniture)) == (None, "north_arrow")
    assert catalogue.set_north_arrow("p", True, AGENT) is None  # already there
    catalogue.set_north_arrow("p", False, AGENT)
    assert last_note(catalogue) == "North arrow removed"
    catalogue.history("p").undo()
    assert feature(catalogue, "furniture-north-arrow")


def test_a_change_made_elsewhere_meanwhile_is_never_overwritten(catalogue: Catalogue) -> None:
    base = catalogue.history("p").base()
    catalogue.add_annotation("p", CIRCLE, AGENT)
    with pytest.raises(Conflict):
        catalogue.add_annotation("p", {**CIRCLE, "name": "Mine"}, AGENT, base)


def test_the_plot_file_stays_plain_geojson(catalogue: Catalogue) -> None:
    catalogue.add_annotation("p", CIRCLE, AGENT)
    plot = json.loads(dump_document(DocumentKind.PLOT, catalogue.read_plot("p")))
    circle = next(f for f in plot["features"] if f["id"] == "annotation-exclusion-zone")
    # Any GeoJSON reader sees a polygon; the circle's own members are ordinary properties.
    assert circle["geometry"]["type"] == "Polygon"
    assert set(circle) == {"type", "id", "geometry", "properties"}


def test_describe_change_names_nothing_when_nothing_changed() -> None:
    circle = build(spec_from(CIRCLE), "zone")
    assert describe_change(circle, circle) is None
