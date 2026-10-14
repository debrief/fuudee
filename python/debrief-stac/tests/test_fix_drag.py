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
from debrief_stac import Catalogue, CatalogueError, Changes, ConfirmationNeeded, Conflict
from debrief_stac.tracks import (
    TrackError,
    changed_while_dr,
    fix_index,
    fix_moved,
    implied_speeds,
    merge,
    plotted_as,
    plotting_mode,
    split,
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


# --- Over the ground, or dead reckoning ----------------------------------------------


def spoiled(track: models.TrackFeature) -> models.TrackFeature:
    """The track as logged, its fixes after the first a little off the leg its courses and
    speeds make."""
    noisy = [track.geometry.coordinates[0]] + [
        [lon, lat + 0.001 * (-1) ** i]
        for i, (lon, lat) in enumerate(track.geometry.coordinates[1:])
    ]
    return track.model_copy(
        update={"geometry": track.geometry.model_copy(update={"coordinates": noisy})}
    )


@pytest.mark.parametrize(("start", "course"), PLACES)
def test_a_straight_leg_plotted_by_dead_reckoning_is_the_same_leg(start, course) -> None:
    """A leg whose recorded courses and speeds are its own: dead reckoning from its first
    fix puts every fix back on it, at any latitude and across the antimeridian, so it is
    the course held along the geodesic, exactly; over the ground again puts back the
    positions as logged."""
    before = leg(start, course, 12.0, minutes=10)
    logged = spoiled(before)
    after = plotted_as(logged, "dr")
    for old, new in zip(before.geometry.coordinates, after.geometry.coordinates, strict=True):
        assert range_bearing(Position(*old), Position(*new))[0].value < 1e-3
        assert -180 <= new[0] <= 180
    assert plotting_mode(after) == "dr"
    assert after.properties.logged_positions.coordinates == logged.geometry.coordinates
    assert after.properties.courses == before.properties.courses
    back = plotted_as(after, "otg")
    assert back.geometry.coordinates == logged.geometry.coordinates
    assert plotting_mode(back) == "otg"
    assert back.properties.logged_positions is None
    assert plotted_as(back, "otg") is None


def test_each_fix_is_placed_by_the_course_and_speed_at_the_fix_before() -> None:
    # Two legs: 10 minutes north at 6 kn, then 10 minutes east at 12 kn.
    t = leg([-4.0, 50.0], 0.0, 6.0, n=3, minutes=10)
    props = t.properties.model_copy(
        update={
            "courses": models.AngleSeries(unit="deg", values=[0.0, 90.0, 90.0]),
            "speeds": models.SpeedSeries(unit="[kn_i]", values=[6.0, 12.0, 12.0]),
        }
    )
    after = plotted_as(t.model_copy(update={"properties": props}), "dr")
    p0, p1, p2 = (Position(*c) for c in after.geometry.coordinates)
    d, b = range_bearing(p0, p1)
    assert d.value == pytest.approx(1852, abs=1e-6) and b.value == pytest.approx(0, abs=1e-9)
    d, b = range_bearing(p1, p2)
    assert d.value == pytest.approx(2 * 1852, abs=1e-6) and b.value == pytest.approx(90)


def test_what_cannot_be_plotted_so_is_refused_plainly() -> None:
    t = RED.model_copy(update={"properties": RED.properties.model_copy(update={"courses": None})})
    with pytest.raises(TrackError, match="does not record both courses and speeds"):
        plotted_as(t, "dr")
    # A legacy plot's DR leg saved only the positions dead reckoning worked out.
    legacy = RED.model_copy(
        update={"properties": RED.properties.model_copy(update={"plotting_mode": "dr"})}
    )
    with pytest.raises(TrackError, match="positions as logged are not in the plot"):
        plotted_as(legacy, "otg")


def test_split_and_merge_keep_the_mode_and_the_positions_as_logged() -> None:
    dr = plotted_as(spoiled(RED), "dr")
    first, second = split(dr, parse_utc(at(3)), ("RED ONE (1)", "RED ONE (2)"), "track-red-2")
    assert (
        first.properties.logged_positions.coordinates
        == dr.properties.logged_positions.coordinates[:3]
    )
    assert plotting_mode(second) == "dr"
    merged, _ = merge([first, second], "RED ONE")
    assert merged.properties.logged_positions == dr.properties.logged_positions
    with pytest.raises(TrackError, match="plotted differently"):
        merge([first, plotted_as(second, "otg")])


def test_changing_the_mode_is_one_step_undone_like_any(catalogue) -> None:
    catalogue.commit(
        "p",
        [models.ProvRecord(id="op-2", kind="edit", started_at=at(9), agent=AGENT)],
        Changes(modified=[spoiled(RED)]),
    )
    logged = red(catalogue).geometry.coordinates
    edit = {"action": "set_plotting_mode", "plotting_mode": "dr"}
    catalogue.edit_track("p", "track-red", edit, AGENT)
    record = last_record(catalogue)
    assert record.notes[:2] == [
        "RED ONE plotted by dead reckoning",
        "From its first fix, at 09:30:00Z, by each fix's recorded course and speed; "
        "its positions as logged are kept",
    ]
    assert record.notes[2].startswith("The most a fix moved: ")
    assert parameters(record) == {"plotting_mode": "dr"}
    for old, new in zip(RED.geometry.coordinates, red(catalogue).geometry.coordinates, strict=True):
        assert range_bearing(Position(*old), Position(*new))[0].value < 1e-3
    valid(catalogue)
    # Already so: nothing recorded. Over the ground again: the positions as logged.
    assert catalogue.edit_track("p", "track-red", edit, AGENT) is None
    catalogue.edit_track("p", "track-red", {**edit, "plotting_mode": "otg"}, AGENT)
    assert last_record(catalogue).notes[:2] == [
        "RED ONE plotted over the ground",
        "Each fix where it was logged",
    ]
    assert red(catalogue).geometry.coordinates == logged
    catalogue.history("p").undo()
    assert plotting_mode(red(catalogue)) == "dr"
    catalogue.history("p").undo()
    assert red(catalogue).geometry.coordinates == logged
    assert red(catalogue).properties.plotting_mode is None
    with pytest.raises(CatalogueError, match="a change of plotting mode has only the mode"):
        catalogue.edit_track(
            "p", "track-red", {**edit, "period": {"start": at(1), "end": at(2)}}, AGENT
        )


# --- Over the ground again after a change made while plotted by dead reckoning ----------
# Decision, product owner, 14 Oct 2026: the positions as logged come back, so that change is
# lost; the analyst is warned and confirms first (discard_dr_changes), still one step.

AS_DR = {"action": "set_plotting_mode", "plotting_mode": "dr"}
AS_OTG = {"action": "set_plotting_mode", "plotting_mode": "otg"}


@pytest.mark.parametrize(
    "change",
    [
        pytest.param(
            {
                "action": "move",
                "distance": {"value": 2, "unit": "[nmi_i]"},
                "bearing": {"value": 90, "unit": "deg"},
            },
            id="moved",
        ),
        pytest.param(
            {
                "action": "move_fix",
                "fix_time": at(3),
                "distance": {"value": 0.3, "unit": "[nmi_i]"},
                "bearing": {"value": 200, "unit": "deg"},
            },
            id="a-fix-moved",
        ),
        pytest.param(
            {
                "action": "move_fix",
                "fix_time": at(0),
                "distance": {"value": 0.3, "unit": "[nmi_i]"},
                "bearing": {"value": 200, "unit": "deg"},
            },
            id="the-first-fix-moved",
        ),
    ],
)
def test_over_the_ground_after_a_change_made_while_dr_is_confirmed_first(catalogue, change) -> None:
    catalogue.edit_track("p", "track-red", AS_DR, AGENT)
    catalogue.edit_track("p", "track-red", change, AGENT)
    changed = red(catalogue)
    count = len(catalogue.history("p").steps())
    with pytest.raises(ConfirmationNeeded) as refused:
        catalogue.edit_track("p", "track-red", AS_OTG, AGENT)
    said = str(refused.value)
    assert said.startswith("RED ONE was changed while plotted by dead reckoning (its fix at ")
    assert "the changes made while plotted by dead reckoning are lost" in said
    assert len(catalogue.history("p").steps()) == count
    assert red(catalogue) == changed
    # Confirmed: one step, saying so; the positions as logged back; undone like any.
    catalogue.edit_track("p", "track-red", {**AS_OTG, "discard_dr_changes": True}, AGENT)
    assert len(catalogue.history("p").steps()) == count + 1
    assert last_record(catalogue).notes[:2] == [
        "RED ONE plotted over the ground",
        "Changes made while plotted by dead reckoning discarded",
    ]
    assert red(catalogue).geometry.coordinates == RED.geometry.coordinates
    catalogue.history("p").undo()
    assert red(catalogue) == changed


def test_over_the_ground_unchanged_while_dr_asks_nothing(catalogue) -> None:
    """Plotted by dead reckoning and saved, nothing changed since: no warning, however the
    positions were rounded on the way."""
    catalogue.edit_track("p", "track-red", AS_DR, AGENT)
    assert changed_while_dr(red(catalogue)) is None
    catalogue.edit_track("p", "track-red", AS_OTG, AGENT)
    assert last_record(catalogue).notes[1] == "Each fix where it was logged"
    with pytest.raises(CatalogueError, match="only plotting a track over the ground discards"):
        catalogue.edit_track("p", "track-red", {**AS_DR, "discard_dr_changes": True}, AGENT)
