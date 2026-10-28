"""TMA solutions (CAP-21; product owner, 24 Oct 2026): made from a period of bearing cuts by
form or by two clicks, as one recorded, undoable step; their residuals against the cuts,
ambiguous ones measured by the nearer bearing; cuts left out of the RMS and counted again,
each a step; legs split at a time, each dragged on its own with the later ones staying
joined; and the existing track operations (drag, split, merge) working on them unchanged."""

import json
import math
from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, TrackPath, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models
from debrief_stac import Catalogue, CatalogueError, Changes, Conflict, tma, tracks
from debrief_stac import sensors as plot_sensors
from debrief_stac.sensors import ReadCut, ReadSensor

AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("2026-10-11T09:00:00.000Z")
MINUTE = 60_000
KNOT = 1852 / 3600
OWN = Position(-4.0, 50.0)
# The target: 6 nmi on 030 from ownship at T0, steering 200 at 6 kn.
TARGET_COURSE, TARGET_KN = 200.0, 6.0
TARGET_START = destination(OWN, Quantity(30.0, "deg"), Quantity(6 * 1852.0, "m"))


def at(minutes: float) -> str:
    return format_utc(T0 + int(minutes * MINUTE))


def run(start: Position, course: float, knots: float, n: int) -> list[Position]:
    """n positions a minute apart from start on one course, as dead reckoning places them."""
    out = [start]
    for _ in range(n - 1):
        out.append(destination(out[-1], Quantity(course, "deg"), Quantity(knots * KNOT * 60, "m")))
    return out


OWN_FIXES = run(OWN, 90.0, 10.0, 61)
TARGET = run(TARGET_START, TARGET_COURSE, TARGET_KN, 61)


def true_bearing(minute: int) -> float:
    return range_bearing(OWN_FIXES[minute], TARGET[minute])[1].value


def mirrored(bearing: float, course: float = 90.0) -> float:
    return (2 * course - bearing) % 360.0


def own_track() -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id="track-blue",
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[p.longitude, p.latitude] for p in OWN_FIXES]
        ),
        properties=models.TrackProperties(
            kind="track",
            name="BLUE ONE",
            times=[at(i) for i in range(61)],
            courses=models.AngleSeries(unit="deg", values=[90.0] * 61),
            speeds=models.SpeedSeries(unit="[kn_i]", values=[10.0] * 61),
            style={"colour": "#0064bd"},
        ),
    )


def bow() -> ReadSensor:
    return ReadSensor(
        name="Bow sonar",
        host_track_id="track-blue",
        cuts=[ReadCut(T0 + m * MINUTE, true_bearing(m)) for m in range(0, 61)],
    )


def towed() -> ReadSensor:
    """A towed array: each cut's true bearing with its mirror about BLUE ONE's course, in
    alternating order, as an array cannot tell them apart."""
    cuts = []
    for m in range(0, 61, 2):
        b = true_bearing(m)
        pair = (b, mirrored(b)) if m % 4 else (mirrored(b), b)
        cuts.append(ReadCut(T0 + m * MINUTE, pair[0], ambiguous=pair[1]))
    return ReadSensor(name="Towed array", host_track_id="track-blue", colour="#8a3ffc", cuts=cuts)


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    origin = models.ProvRecord(id="op-1", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[own_track()]))
    record = models.ProvRecord(
        id="op-2", kind="import", started_at=at(0), agent=AGENT, notes=["Sensor data read"]
    )
    catalogue.add_sensors("p", [bow(), towed()], record)
    return catalogue


def plot(catalogue: Catalogue):
    return catalogue.read_plot("p")


def sensor_id(catalogue: Catalogue, name: str) -> str:
    return next(s.id for s in plot_sensors.sensors(plot(catalogue)) if s.properties.name == name)


def truth_request(catalogue: Catalogue, **more) -> dict:
    """A first guess by form on the target's own track: its range on the first cut's
    bearing, its course and its speed."""
    start_range = range_bearing(OWN, TARGET_START)[0].value
    return {
        "sensor_ids": [sensor_id(catalogue, "Bow sonar")],
        "period": {"start": at(0), "end": at(30)},
        "range": {"value": start_range, "unit": "m"},
        "course": {"value": TARGET_COURSE, "unit": "deg"},
        "speed": {"value": TARGET_KN, "unit": "[kn_i]"},
        **more,
    }


def solution_of(catalogue: Catalogue, feature_id: str) -> models.TrackFeature:
    return next(f for f in plot(catalogue).features if f.id == feature_id)


def last_record(catalogue: Catalogue) -> models.ProvRecord:
    return catalogue.history("p").steps()[-1].records[0]


# --- Making a solution ---------------------------------------------------------------------


