"""A single fix moved by hand, and a track plotted by dead reckoning (CAP-01, EXT-14):
geodesically right far north and across the antimeridian, each one step in the plot's
history with its parameters, undone like any change, marks kept with their fixes, and
never made over a change made elsewhere (SUB-19, SUB-21, SUB-28)."""

from pathlib import Path

import pytest

from debrief_kernel.geodesy import WGS84, Position, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import DocumentKind, dump_document, load_document, models
from debrief_stac import Catalogue, CatalogueError, Changes, Conflict
from debrief_stac.tracks import (
    TrackError,
    dead_reckoned,
    fix_index,
    fix_moved,
    implied_speeds,
)

AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("2026-10-11T09:30:00.000Z")
MINUTE = 60_000
KNOT = 1852 / 3600


def at(minutes: float) -> str:
    return format_utc(T0 + int(minutes * MINUTE))


def leg(
    start: list[float], course: float, knots: float, n: int = 6, minutes: float = 1
) -> models.TrackFeature:
    """A straight leg at a steady speed: fixes along the geodesic from start at course,
    `minutes` apart, each with the geodesic's own course there and the speed recorded."""
    line = WGS84.Line(start[1], start[0], course)
    positions, courses = [], []
    for i in range(n):
        p = line.Position(knots * KNOT * minutes * 60 * i, WGS84.STANDARD | WGS84.LONG_UNROLL)
        positions.append([(p["lon2"] + 540) % 360 - 180, p["lat2"]])
        courses.append(p["azi2"] % 360)
    return models.TrackFeature(
        type="Feature",
        id="track-red",
        geometry=models.LineStringGeometry(type="LineString", coordinates=positions),
        properties=models.TrackProperties(
            kind="track",
            name="RED ONE",
            times=[at(minutes * i) for i in range(n)],
            speeds=models.SpeedSeries(unit="[kn_i]", values=[knots] * n),
            courses=models.AngleSeries(unit="deg", values=courses),
            style=models.TrackStyle(colour="#e01c3e"),
            fix_marks=[models.FixMark(time=at(minutes), label="Turn 1")],
        ),
    )


RED = leg([-75.5, 37.1], 45.0, 12.0)

PLACES = [
    pytest.param([-75.5, 37.1], 45.0, id="mid-latitude"),
    # Far north, where the meridians close fast.
    pytest.param([20.0, 85.0], 60.0, id="far-north"),
    # Across the antimeridian.
    pytest.param([179.99, -30.0], 80.0, id="antimeridian"),
]


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    origin = models.ProvRecord(id="op-1", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[RED]))
    return catalogue


def red(catalogue: Catalogue) -> models.TrackFeature:
    return next(f for f in catalogue.read_plot("p").features if f.id == "track-red")


def last_record(catalogue: Catalogue) -> models.ProvRecord:
    return catalogue.history("p").steps()[-1].records[0]


def parameters(record: models.ProvRecord) -> dict:
    return {
        p.name: (p.value.value, str(p.value.unit)) if hasattr(p.value, "unit") else p.value
        for p in record.parameters or []
    }


def valid(catalogue: Catalogue) -> None:
    load_document(DocumentKind.PLOT, dump_document(DocumentKind.PLOT, catalogue.read_plot("p")))


# --- One fix moved --------------------------------------------------------------------


@pytest.mark.parametrize(("start", "course"), PLACES)
def test_only_the_fix_moves_exactly_the_range_and_bearing_and_nothing_else_changes(
    start, course
) -> None:
    before = leg(start, course, 12.0)
    here = Position(*before.geometry.coordinates[2])
    to = destination(here, Quantity(200, "deg"), Quantity(0.42, "[nmi_i]"))
    after = fix_moved(before, 2, to)
    distance, bearing = range_bearing(here, Position(*after.geometry.coordinates[2]))
    assert distance.value == pytest.approx(0.42 * 1852, abs=1e-6)
    assert (bearing.value - 200 + 540) % 360 - 180 == pytest.approx(0, abs=1e-6)
    assert -180 <= after.geometry.coordinates[2][0] <= 180
    for i in (0, 1, 3, 4, 5):
        assert after.geometry.coordinates[i] == before.geometry.coordinates[i]
    # Its time, its recorded course and speed, and its mark stay.
    assert after.properties.times == before.properties.times
    assert after.properties.courses == before.properties.courses
    assert after.properties.speeds == before.properties.speeds
    assert after.properties.fix_marks == before.properties.fix_marks


def test_a_fix_is_found_by_its_time_the_first_of_two_at_one_time() -> None:
    times = [*RED.properties.times]
    times[3] = times[2]
    twin = RED.model_copy(update={"properties": RED.properties.model_copy(update={"times": times})})
    assert fix_index(twin, at(2)) == 2
    with pytest.raises(TrackError, match="RED ONE has no fix at 09:30:30Z"):
        fix_index(RED, at(0.5))
    with pytest.raises(TrackError, match="is not a time"):
        fix_index(RED, "half past nine")