def test_a_solution_by_form_is_one_step_rooted_in_the_period_with_fixes_at_its_cuts(
    catalogue: Catalogue,
) -> None:
    before = len(catalogue.history("p").steps())
    step, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    assert step == before + 1
    track = solution_of(catalogue, feature)
    props = track.properties
    assert props.name == "Contact 1 solution"
    assert str(props.plotting_mode) == "dr" and props.logged_positions is None
    assert props.tma.contact == "Contact 1"
    assert props.tma.sensor_ids == [sensor_id(catalogue, "Bow sonar")]
    assert props.tma.period.start == at(0) and props.tma.period.end == at(30)
    cuts = plot_sensors.cuts(plot(catalogue), sensor_id(catalogue, "Bow sonar"))[:31]
    assert props.tma.cut_ids == [c.id for c in cuts]
    # Its fixes at the cuts' times (CAP-21), on one course at one speed.
    assert props.times == [c.properties.time for c in cuts]
    assert set(props.courses.values) == {TARGET_COURSE} and set(props.speeds.values) == {6.0}
    record = last_record(catalogue)
    assert record.notes[0] == "Contact 1 solution made: 31 Bow sonar cuts 09:00:00Z–09:30:00Z"
    assert any(n.startswith("First guess: 6.00 nmi along 030.0°T") for n in record.notes)
    names = {p.name for p in record.parameters}
    assert {"contact", "period_start", "period_end", "cuts", "range", "course", "speed"} <= names
    # On the target's own track: no residual to speak of.
    report = catalogue.tma_residuals("p", feature)
    assert report["counted"] == 31 and report["without"] == 0
    assert report["rms"] < 1e-6
    assert all(abs(r["residual"]) < 1e-6 for r in report["rows"])