def test_the_speeds_the_positions_imply_in_and_out_of_the_fix() -> None:
    into, out = implied_speeds(RED, 2)
    assert into.other == 1 and out.other == 3
    assert into.speed == pytest.approx(12 * KNOT, rel=1e-9)
    assert out.speed == pytest.approx(12 * KNOT, rel=1e-9)
    # At the ends, only one way.
    assert implied_speeds(RED, 0)[0] is None
    assert implied_speeds(RED, 5)[1] is None


def test_moving_a_fix_is_one_step_saying_where_it_went_and_the_speeds(catalogue) -> None:
    steps = len(catalogue.history("p").steps())
    edit = {
        "action": "move_fix",
        "fix_time": at(1),
        "distance": {"value": 0.42, "unit": "[nmi_i]"},
        "bearing": {"value": 45, "unit": "deg"},
    }
    assert catalogue.edit_track("p", "track-red", edit, AGENT) == steps + 1
    record = last_record(catalogue)
    assert record.notes[0] == "RED ONE fix at 09:31:00Z moved 0.42 nmi 045.0°T"
    assert record.notes[1].startswith("Now at 37°")
    # On a leg at 12 kn, a fix pushed 0.42 nmi ahead in a minute is reached at 37.2 kn.
    assert record.notes[2] == "Speed to reach it from 09:30:00Z: 37.2 kn (was 12.0 kn)"
    assert record.notes[3] == "Speed on to 09:32:00Z: 13.2 kn (was 12.0 kn)"
    assert record.notes[4] == "Its recorded course and speed are kept"
    assert record.selected == ["track-red"]
    said = parameters(record)
    assert said["fix_time"] == at(1)
    assert said["distance"] == (0.42, "[nmi_i]") and said["bearing"] == (45.0, "deg")
    after = red(catalogue)
    assert [said["longitude"], said["latitude"]] == after.geometry.coordinates[1]
    # The mark on the fix stays with it, by its time.
    assert after.properties.fix_marks == RED.properties.fix_marks
    valid(catalogue)
    # Undo puts it back exactly; redo moves it again.
    catalogue.history("p").undo()
    assert red(catalogue).geometry.coordinates == RED.geometry.coordinates
    catalogue.history("p").redo()
    assert red(catalogue).geometry == after.geometry


def test_a_fix_put_at_a_position_is_named_by_how_far_and_which_way_it_went(catalogue) -> None:
    here = Position(*RED.geometry.coordinates[4])
    to = destination(here, Quantity(270, "deg"), Quantity(1, "km"))
    edit = {"action": "move_fix", "fix_time": at(4), "position": [to.longitude, to.latitude]}
    catalogue.edit_track("p", "track-red", edit, AGENT)
    record = last_record(catalogue)
    assert record.notes[0] == "RED ONE fix at 09:34:00Z moved 0.54 nmi 270.0°T"
    assert red(catalogue).geometry.coordinates[4] == [to.longitude, to.latitude]
    said = parameters(record)
    assert said["distance"] == (0.54, "[nmi_i]")
    assert said["bearing"] == (270.0, "deg")
    valid(catalogue)


def test_the_last_fix_moved_says_only_the_speed_to_reach_it(catalogue) -> None:
    edit = {
        "action": "move_fix",
        "fix_time": at(5),
        "distance": {"value": 100, "unit": "m"},
        "bearing": {"value": 0, "unit": "deg"},
    }
    catalogue.edit_track("p", "track-red", edit, AGENT)
    notes = last_record(catalogue).notes
    assert notes[0] == "RED ONE fix at 09:35:00Z moved 0.05 nmi 000.0°T"
    assert notes[2].startswith("Speed to reach it from 09:34:00Z:")
    assert notes[3] == "Its recorded course and speed are kept"


def test_moving_a_fix_that_cannot_be_moved_says_so_and_changes_nothing(catalogue) -> None:
    steps = len(catalogue.history("p").steps())
    with pytest.raises(CatalogueError, match="moving a fix needs the fix's time"):
        catalogue.edit_track("p", "track-red", {"action": "move_fix", "position": [0, 0]}, AGENT)
    with pytest.raises(CatalogueError, match="a distance and a bearing, or a position"):
        catalogue.edit_track("p", "track-red", {"action": "move_fix", "fix_time": at(1)}, AGENT)
    with pytest.raises(CatalogueError, match="RED ONE has no fix at 09:30:30Z"):
        catalogue.edit_track(
            "p", "track-red", {"action": "move_fix", "fix_time": at(0.5), "position": [0, 0]}, AGENT
        )
    # Put where it already is: nothing recorded.
    here = RED.geometry.coordinates[2]
    assert (
        catalogue.edit_track(
            "p", "track-red", {"action": "move_fix", "fix_time": at(2), "position": here}, AGENT
        )
        is None
    )
    assert len(catalogue.history("p").steps()) == steps