def test_undo_takes_a_solution_away(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    catalogue.history("p").undo()
    assert feature not in {f.id for f in plot(catalogue).features}


def test_debriefs_first_guess_is_ten_thousand_yards_across_the_bearing_at_eight_knots(
    catalogue: Catalogue,
) -> None:
    bow_id = sensor_id(catalogue, "Bow sonar")
    asked = {"sensor_ids": [bow_id], "period": {"start": at(0), "end": at(10)}}
    _, feature = catalogue.create_tma("p", asked, AGENT)
    track = solution_of(catalogue, feature)
    first = Position(*track.geometry.coordinates[0])
    distance, bearing = range_bearing(OWN, first)
    assert distance.value == pytest.approx(10_000 * 0.9144, abs=1e-3)
    assert bearing.value == pytest.approx(true_bearing(0), abs=1e-6)
    assert track.properties.courses.values[0] == pytest.approx((true_bearing(0) + 90) % 360)
    assert track.properties.speeds.values[0] == pytest.approx(8.0)
    assert "Debrief's first guess" in " ".join(last_record(catalogue).notes)


def test_contacts_are_numbered_and_names_and_colours_may_be_given(catalogue: Catalogue) -> None:
    _, first = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    _, second = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    _, third = catalogue.create_tma(
        "p", truth_request(catalogue, contact="Sierra 3", name="S3 guess", colour="#00a000"), AGENT
    )
    assert solution_of(catalogue, second).properties.tma.contact == "Contact 2"
    props = solution_of(catalogue, third).properties
    said = (props.name, props.tma.contact, props.style.colour)
    assert said == ("S3 guess", "Sierra 3", "#00a000")
    assert solution_of(catalogue, first).properties.style.colour == tma.TMA_COLOUR


def test_an_ambiguous_first_cut_starts_on_the_bearing_asked(catalogue: Catalogue) -> None:
    towed_id = sensor_id(catalogue, "Towed array")
    first_cut = plot_sensors.cuts(plot(catalogue), towed_id)[0].properties
    for which, expected in (
        ("bearing", first_cut.bearing.value),
        ("ambiguous_bearing", first_cut.ambiguous_bearing.value),
    ):
        asked = {
            "sensor_ids": [towed_id],
            "period": {"start": at(0), "end": at(20)},
            "range": {"value": 5, "unit": "[nmi_i]"},
            "course": {"value": 200, "unit": "deg"},
            "speed": {"value": 6, "unit": "[kn_i]"},
            "first_bearing": which,
        }
        _, feature = catalogue.create_tma("p", asked, AGENT)
        start = Position(*solution_of(catalogue, feature).geometry.coordinates[0])
        assert range_bearing(OWN, start)[1].value == pytest.approx(expected, abs=1e-6)


def test_a_solution_by_two_clicks_takes_each_click_onto_its_cuts_line(catalogue: Catalogue) -> None:
    # Clicks a little off the target's positions at the first and last cut, across the line.
    first_click = destination(TARGET[0], Quantity(true_bearing(0) + 90, "deg"), Quantity(300, "m"))
    last_click = destination(TARGET[30], Quantity(true_bearing(30) - 90, "deg"), Quantity(200, "m"))
    asked = {
        "sensor_ids": [sensor_id(catalogue, "Bow sonar")],
        "period": {"start": at(0), "end": at(30)},
        "first_position": [first_click.longitude, first_click.latitude],
        "last_position": [last_click.longitude, last_click.latitude],
    }
    _, feature = catalogue.create_tma("p", asked, AGENT)
    track = solution_of(catalogue, feature)
    start = Position(*track.geometry.coordinates[0])
    # On the first cut's line, level with the click: at the target's range to within metres.
    assert range_bearing(OWN, start)[1].value == pytest.approx(true_bearing(0), abs=1e-6)
    assert range_bearing(TARGET[0], start)[0].value < 5
    assert track.properties.courses.values[0] == pytest.approx(TARGET_COURSE, abs=0.05)
    assert track.properties.speeds.values[0] == pytest.approx(TARGET_KN, abs=0.01)
    assert catalogue.tma_residuals("p", feature)["rms"] < 0.05
    record = last_record(catalogue)
    assert any("First guess by two clicks" in n for n in record.notes)
    assert {"first_longitude", "last_latitude"} <= {p.name for p in record.parameters}


def test_a_click_behind_the_sensor_is_on_no_line(catalogue: Catalogue) -> None:
    behind = destination(OWN, Quantity(true_bearing(0) + 180, "deg"), Quantity(2000, "m"))
    asked = {
        "sensor_ids": [sensor_id(catalogue, "Bow sonar")],
        "period": {"start": at(0), "end": at(30)},
        "first_position": [behind.longitude, behind.latitude],
        "last_position": [TARGET[30].longitude, TARGET[30].latitude],
    }
    with pytest.raises(CatalogueError, match="first click is behind"):
        catalogue.create_tma("p", asked, AGENT)


@pytest.mark.parametrize(
    ("asked", "says"),
    [
        ({"sensor_ids": ["sensor-none"]}, "no sensor"),
        ({"cut_ids": ["cut-99999"]}, "no cut"),
        ({"sensor_ids": "BOW", "period": {"start": at(70), "end": at(80)}}, None),
        ({"period": {"start": at(0), "end": at(5)}}, "which sensor"),
        (
            {"cut_ids": ["cut-00001"], "sensor_ids": ["x"]},
            "name the cuts, or the sensors and a period, not both",
        ),
        (
            {"sensor_ids": "BOW", "range": {"value": 3, "unit": "[nmi_i]"}},
            "gives a range, a course and a speed",
        ),
    ],
)
def test_what_cannot_be_made_is_refused_saying_why(catalogue: Catalogue, asked, says) -> None:
    if asked.get("sensor_ids") == "BOW":
        asked = {**asked, "sensor_ids": [sensor_id(catalogue, "Bow sonar")]}
    with pytest.raises(CatalogueError, match=says or "no cuts there"):
        catalogue.create_tma("p", asked, AGENT)


def test_cuts_at_one_time_are_not_enough(catalogue: Catalogue) -> None:
    bow_id = sensor_id(catalogue, "Bow sonar")
    asked = {"sensor_ids": [bow_id], "period": {"start": at(3), "end": at(3)}}
    with pytest.raises(CatalogueError, match="two times or more"):
        catalogue.create_tma("p", asked, AGENT)


def test_a_change_from_a_plot_since_changed_is_refused(catalogue: Catalogue) -> None:
    base = catalogue.history("p").base()
    catalogue.create_tma("p", truth_request(catalogue), AGENT)
    with pytest.raises(Conflict):
        catalogue.create_tma("p", truth_request(catalogue), AGENT, base)


# --- Residuals --------------------------------------------------------------------------


def test_residuals_say_measured_less_calculated_and_their_rms(catalogue: Catalogue) -> None:
    # A guess 2 nmi long of the truth: residuals grow from zero as the target moves on.
    asked = truth_request(catalogue)
    asked["range"] = {"value": range_bearing(OWN, TARGET_START)[0].value + 2 * 1852, "unit": "m"}
    _, feature = catalogue.create_tma("p", asked, AGENT)
    report = catalogue.tma_residuals("p", feature)
    track = TrackPath.from_feature(solution_of(catalogue, feature))
    for row, minute in zip(report["rows"], range(31), strict=True):
        where = track.position_at(T0 + minute * MINUTE)
        calculated = range_bearing(OWN_FIXES[minute], where)[1].value
        assert row["calculated"] == pytest.approx(calculated, abs=1e-9)
        assert row["measured"] == pytest.approx(true_bearing(minute), abs=1e-9)
        expected = (row["measured"] - row["calculated"] + 180) % 360 - 180
        assert row["residual"] == pytest.approx(expected, abs=1e-9)
        assert row["used"] == "bearing" and "nearer_side" not in row
        own = OWN_FIXES[minute]
        assert row["origin"] == pytest.approx([own.longitude, own.latitude])
        assert row["sensor"] == "Bow sonar" and row["leg"] == 1
    values = [r["residual"] for r in report["rows"]]
    assert report["rms"] == pytest.approx(math.sqrt(sum(v * v for v in values) / len(values)))
    assert report["rms"] > 0.5
    assert tma.rms_text(report).startswith("RMS ") and tma.rms_text(report).endswith("over 31 cuts")


def test_an_unresolved_ambiguous_cut_is_measured_by_the_bearing_nearer_the_solution(
    catalogue: Catalogue,
) -> None:
    towed_id = sensor_id(catalogue, "Towed array")
    # Its first cut's true bearing was recorded second: the guess starts along it.
    asked = truth_request(catalogue, sensor_ids=[towed_id], first_bearing="ambiguous_bearing")
    _, feature = catalogue.create_tma("p", asked, AGENT)
    report = catalogue.tma_residuals("p", feature)
    # Fixes two minutes apart, the truth reckoned a minute at a time: within a thousandth.
    assert report["nearer_side"] == 16 and report["rms"] < 1e-3
    for row in report["rows"]:
        minute = (parse_utc(row["time"]) - T0) // MINUTE
        assert row["nearer_side"] is True
        assert row["measured"] == pytest.approx(true_bearing(minute), abs=1e-9)
        # The true bearing is whichever was recorded first or second: used says which.
        assert row["used"] == ("bearing" if minute % 4 else "ambiguous_bearing")
    # Resolved, a cut is measured by the bearing kept, however far it is from the solution.
    wrong = report["rows"][0]
    keep = "bearing" if wrong["used"] == "ambiguous_bearing" else "ambiguous_bearing"
    catalogue.resolve_ambiguity("p", {"keep": keep, "cut_ids": [wrong["id"]]}, AGENT)
    row = catalogue.tma_residuals("p", feature)["rows"][0]
    assert row["used"] == keep and "nearer_side" not in row
    assert abs(row["residual"]) > 90
    assert "1 cut is ambiguous" not in " ".join(last_record(catalogue).notes)


def test_a_cut_from_a_derived_origin_is_counted_and_used_as_it_is(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    # Splitting the host pins the cuts near the split (origin_derived), and gives the later
    # cuts a sensor with a new id: the solution still finds them by their cut ids.
    catalogue.split_track("p", "track-blue", at(15), AGENT)
    report = catalogue.tma_residuals("p", feature)
    assert report["counted"] == 31 and report["rms"] < 1e-6
    assert len({r["sensor_id"] for r in report["rows"]}) == 2
    derived = [r for r in report["rows"] if r.get("origin_derived")]
    assert report["derived_origins"] == len(derived)
    assert all(r["origin"] for r in derived)


def test_a_cut_outside_its_hosts_fixes_or_the_solutions_gives_no_residual(
    catalogue: Catalogue,
) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    # The solution sheared shorter by fixes removed is not dragged: drop its last fixes.
    report = catalogue.tma_residuals("p", feature)
    assert report["without"] == 0
    p = plot(catalogue)
    track = next(f for f in p.features if f.id == feature)
    cut = tracks._sliced(track, slice(0, 20))
    shorter = p.model_copy(update={"features": [cut if f.id == feature else f for f in p.features]})
    report = tma.residual_report(shorter, feature)
    assert report["without"] == 11 and report["counted"] == 20
    assert all("residual" not in r for r in report["rows"][20:])


# --- Cuts left out of the RMS ---------------------------------------------------------------


def test_a_wild_bearing_left_out_of_the_rms_is_one_step_and_undone(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    wild = solution_of(catalogue, feature).properties.tma.cut_ids[5]
    catalogue.tma_exclude("p", feature, [wild], True, AGENT)
    record = last_record(catalogue)
    assert record.notes[0] == "Contact 1 solution: cut at 09:05:00Z left out of the RMS"
    assert record.notes[1].startswith("RMS ")
    assert record.notes[1].endswith("over 30 cuts (was 0.0° over 31 cuts)")
    assert record.selected == [feature, wild]
    report = catalogue.tma_residuals("p", feature)
    assert report["excluded"] == 1 and report["counted"] == 30
    assert report["rows"][5]["excluded"] is True and "residual" in report["rows"][5]
    # Already left out: nothing changes.
    assert catalogue.tma_exclude("p", feature, [wild], True, AGENT) is None
    catalogue.tma_exclude("p", feature, [wild], False, AGENT)
    assert last_record(catalogue).notes[0].endswith("counted again in the RMS")
    assert catalogue.tma_residuals("p", feature)["excluded"] == 0
    catalogue.history("p").undo()
    assert solution_of(catalogue, feature).properties.tma.excluded_cut_ids == [wild]
    catalogue.history("p").undo()
    assert solution_of(catalogue, feature).properties.tma.excluded_cut_ids is None


def test_only_rooted_cuts_can_be_left_out(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    other = plot_sensors.cuts(plot(catalogue), sensor_id(catalogue, "Towed array"))[0].id
    with pytest.raises(CatalogueError, match="is not rooted in cut"):
        catalogue.tma_exclude("p", feature, [other], True, AGENT)
    with pytest.raises(CatalogueError, match="is not a TMA solution"):
        catalogue.tma_exclude("p", "track-blue", [other], True, AGENT)


def test_several_cuts_left_out_at_once(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    ids = solution_of(catalogue, feature).properties.tma.cut_ids[2:5]
    catalogue.tma_exclude("p", feature, ids, True, AGENT)
    notes = last_record(catalogue).notes
    assert notes[0] == "Contact 1 solution: 3 cuts left out of the RMS"
    assert notes[1] == "Cuts 09:02:00Z–09:04:00Z"


# --- Legs --------------------------------------------------------------------------------


def leg_request(catalogue: Catalogue) -> dict:
    return truth_request(catalogue, period={"start": at(0), "end": at(40)})


def test_a_solution_split_into_legs_stays_one_track(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", leg_request(catalogue), AGENT)
    before = solution_of(catalogue, feature)
    catalogue.tma_split_leg("p", feature, at(19.5), AGENT)
    after = solution_of(catalogue, feature)
    assert after.geometry == before.geometry
    assert after.properties.tma.leg_starts == [at(20)]
    record = last_record(catalogue)
    assert record.notes[0] == "Contact 1 solution split into legs at 09:20:00Z"
    assert record.notes[1] == "Leg 1 09:00:00Z–09:19:00Z, leg 2 09:20:00Z–09:40:00Z"
    assert tma.legs(after) == [(0, 19), (20, 40)]
    rows = catalogue.tma_residuals("p", feature)["rows"]
    assert [r["leg"] for r in rows] == [1] * 20 + [2] * 21
    with pytest.raises(CatalogueError, match="already has a leg starting at 09:20:00Z"):
        catalogue.tma_split_leg("p", feature, at(20), AGENT)
    with pytest.raises(CatalogueError, match="each leg needs at least 2"):
        catalogue.tma_split_leg("p", feature, at(40), AGENT)
    catalogue.tma_split_leg("p", feature, at(20), AGENT, join=True)
    assert solution_of(catalogue, feature).properties.tma.leg_starts is None


def three_legs(catalogue: Catalogue) -> tuple[str, models.TrackFeature]:
    _, feature = catalogue.create_tma("p", leg_request(catalogue), AGENT)
    catalogue.tma_split_leg("p", feature, at(14), AGENT)
    catalogue.tma_split_leg("p", feature, at(28), AGENT)
    return feature, solution_of(catalogue, feature)


def dr_again(track: models.TrackFeature) -> list:
    """Where dead reckoning from the first fix puts each fix, by the courses and speeds."""
    return tracks.dead_reckoned_positions(track)


def test_an_earlier_leg_dragged_leaves_the_later_legs_where_they_are(catalogue: Catalogue) -> None:
    """Each leg is independent, as in legacy (product owner, 25 Oct 2026): shearing leg 1
    moves only leg 1; legs 2 and 3, already fitted, keep every fix, course and speed; the
    join from leg 1's last fix to leg 2's first is solved again to reach it."""
    feature, before = three_legs(catalogue)
    edit = {
        "action": "shear",
        "anchor": "start",
        "distance": {"value": 1.0, "unit": "[nmi_i]"},
        "bearing": {"value": 0.0, "unit": "deg"},
        "period": {"start": at(0), "end": at(13)},
    }
    catalogue.edit_track("p", feature, edit, AGENT)
    after = solution_of(catalogue, feature)
    old, new = before.geometry.coordinates, after.geometry.coordinates
    assert new[0] == pytest.approx(old[0])  # held
    assert range_bearing(Position(*old[13]), Position(*new[13]))[0].value > 1000
    for i in range(14, 41):  # legs 2 and 3 never move
        assert new[i] == pytest.approx(old[i], abs=1e-9)
    courses, speeds = after.properties.courses.values, after.properties.speeds.values
    assert courses[14:] == before.properties.courses.values[14:]
    assert speeds[14:] == before.properties.speeds.values[14:]
    # The join re-solved: from leg 1's new last fix to leg 2's first, as dead reckoning has it.
    assert courses[13] != pytest.approx(before.properties.courses.values[13])
    for got, want in zip(dr_again(after), new, strict=True):
        assert range_bearing(Position(*got), Position(*want))[0].value < 0.01
    notes = last_record(catalogue).notes
    assert tma.LEGS_KEPT in notes
    assert not any("follow" in n for n in notes)
    assert after.properties.tma == before.properties.tma  # the tag goes with the track


def test_a_middle_leg_dragged_solves_the_joins_either_side_only(catalogue: Catalogue) -> None:
    feature, before = three_legs(catalogue)
    edit = {
        "action": "move",
        "distance": {"value": 0.5, "unit": "[nmi_i]"},
        "bearing": {"value": 90.0, "unit": "deg"},
        "period": {"start": at(14), "end": at(27)},
    }
    catalogue.edit_track("p", feature, edit, AGENT)
    after = solution_of(catalogue, feature)
    old, new = before.geometry.coordinates, after.geometry.coordinates
    for i in [*range(14), *range(28, 41)]:  # legs 1 and 3 stay where they were
        assert new[i] == pytest.approx(old[i], abs=1e-9)
    for i in range(14, 28):  # leg 2 moved half a mile east, all of it
        moved = range_bearing(Position(*old[i]), Position(*new[i]))
        assert moved[0].value == pytest.approx(926, abs=1)
        assert moved[1].value == pytest.approx(90, abs=0.1)
    before_courses = before.properties.courses.values
    courses = after.properties.courses.values
    # Only the two joins changed: leg 1's last fix, into leg 2, and leg 2's last, into leg 3.
    changed = [i for i in range(41) if courses[i] != pytest.approx(before_courses[i])]
    assert changed == [13, 27]
    for got, want in zip(dr_again(after), new, strict=True):
        assert range_bearing(Position(*got), Position(*want))[0].value < 0.01


def test_a_whole_solution_dragged_moves_every_leg(catalogue: Catalogue) -> None:
    feature, before = three_legs(catalogue)
    edit = {
        "action": "move",
        "distance": {"value": 1, "unit": "[nmi_i]"},
        "bearing": {"value": 0, "unit": "deg"},
    }
    catalogue.edit_track("p", feature, edit, AGENT)
    after = solution_of(catalogue, feature)
    for a, b in zip(before.geometry.coordinates, after.geometry.coordinates, strict=True):
        assert range_bearing(Position(*a), Position(*b))[0].value == pytest.approx(1852, abs=1)
    assert tma.LEGS_KEPT not in last_record(catalogue).notes


def test_a_solution_split_as_a_track_gives_two_solutions_each_of_its_own_cuts(
    catalogue: Catalogue,
) -> None:
    _, feature = catalogue.create_tma("p", leg_request(catalogue), AGENT)
    rooted = solution_of(catalogue, feature).properties.tma.cut_ids
    catalogue.tma_exclude("p", feature, [rooted[3], rooted[30]], True, AGENT)
    catalogue.tma_split_leg("p", feature, at(30), AGENT)
    _, (first_id, second_id) = catalogue.split_track("p", feature, at(20), AGENT)
    first = solution_of(catalogue, first_id).properties.tma
    second = solution_of(catalogue, second_id).properties.tma
    assert first.cut_ids == rooted[:20] and second.cut_ids == rooted[20:]
    assert first.excluded_cut_ids == [rooted[3]] and second.excluded_cut_ids == [rooted[30]]
    assert first.leg_starts is None and second.leg_starts == [at(30)]
    assert first.contact == second.contact == "Contact 1"
    assert "Both parts are TMA solutions of Contact 1" in " ".join(last_record(catalogue).notes)
    # Merged again: one solution, each part a leg.
    _, merged, _ = catalogue.merge_tracks("p", [first_id, second_id], AGENT)
    tag = solution_of(catalogue, merged).properties.tma
    assert tag.cut_ids == rooted and tag.leg_starts == [at(20), at(30)]
    assert tag.excluded_cut_ids == [rooted[3], rooted[30]]


def test_solutions_merged_do_not_move(catalogue: Catalogue) -> None:
    """The panel's case: 09:00–09:20 merged with 09:25–09:40, the later solution far from
    where the earlier one's course would take it. Each earlier member's last fix is aimed at
    the next one's first fix, so nothing moves (it moved 2.51 nmi before)."""
    bow = sensor_id(catalogue, "Bow sonar")
    _, early = catalogue.create_tma(
        "p", {"sensor_ids": [bow], "period": {"start": at(0), "end": at(20)}}, AGENT
    )
    _, late = catalogue.create_tma(
        "p",
        {
            "sensor_ids": [bow],
            "period": {"start": at(25), "end": at(40)},
            "range": {"value": 8000, "unit": "m"},
            "course": {"value": 10, "unit": "deg"},
            "speed": {"value": 15, "unit": "[kn_i]"},
        },
        AGENT,
    )
    before = [
        *solution_of(catalogue, early).geometry.coordinates,
        *solution_of(catalogue, late).geometry.coordinates,
    ]
    _, merged, _ = catalogue.merge_tracks("p", [early, late], AGENT)
    after = solution_of(catalogue, merged)
    assert len(after.geometry.coordinates) == len(before)
    worst = max(
        range_bearing(Position(*a), Position(*b))[0].value
        for a, b in zip(before, after.geometry.coordinates, strict=True)
    )
    assert worst < 0.01
    assert after.properties.tma.leg_starts == [at(25)]


def test_a_solution_is_not_merged_with_a_track_that_is_not_one(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    _, (_, second) = catalogue.split_track("p", "track-blue", at(45), AGENT)
    with pytest.raises(
        CatalogueError,
        match="is not a TMA solution: a solution .* is merged only with other solutions",
    ):
        catalogue.merge_tracks("p", [feature, second], AGENT)


def test_a_solutions_sensors_follow_its_cuts_when_their_track_is_split(
    catalogue: Catalogue,
) -> None:
    """Splitting BLUE ONE gives the Bow sonar's later cuts a new sensor: a solution rooted
    in them names that sensor too (its sensor_ids are those of its cuts)."""
    bow = sensor_id(catalogue, "Bow sonar")
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    catalogue.split_track("p", "track-blue", at(15), AGENT)
    plot_now = plot(catalogue)
    tag = solution_of(catalogue, feature).properties.tma
    by_id = {f.id: f for f in plot_now.features}
    assert tag.sensor_ids == list(dict.fromkeys(by_id[c].properties.sensor_id for c in tag.cut_ids))
    assert len(tag.sensor_ids) == 2 and tag.sensor_ids[0] == bow


def test_a_solution_cannot_be_plotted_over_the_ground(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    with pytest.raises(CatalogueError, match="is a TMA solution, worked out by dead reckoning"):
        catalogue.edit_track(
            "p", feature, {"action": "set_plotting_mode", "plotting_mode": "otg"}, AGENT
        )


def test_cuts_of_a_towed_array_astern_are_taken_from_the_array(catalogue: Catalogue) -> None:
    towed_id = sensor_id(catalogue, "Towed array")
    catalogue.set_array_offset("p", [towed_id], {"value": 500, "unit": "m"}, AGENT)
    _, feature = catalogue.create_tma("p", truth_request(catalogue, sensor_ids=[towed_id]), AGENT)
    row = catalogue.tma_residuals("p", feature)["rows"][3]
    minute = (parse_utc(row["time"]) - T0) // MINUTE
    # 500 m astern of BLUE ONE, steering 090: west of it.
    distance, bearing = range_bearing(OWN_FIXES[minute], Position(*row["origin"]))
    assert distance.value == pytest.approx(500, abs=0.5)
    assert bearing.value == pytest.approx(270, abs=0.1)


def test_next_contact_skips_contacts_in_use() -> None:
    def solution(contact: str):
        return models.TrackFeature(
            type="Feature",
            id=f"t-{contact}",
            geometry=models.LineStringGeometry(type="LineString", coordinates=[[0, 0], [0, 1]]),
            properties=models.TrackProperties(
                kind="track",
                name=contact,
                times=[at(0), at(1)],
                tma=models.TmaSolution(
                    contact=contact,
                    sensor_ids=[],
                    cut_ids=[],
                    period=models.TimeRange(start=at(0), end=at(1)),
                ),
            ),
        )

    plot = models.DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version="0.0.24",
        features=[solution("Contact 1"), solution("Contact 3"), solution("Sierra")],
        provenance=[],
    )
    assert tma.next_contact(plot) == "Contact 2"


# --- Hidden cuts (P1) and both bearings of an ambiguous cut (P3), 25 Oct 2026 -------------


def hide(catalogue: Catalogue, cut_ids: list[str], hidden: bool = True) -> None:
    catalogue.set_hidden("p", cut_ids, hidden, AGENT)


def test_hidden_cuts_are_rooted_but_left_out_until_shown_again(catalogue: Catalogue) -> None:
    """As legacy's default ("only plot visible data", product owner, 25 Oct 2026): a hidden
    cut is neither counted nor measured into the RMS, and the view says how many; shown
    again it counts, with nothing else to do (it was rooted all along)."""
    bow = sensor_id(catalogue, "Bow sonar")
    cuts = plot_sensors.cuts(plot(catalogue), bow)
    wild = [c.id for c in cuts[3:6]]
    hide(catalogue, wild)
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    tag = solution_of(catalogue, feature).properties.tma
    assert set(wild) <= set(tag.cut_ids)  # rooted
    assert "3 cuts hidden on the map are left out of the residuals until shown again" in (
        last_record(catalogue).notes
    )
    report = catalogue.tma_residuals("p", feature)
    assert report["hidden"] == 3
    assert report["counted"] == len(tag.cut_ids) - 3
    rows = {r["id"]: r for r in report["rows"]}
    assert all(rows[i]["hidden"] for i in wild)
    hide(catalogue, wild, False)
    shown = catalogue.tma_residuals("p", feature)
    assert "hidden" not in shown and shown["counted"] == len(tag.cut_ids)


def test_a_solution_of_hidden_cuts_alone_is_refused(catalogue: Catalogue) -> None:
    bow = sensor_id(catalogue, "Bow sonar")
    period = [
        c
        for c in plot_sensors.cuts(plot(catalogue), bow)
        if parse_utc(c.properties.time) <= T0 + 5 * MINUTE
    ]
    hide(catalogue, [c.id for c in period])
    with pytest.raises(CatalogueError, match="are all hidden on the map, so none would count"):
        catalogue.create_tma(
            "p", truth_request(catalogue, period={"start": at(0), "end": at(5)}), AGENT
        )


def test_an_unresolved_ambiguous_cut_gives_its_other_bearings_residual_not_counted(
    catalogue: Catalogue,
) -> None:
    towed_id = sensor_id(catalogue, "Towed array")
    _, feature = catalogue.create_tma("p", truth_request(catalogue, sensor_ids=[towed_id]), AGENT)
    report = catalogue.tma_residuals("p", feature)
    row = next(r for r in report["rows"] if r.get("nearer_side"))
    other = row["ambiguous_bearing"] if row["used"] == "bearing" else row["bearing"]
    assert row["other_residual"] == pytest.approx(tma.kernel.wrap(other - row["calculated"]))
    assert abs(row["other_residual"]) >= abs(row["residual"])
    counted = [r["residual"] for r in report["rows"] if "residual" in r and not r.get("excluded")]
    assert report["rms"] == pytest.approx(math.sqrt(sum(v * v for v in counted) / len(counted)))


def test_leaving_out_a_second_cut_keeps_the_first_left_out(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    rooted = solution_of(catalogue, feature).properties.tma.cut_ids
    catalogue.tma_exclude("p", feature, [rooted[7]], True, AGENT)
    catalogue.tma_exclude("p", feature, [rooted[2]], True, AGENT)
    assert solution_of(catalogue, feature).properties.tma.excluded_cut_ids == [rooted[2], rooted[7]]
    catalogue.tma_exclude("p", feature, [rooted[2]], False, AGENT)
    assert solution_of(catalogue, feature).properties.tma.excluded_cut_ids == [rooted[7]]


# --- The Outline's operations (product owner, 27 Oct 2026) --------------------------------

LEG_VECTORS = json.loads(
    (Path(__file__).parents[3] / "schemas" / "vectors" / "tma-legs.json").read_text("utf-8")
)


@pytest.mark.parametrize("case", LEG_VECTORS["cases"], ids=lambda c: c["name"])
def test_split_before_or_after_a_fix_is_held_to_the_shared_vectors(case: dict) -> None:
    times = [parse_utc(t) for t in LEG_VECTORS["fixes"]]
    starts = [parse_utc(t) for t in case["leg_starts"]]
    found = tma.split_at_fix_index(times, starts, case["index"], case["side"])
    assert found.leg == case["leg"]
    if "refused" in case:
        assert found.first is None and found.refused == case["refused"]
    else:
        assert found.refused is None
        assert format_utc(times[found.first]) == case["leg_start"]
    if "before" in case:
        assert (found.before, found.after) == (case["before"], case["after"])


def test_split_before_a_fix_starts_a_new_leg_there_and_moves_nothing(catalogue: Catalogue) -> None:
    feature, before = three_legs(catalogue)
    starts = list(before.properties.tma.leg_starts)
    catalogue.tma_split_leg("p", feature, at(7), AGENT, side="before")
    after = solution_of(catalogue, feature)
    assert after.geometry == before.geometry
    assert after.properties.courses == before.properties.courses
    assert after.properties.tma.leg_starts == sorted([at(7), *starts])
    record = last_record(catalogue)
    assert record.notes[0] == "Contact 1 solution split into legs before its fix at 09:07:00Z"
    assert {p.name: p.value for p in record.parameters}["side"] == "before"


def test_split_after_a_fix_makes_it_the_last_of_the_earlier_leg(catalogue: Catalogue) -> None:
    feature, before = three_legs(catalogue)
    catalogue.tma_split_leg("p", feature, at(20), AGENT, side="after")
    after = solution_of(catalogue, feature)
    assert after.geometry == before.geometry
    # The later legs kept where they were: 09:14 and 09:28 still start theirs.
    assert after.properties.tma.leg_starts == [at(14), at(21), at(28)]
    assert last_record(catalogue).notes[0] == (
        "Contact 1 solution split into legs after its fix at 09:20:00Z"
    )
    catalogue.history("p").undo()
    assert solution_of(catalogue, feature).properties.tma.leg_starts == [at(14), at(28)]


@pytest.mark.parametrize(
    ("minute", "side", "says"),
    [
        (14, "before", "it is already the first fix of leg 2"),
        (13, "after", "it is already the last fix of leg 1"),
        (40, "after", "it is the solution's last fix"),
        (15, "before", "leg 2 would keep 1 fix before the split and 13 fixes after it"),
        (12.5, "before", "has no fix at 09:12:30Z"),
    ],
)
def test_a_split_by_a_fix_that_cannot_be_made_says_why(
    catalogue: Catalogue, minute: float, side: str, says: str
) -> None:
    feature, _ = three_legs(catalogue)
    with pytest.raises(CatalogueError, match=says):
        catalogue.tma_split_leg("p", feature, at(minute), AGENT, side=side)


def test_hiding_cuts_names_them_as_cuts_and_says_which_solutions_they_leave(
    catalogue: Catalogue,
) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    rooted = solution_of(catalogue, feature).properties.tma.cut_ids
    hide(catalogue, rooted[2:5])
    notes = last_record(catalogue).notes
    assert notes[0] == "3 Bow sonar cuts 09:02:00Z–09:04:00Z hidden on the map"
    assert (
        notes[1] == "Contact 1 solution: 3 of its cuts left out of its residuals until shown again"
    )
    assert catalogue.tma_residuals("p", feature)["hidden"] == 3
    hide(catalogue, rooted[2:5], False)
    assert (
        last_record(catalogue).notes[1]
        == "Contact 1 solution: 3 of its cuts counted in its residuals again"
    )
    hide(catalogue, rooted[:1])
    assert last_record(catalogue).notes[0] == "Bow sonar cut at 09:00:00Z hidden on the map"


def test_deleting_cuts_is_one_step_and_solutions_drop_them(catalogue: Catalogue) -> None:
    _, feature = catalogue.create_tma("p", truth_request(catalogue), AGENT)
    tag = solution_of(catalogue, feature).properties.tma
    rooted = list(tag.cut_ids)
    catalogue.tma_exclude("p", feature, [rooted[3]], True, AGENT)
    before = solution_of(catalogue, feature)
    gone = rooted[2:5]
    catalogue.delete_cuts("p", gone, AGENT)
    now = plot(catalogue)
    assert not {f.id for f in now.features} & set(gone)
    after = solution_of(catalogue, feature)
    assert after.properties.tma.cut_ids == [i for i in rooted if i not in gone]
    assert after.properties.tma.excluded_cut_ids is None
    assert after.geometry == before.geometry
    record = last_record(catalogue)
    assert record.notes[0] == "3 Bow sonar cuts 09:02:00Z–09:04:00Z deleted"
    assert record.notes[1] == (
        "Contact 1 solution drops the 3 cuts deleted it was rooted in: rooted in 28 cuts now, "
        "its fixes where they were"
    )
    assert catalogue.tma_residuals("p", feature)["counted"] == 28
    catalogue.history("p").undo()
    assert solution_of(catalogue, feature).properties.tma.cut_ids == rooted
    assert set(gone) <= {f.id for f in plot(catalogue).features}


def test_only_cuts_are_deleted_as_cuts(catalogue: Catalogue) -> None:
    with pytest.raises(CatalogueError, match="no cut 'track-blue'"):
        catalogue.delete_cuts("p", ["track-blue"], AGENT)
    with pytest.raises(CatalogueError, match="Choose the cuts"):
        catalogue.delete_cuts("p", [], AGENT)