def test_a_fix_moved_over_a_change_made_elsewhere_is_refused(catalogue) -> None:
    base = catalogue.history("p").base()
    edit = {"action": "move_fix", "fix_time": at(2), "position": [-75.4, 37.2]}
    colleague = models.AgentRef(kind="person", name="a colleague")
    catalogue.edit_track("p", "track-red", edit, colleague)
    with pytest.raises(Conflict):
        catalogue.edit_track("p", "track-red", {**edit, "fix_time": at(3)}, AGENT, base)


# --- Dead reckoning -------------------------------------------------------------------


@pytest.mark.parametrize(("start", "course"), PLACES)
def test_a_straight_leg_plotted_by_dead_reckoning_is_the_same_leg(start, course) -> None:
    """A leg whose recorded courses and speeds are its own: dead reckoning from its
    first fix puts every fix back where it was, at any latitude and across the
    antimeridian, so it is the course held along the geodesic, exactly."""
    before = leg(start, course, 12.0, minutes=10)
    # Spoil the positions after the first; dead reckoning puts them back.
    noisy = [before.geometry.coordinates[0]] + [
        [lon, lat + 0.001 * (-1) ** i]
        for i, (lon, lat) in enumerate(before.geometry.coordinates[1:])
    ]
    spoiled = before.model_copy(
        update={"geometry": before.geometry.model_copy(update={"coordinates": noisy})}
    )
    after = dead_reckoned(spoiled, list(range(6)))
    for old, new in zip(before.geometry.coordinates, after.geometry.coordinates, strict=True):
        assert range_bearing(Position(*old), Position(*new))[0].value < 1e-3
        assert -180 <= new[0] <= 180
    assert after.properties.courses == before.properties.courses
    assert after.properties.speeds == before.properties.speeds


def test_each_fix_is_placed_by_the_course_and_speed_at_the_fix_before() -> None:
    # Two legs: 10 minutes north at 6 kn, then 10 minutes east at 12 kn.
    t = leg([-4.0, 50.0], 0.0, 6.0, n=3, minutes=10)
    props = t.properties.model_copy(
        update={
            "courses": models.AngleSeries(unit="deg", values=[0.0, 90.0, 90.0]),
            "speeds": models.SpeedSeries(unit="[kn_i]", values=[6.0, 12.0, 12.0]),
        }
    )
    t = t.model_copy(update={"properties": props})
    after = dead_reckoned(t, [0, 1, 2])
    p0, p1, p2 = (Position(*c) for c in after.geometry.coordinates)
    d, b = range_bearing(p0, p1)
    assert d.value == pytest.approx(1852, abs=1e-6) and b.value == pytest.approx(0, abs=1e-9)
    d, b = range_bearing(p1, p2)
    assert d.value == pytest.approx(2 * 1852, abs=1e-6) and b.value == pytest.approx(90)


def test_dead_reckoning_needs_courses_and_speeds() -> None:
    t = RED.model_copy(update={"properties": RED.properties.model_copy(update={"courses": None})})
    with pytest.raises(TrackError, match="does not record both courses and speeds"):
        dead_reckoned(t, list(range(6)))


def test_dead_reckoning_is_one_step_and_a_period_leaves_the_rest(catalogue) -> None:
    # The track as logged runs north of where its courses and speeds take it.
    drifted = [[lon, lat + 0.0005 * i] for i, (lon, lat) in enumerate(RED.geometry.coordinates)]
    catalogue.commit(
        "p",
        [models.ProvRecord(id="op-2", kind="edit", started_at=at(9), agent=AGENT)],
        Changes(
            modified=[
                RED.model_copy(
                    update={"geometry": RED.geometry.model_copy(update={"coordinates": drifted})}
                )
            ]
        ),
    )
    edit = {"action": "dead_reckon", "period": {"start": at(2), "end": at(4)}}
    catalogue.edit_track("p", "track-red", edit, AGENT)
    record = last_record(catalogue)
    assert record.notes[:2] == [
        "RED ONE part plotted by dead reckoning",
        "From its fix at 09:32:00Z, by each fix's recorded course and speed",
    ]
    assert record.notes[2].startswith("The most a fix moved: ")
    assert record.notes[2].endswith(", at 09:34:00Z")
    assert record.notes[3] == "Only the fixes from 09:32:00Z to 09:34:00Z"
    after = red(catalogue).geometry.coordinates
    assert [i for i in range(6) if after[i] != drifted[i]] == [3, 4]
    valid(catalogue)
    catalogue.history("p").undo()
    assert red(catalogue).geometry.coordinates == drifted
    # The whole track: back on the leg its courses and speeds make.
    catalogue.edit_track("p", "track-red", {"action": "dead_reckon"}, AGENT)
    assert last_record(catalogue).notes[0] == "RED ONE plotted by dead reckoning"
    for old, new in zip(RED.geometry.coordinates, red(catalogue).geometry.coordinates, strict=True):
        assert range_bearing(Position(*old), Position(*new))[0].value < 1e-3
    # Already as dead reckoning plots it: nothing recorded.
    assert catalogue.edit_track("p", "track-red", {"action": "dead_reckon"}, AGENT) is None
