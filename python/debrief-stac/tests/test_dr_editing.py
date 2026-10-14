"""Editing a track plotted by dead reckoning (CAP-01; decision, product owner, 14 Oct 2026).

On a DR track the truth is its origin (the first fix's position) and each fix's course and
speed; positions are always worked out from them. A move of the whole track moves the
origin; every other edit changes courses and speeds, and the fixes after follow on. Checked
geodesically at mid-latitude, far north and across the antimeridian; each edit is one step,
undone and redone like any, its hash chain intact; the positions, courses and speeds as
logged are never changed by an edit. The shared vectors (schemas/vectors/dead-reckoning.json)
hold the same operations for the map's preview (vscode/webview/trackedit.ts) to match."""

import json
import math
import os
from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import DocumentKind, dump_document, load_document, models
from debrief_stac import Catalogue, Changes, ConfirmationNeeded
from debrief_stac.reckoning import (
    Reckoning,
    dr_fix_moved,
    dr_moved,
    dr_rotated,
    dr_sheared,
    dr_stretched,
    find_dr_jumps,
)
from debrief_stac.tracks import (
    TrackError,
    changed_while_dr,
    dead_reckoned_positions,
    merge,
    plotted_as,
    split,
)

AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("2026-10-11T09:30:00.000Z")
MINUTE = 60_000
KNOT = 1852 / 3600
ROOT = Path(__file__).resolve().parents[3]
VECTORS = ROOT / "schemas" / "vectors" / "dead-reckoning.json"


def at(minutes: float) -> str:
    return format_utc(T0 + int(minutes * MINUTE))


def logged_track(
    start: list[float], legs: list[tuple[float, float, int]], track_id: str = "track-red"
) -> models.TrackFeature:
    """A track logged over the ground, a fix a minute: legs of (course, knots, fixes), each
    fix's logged course and speed the leg's, its positions a little off where they take it
    (a GPS's noise), so dead reckoning moves them."""
    courses, speeds = [], []
    for course, knots, n in legs:
        courses += [course] * n
        speeds += [knots] * n
    positions = [list(start)]
    for i in range(1, len(courses)):
        p = destination(
            Position(*positions[-1]),
            Quantity(courses[i - 1], "deg"),
            Quantity(60 * speeds[i - 1] * KNOT, "m"),
        )
        positions.append([p.longitude, p.latitude])
    noisy = [positions[0]] + [
        [lon, lat + 0.0002 * (-1) ** i] for i, (lon, lat) in enumerate(positions[1:])
    ]
    n = len(courses)
    return models.TrackFeature(
        type="Feature",
        id=track_id,
        geometry=models.LineStringGeometry(type="LineString", coordinates=noisy),
        properties=models.TrackProperties(
            kind="track",
            name="RED ONE",
            times=[at(i) for i in range(n)],
            speeds=models.SpeedSeries(unit="[kn_i]", values=speeds),
            courses=models.AngleSeries(unit="deg", values=courses),
            style=models.TrackStyle(colour="#e01c3e"),
            fix_marks=[models.FixMark(time=at(2), label="Turn 1")],
        ),
    )


def dr(start=(-75.5, 37.1), legs=((45.0, 12.0, 4), (110.0, 10.0, 4))) -> models.TrackFeature:
    return plotted_as(logged_track(list(start), list(legs)), "dr")


PLACES = [
    pytest.param((-75.5, 37.1), id="mid-latitude"),
    pytest.param((20.0, 85.0), id="far-north"),
    pytest.param((179.99, -30.0), id="antimeridian"),
]


def metres(a, b) -> float:
    return range_bearing(Position(*a), Position(*b))[0].value


def legs_of(track: models.TrackFeature) -> list[tuple[float, float]]:
    c = track.geometry.coordinates
    out = []
    for a, b in zip(c, c[1:], strict=False):
        d, brg = range_bearing(Position(*a), Position(*b))
        out.append((d.value, brg.value))
    return out


def is_dead_reckoned(track: models.TrackFeature) -> None:
    """Its positions are exactly what dead reckoning from its first fix by its courses and
    speeds makes."""
    for a, b in zip(dead_reckoned_positions(track), track.geometry.coordinates, strict=True):
        assert metres(a, b) < 1e-6
    for p in track.geometry.coordinates:
        assert -180 <= p[0] <= 180


def logged_untouched(before: models.TrackFeature, after: models.TrackFeature) -> None:
    for name in ("logged_positions", "logged_courses", "logged_speeds"):
        assert getattr(after.properties, name) == getattr(before.properties, name)


# --- A single fix dragged: the leg into it ------------------------------------------------


@pytest.mark.parametrize("start", PLACES)
def test_a_fix_dragged_changes_the_leg_into_it_and_later_fixes_follow(start) -> None:
    track = dr(start)
    before = track.geometry.coordinates
    to = destination(Position(*before[5]), Quantity(30, "deg"), Quantity(500, "m"))
    after, leg = dr_fix_moved(track, 5, to)
    now = after.geometry.coordinates
    assert metres(now[5], [to.longitude, to.latitude]) < 1e-3  # lands where it was dropped
    assert now[:5] == before[:5]  # the fixes before stay exactly
    # The leg into it is the geodesic from the fix before to where it was dropped.
    d, b = range_bearing(Position(*before[4]), to)
    assert leg.course == pytest.approx(b.value, abs=1e-9)
    assert leg.speed == pytest.approx(d.value / 60, abs=1e-9)
    assert after.properties.courses.values[4] == pytest.approx(b.value, abs=1e-9)
    # Every other course and speed is as it was; each later leg is the same leg, from the
    # fix's new place, so the later fixes follow.
    others = [i for i in range(8) if i != 4]
    for i in others:
        assert after.properties.courses.values[i] == track.properties.courses.values[i]
        assert after.properties.speeds.values[i] == track.properties.speeds.values[i]
    for (d0, b0), (d1, b1) in zip(legs_of(track)[5:], legs_of(after)[5:], strict=True):
        assert d1 == pytest.approx(d0, abs=1e-6)
        assert b1 == pytest.approx(b0, abs=1e-6)
    is_dead_reckoned(after)
    logged_untouched(track, after)
    assert after.properties.fix_marks == track.properties.fix_marks


def test_the_first_fix_dragged_moves_where_dead_reckoning_starts() -> None:
    track = dr()
    to = Position(-75.49, 37.11)
    after, leg = dr_fix_moved(track, 0, to)
    assert leg is None
    assert after.geometry.coordinates[0] == [to.longitude, to.latitude]
    assert after.properties.courses == track.properties.courses
    assert after.properties.speeds == track.properties.speeds
    for (d0, b0), (d1, b1) in zip(legs_of(track), legs_of(after), strict=True):
        assert d1 == pytest.approx(d0, abs=1e-6)
        assert b1 == pytest.approx(b0, abs=0.01)  # a mile away, the meridians barely turn
    is_dead_reckoned(after)


def test_a_fix_at_the_time_of_the_fix_before_cannot_be_put_elsewhere() -> None:
    track = dr()
    props = track.properties
    times = list(props.times)
    times[3] = times[2]
    same = track.model_copy(update={"properties": props.model_copy(update={"times": times})})
    with pytest.raises(TrackError, match="same time as the fix before it"):
        dr_fix_moved(same, 3, Position(-75.4, 37.2))
    assert dr_fix_moved(track, 3, Position(*track.geometry.coordinates[3])) is None


# --- A move: the origin, or the leg into the period ------------------------------------


@pytest.mark.parametrize("start", PLACES)
def test_a_whole_track_moved_moves_its_origin_and_keeps_courses_and_speeds(start) -> None:
    track = dr(start)
    after, leg = dr_moved(track, Quantity(2, "[nmi_i]"), Quantity(90, "deg"), list(range(8)))
    assert leg is None
    first = destination(
        Position(*track.geometry.coordinates[0]), Quantity(90, "deg"), Quantity(2, "[nmi_i]")
    )
    assert metres(after.geometry.coordinates[0], [first.longitude, first.latitude]) < 1e-6
    assert after.properties.courses == track.properties.courses
    assert after.properties.speeds == track.properties.speeds
    # Each fix about 2 nmi east of where it was: exactly so at the first.
    for a, b in zip(track.geometry.coordinates, after.geometry.coordinates, strict=True):
        assert metres(a, b) == pytest.approx(3704, abs=60)
    is_dead_reckoned(after)
    logged_untouched(track, after)


def test_a_period_moved_changes_the_leg_into_it() -> None:
    track = dr()
    before = track.geometry.coordinates
    after, leg = dr_moved(track, Quantity(0.5, "[nmi_i]"), Quantity(0, "deg"), [3, 4, 5])
    target = destination(Position(*before[3]), Quantity(0, "deg"), Quantity(0.5, "[nmi_i]"))
    assert leg.index == 3
    assert metres(after.geometry.coordinates[3], [target.longitude, target.latitude]) < 1e-3
    assert after.geometry.coordinates[:3] == before[:3]
    # The fixes after the period follow on: no jump where it meets the rest.
    for (d0, _), (d1, _) in zip(legs_of(track)[3:], legs_of(after)[3:], strict=True):
        assert d1 == pytest.approx(d0, abs=1e-6)


# --- Rotation: courses turned --------------------------------------------------------


@pytest.mark.parametrize("start", PLACES)
def test_a_whole_track_rotated_turns_every_course_and_its_origin_about_the_pivot(start) -> None:
    track = dr(start)
    pivot = Position(*track.geometry.coordinates[3])
    after = dr_rotated(track, pivot, Quantity(20, "deg"), list(range(8)))
    for a, b in zip(track.properties.courses.values, after.properties.courses.values, strict=True):
        assert (b - a) % 360 == pytest.approx(20, abs=1e-9)
    assert after.properties.speeds == track.properties.speeds
    # The origin keeps its range from the pivot, its bearing from it turned.
    d0, b0 = range_bearing(pivot, Position(*track.geometry.coordinates[0]))
    d1, b1 = range_bearing(pivot, Position(*after.geometry.coordinates[0]))
    assert d1.value == pytest.approx(d0.value, abs=1e-6)
    assert (b1.value - b0.value) % 360 == pytest.approx(20, abs=1e-6)
    # The pivot fix stays put, as near as dead reckoning on a curved earth allows.
    assert metres(after.geometry.coordinates[3], track.geometry.coordinates[3]) < 25
    is_dead_reckoned(after)


def test_a_period_rotated_turns_its_courses_about_its_first_fix_and_the_rest_follows() -> None:
    track = dr()
    after = dr_rotated(track, Position(0, 0), Quantity(-15, "deg"), [2, 3, 4])
    c0, c1 = track.properties.courses.values, after.properties.courses.values
    assert [round((b - a) % 360, 9) for a, b in zip(c0, c1, strict=True)] == [
        0,
        0,
        345,
        345,
        345,
        0,
        0,
        0,
    ]
    assert after.geometry.coordinates[:3] == track.geometry.coordinates[:3]
    # After the period, each leg is as it was: the fixes follow on.
    for (d0, b0), (d1, b1) in zip(legs_of(track)[5:], legs_of(after)[5:], strict=True):
        assert d1 == pytest.approx(d0, abs=1e-6) and b1 == pytest.approx(b0, abs=1e-6)


# --- Stretch: speeds scaled ----------------------------------------------------------


def test_a_stretch_scales_the_speeds_held_at_the_start() -> None:
    track = dr()
    after = dr_stretched(track, list(range(8)), "start", 1.25)
    for a, b in zip(track.properties.speeds.values, after.properties.speeds.values, strict=True):
        assert b == pytest.approx(a * 1.25)
    assert after.properties.courses == track.properties.courses
    assert after.geometry.coordinates[0] == track.geometry.coordinates[0]
    is_dead_reckoned(after)


@pytest.mark.parametrize("start", PLACES)
def test_a_stretch_held_at_the_end_keeps_the_end_where_it_is(start) -> None:
    track = dr(start)
    after = dr_stretched(track, [2, 3, 4, 5, 6], "end", 0.8)
    assert metres(after.geometry.coordinates[6], track.geometry.coordinates[6]) < 1e-3
    assert after.geometry.coordinates[:2] == track.geometry.coordinates[:2]
    for i in (2, 3, 4, 5, 6):
        assert after.properties.speeds.values[i] == pytest.approx(
            track.properties.speeds.values[i] * 0.8
        )
    is_dead_reckoned(after)


# --- Shear: one set and drift --------------------------------------------------------


@pytest.mark.parametrize("start", PLACES)
def test_a_shear_puts_the_end_where_dragged_by_one_set_added_to_every_leg(start) -> None:
    track = dr(start)
    end = Position(*track.geometry.coordinates[7])
    to = destination(end, Quantity(200, "deg"), Quantity(0.6, "[nmi_i]"))
    after, (east, north) = dr_sheared(track, list(range(8)), "start", to)
    assert metres(after.geometry.coordinates[7], [to.longitude, to.latitude]) < 1e-3
    assert after.geometry.coordinates[0] == track.geometry.coordinates[0]
    # Every leg's velocity changed by the same (east, north): the turn is kept.
    r0, r1 = Reckoning.of(track), Reckoning.of(after)
    for i in range(8):
        v0 = (
            r0.speeds[i] * math.sin(math.radians(r0.courses[i])),
            r0.speeds[i] * math.cos(math.radians(r0.courses[i])),
        )
        v1 = (
            r1.speeds[i] * math.sin(math.radians(r1.courses[i])),
            r1.speeds[i] * math.cos(math.radians(r1.courses[i])),
        )
        assert v1[0] - v0[0] == pytest.approx(east, abs=1e-9)
        assert v1[1] - v0[1] == pytest.approx(north, abs=1e-9)
    is_dead_reckoned(after)
    logged_untouched(track, after)


def test_a_straight_leg_sheared_steers_the_course_and_speed_it_makes_good() -> None:
    track = dr(legs=((90.0, 10.0, 7),))
    end = Position(*track.geometry.coordinates[6])
    to = destination(end, Quantity(0, "deg"), Quantity(0.5, "[nmi_i]"))
    after, _ = dr_sheared(track, list(range(7)), "start", to)
    d, b = range_bearing(Position(*after.geometry.coordinates[0]), to)
    for course, speed in zip(
        after.properties.courses.values, after.properties.speeds.values, strict=True
    ):
        assert course == pytest.approx(b.value, abs=0.05)
        assert speed == pytest.approx(Quantity(d.value / 360, "m/s").to("[kn_i]").value, abs=0.01)


def test_a_shear_held_at_the_end_keeps_the_end_and_moves_the_start() -> None:
    track = dr()
    start = Position(*track.geometry.coordinates[2])
    to = destination(start, Quantity(300, "deg"), Quantity(0.4, "[nmi_i]"))
    after, _ = dr_sheared(track, [2, 3, 4, 5, 6], "end", to)
    assert metres(after.geometry.coordinates[2], [to.longitude, to.latitude]) < 1e-3
    assert metres(after.geometry.coordinates[6], track.geometry.coordinates[6]) < 1e-3
    assert after.geometry.coordinates[:2] == track.geometry.coordinates[:2]


# --- Through the catalogue: one step each, named in DR terms -------------------------


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    origin = models.ProvRecord(id="op-1", kind="import", started_at=at(0), agent=AGENT)
    track = logged_track([-75.5, 37.1], [(45.0, 12.0, 4), (110.0, 10.0, 4)])
    catalogue.commit("p", [origin], Changes(added=[track]))
    catalogue.edit_track(
        "p", "track-red", {"action": "set_plotting_mode", "plotting_mode": "dr"}, AGENT
    )
    return catalogue


def red(catalogue: Catalogue) -> models.TrackFeature:
    return next(f for f in catalogue.read_plot("p").features if f.id == "track-red")


def last(catalogue: Catalogue) -> models.ProvRecord:
    return catalogue.history("p").steps()[-1].records[0]


def intact(catalogue: Catalogue) -> None:
    """Its hash chain holds, and the plot is valid."""
    assert catalogue.history("p").problem() is None
    load_document(DocumentKind.PLOT, dump_document(DocumentKind.PLOT, catalogue.read_plot("p")))


EDITS = {
    "fix": {
        "action": "move_fix",
        "fix_time": at(5),
        "distance": {"value": 0.3, "unit": "[nmi_i]"},
        "bearing": {"value": 20, "unit": "deg"},
    },
    "move": {
        "action": "move",
        "distance": {"value": 1, "unit": "[nmi_i]"},
        "bearing": {"value": 90, "unit": "deg"},
    },
    "rotate": {
        "action": "rotate",
        "angle": {"value": 10, "unit": "deg"},
        "period": {"start": at(2), "end": at(4)},
    },
    "stretch": {"action": "stretch", "anchor": "start", "speed": {"value": 14, "unit": "[kn_i]"}},
    "shear": {
        "action": "shear",
        "anchor": "start",
        "distance": {"value": 0.5, "unit": "[nmi_i]"},
        "bearing": {"value": 180, "unit": "deg"},
    },
}


def test_a_fix_dragged_is_one_step_named_for_the_leg_into_it(catalogue) -> None:
    catalogue.edit_track("p", "track-red", EDITS["fix"], AGENT)
    record = last(catalogue)
    name, *notes = record.notes
    assert name.startswith("RED ONE (DR) leg into 09:35:00Z now ")
    assert notes[0].startswith("Fix at 09:35:00Z moved 0.30 nmi 020.0°T, to ")
    assert notes[1] == "Was 110.0°T 10.0 kn"
    assert notes[2] == "The fixes after it follow, by dead reckoning"
    params = {p.name for p in record.parameters}
    assert {"fix_time", "distance", "bearing", "course", "speed"} <= params
    intact(catalogue)


@pytest.mark.parametrize("kind", list(EDITS))
def test_each_edit_is_one_step_undone_and_redone_with_the_chain_intact(catalogue, kind) -> None:
    before = red(catalogue)
    count = len(catalogue.history("p").steps())
    catalogue.edit_track("p", "track-red", EDITS[kind], AGENT)
    after = red(catalogue)
    assert len(catalogue.history("p").steps()) == count + 1
    assert last(catalogue).notes[0].startswith("RED ONE (DR) ")
    is_dead_reckoned(after)
    logged_untouched(before, after)
    intact(catalogue)
    catalogue.history("p").undo()
    assert red(catalogue) == before
    intact(catalogue)
    catalogue.history("p").redo()
    assert red(catalogue) == after
    intact(catalogue)
    # Opened again, the history is as it was.
    again = Catalogue.open(catalogue.store.root)
    assert again.history("p").problem() is None


def test_a_period_rotated_says_so_in_dr_terms(catalogue) -> None:
    catalogue.edit_track("p", "track-red", EDITS["rotate"], AGENT)
    name, *notes = last(catalogue).notes
    assert name == "RED ONE (DR) part rotated 10.0° clockwise"
    assert "Each course in the period turned 10.0° clockwise" in notes
    assert any(n.startswith("Turned about the period's first fix") for n in notes)
    assert "The fixes after the period follow on, by dead reckoning: there is no jump" in notes


def test_a_shear_and_a_stretch_say_what_changed(catalogue) -> None:
    catalogue.edit_track("p", "track-red", EDITS["shear"], AGENT)
    notes = last(catalogue).notes
    assert notes[0].startswith("RED ONE (DR) sheared: ")
    assert any(n.startswith("Every course and speed changed by the same ") for n in notes)
    catalogue.edit_track("p", "track-red", EDITS["stretch"], AGENT)
    notes = last(catalogue).notes
    assert notes[0] == "RED ONE (DR) stretched: 14.0 kn"
    assert any(n.startswith("Every speed multiplied by ") for n in notes)


def test_smoothing_averages_courses_and_speeds_not_positions(catalogue) -> None:
    before = red(catalogue)
    after, smoothing = catalogue.smoothing_preview("p", "track-red", 3)
    assert smoothing.moved > 0
    is_dead_reckoned(after)
    # Around the turn, the course is between the legs'.
    assert 45 < Reckoning.of(after).courses[3] < 110
    assert after.geometry.coordinates[0] == before.geometry.coordinates[0]
    catalogue.smooth_track("p", "track-red", 3, AGENT)
    notes = last(catalogue).notes
    assert notes[0] == "RED ONE (DR) smoothed over 3 fixes"
    assert (
        notes[1]
        == "Courses and speeds averaged, not positions; the fixes follow, by dead reckoning"
    )
    is_dead_reckoned(red(catalogue))


def test_over_the_ground_after_a_dr_edit_asks_first_and_puts_back_what_was_logged(
    catalogue,
) -> None:
    logged = red(catalogue).properties
    catalogue.edit_track("p", "track-red", EDITS["rotate"], AGENT)
    said = changed_while_dr(red(catalogue))
    assert said.startswith("its course and speed at 09:32:00Z are 055.0°T 12.0 kn, logged 045.0°T")
    with pytest.raises(ConfirmationNeeded):
        catalogue.edit_track(
            "p", "track-red", {"action": "set_plotting_mode", "plotting_mode": "otg"}, AGENT
        )
    catalogue.edit_track(
        "p",
        "track-red",
        {"action": "set_plotting_mode", "plotting_mode": "otg", "discard_dr_changes": True},
        AGENT,
    )
    back = red(catalogue).properties
    assert red(catalogue).geometry.coordinates == logged.logged_positions.coordinates
    assert back.courses == logged.logged_courses
    assert back.speeds == logged.logged_speeds
    assert back.logged_courses is None and back.logged_speeds is None


# --- Jumps on a DR track: wild logged speeds ---------------------------------------


def wild(track: models.TrackFeature, index: int, knots: float) -> models.TrackFeature:
    speeds = list(track.properties.speeds.values)
    speeds[index] = knots
    props = track.properties.model_copy(
        update={"speeds": track.properties.speeds.model_copy(update={"values": speeds})}
    )
    track = track.model_copy(update={"properties": props})
    return track.model_copy(
        update={
            "geometry": track.geometry.model_copy(
                update={"coordinates": dead_reckoned_positions(track)}
            )
        }
    )


def test_a_wild_logged_speed_is_offered_as_a_jump_and_removed_by_joining_the_legs(
    catalogue,
) -> None:
    glitch = wild(red(catalogue), 3, 180.0)
    catalogue.commit(
        "p",
        [models.ProvRecord(id="op-9", kind="edit", started_at=at(20), agent=AGENT)],
        Changes(modified=[glitch]),
    )
    used, _, jumps = catalogue.find_jumps("p", "track-red")
    assert [j.time for j in jumps] == [at(3)]
    assert jumps[0].logged and jumps[0].since == at(4)
    assert jumps[0].speed_kn == pytest.approx(180.0)
    # The first fix, where dead reckoning starts, and the last, whose speed places nothing,
    # are never offered.
    assert find_dr_jumps(wild(dr(), 0, 180.0))[1] == []
    assert find_dr_jumps(wild(dr(), 7, 180.0))[1] == []
    catalogue.remove_jumps("p", "track-red", [at(3)], AGENT, threshold=used)
    notes = last(catalogue).notes
    assert notes[0] == "RED ONE (DR): 1 jump removed"
    assert notes[2].startswith("Plotted by dead reckoning: the fix before each one removed")
    assert notes[3].startswith("Each logged faster than ")
    after = red(catalogue)
    is_dead_reckoned(after)
    # The fix that was at 09:34:00Z is now placed from 09:32:00Z by its course and speed.
    d, _ = range_bearing(
        Position(*after.geometry.coordinates[2]), Position(*after.geometry.coordinates[3])
    )
    assert d.value == pytest.approx(12 * KNOT * 120, abs=1e-6)
    assert len(after.properties.logged_courses.values) == 7
    intact(catalogue)
    with pytest.raises(Exception, match="plotted by dead reckoning from its first fix"):
        catalogue.remove_jumps("p", "track-red", [at(0)], AGENT)


# --- Split and merge -------------------------------------------------------------------


def test_split_and_merge_keep_the_logged_series_and_one_origin() -> None:
    track = dr()
    first, second = split(track, parse_utc(at(4)), ("RED ONE (1)", "RED ONE (2)"), "track-red-2")
    assert first.properties.logged_courses.values == track.properties.logged_courses.values[:4]
    assert second.properties.logged_speeds.values == track.properties.logged_speeds.values[4:]
    merged, notes = merge([first, second], "RED ONE")
    assert merged == track
    assert notes == []
    # The second part moved on its own: merged, it follows on from the first again.
    moved, _ = dr_moved(second, Quantity(1, "[nmi_i]"), Quantity(0, "deg"), [0, 1, 2, 3])
    merged, notes = merge([first, moved], "RED ONE")
    is_dead_reckoned(merged)
    assert notes[0].startswith("By dead reckoning, RED ONE (2) now follows on from RED ONE (1): ")


# --- The shared vectors: the map's preview matches ------------------------------------


def run_op(track: models.TrackFeature, op: dict) -> models.TrackFeature:
    """One DR operation as the shared vectors describe it."""
    kind = op["op"]
    if kind == "fix":
        return dr_fix_moved(track, op["index"], Position(*op["to"]))[0]
    if kind == "move":
        distance, bearing = Quantity(op["metres"], "m"), Quantity(op["bearing"], "deg")
        return dr_moved(track, distance, bearing, op["indices"])[0]
    if kind == "rotate":
        return dr_rotated(
            track, Position(*op["pivot"]), Quantity(op["degrees"], "deg"), op["indices"]
        )
    if kind == "stretch":
        return dr_stretched(track, op["indices"], op["anchor"], op["factor"])
    return dr_sheared(track, op["indices"], op["anchor"], Position(*op["to"]))[0]


def vector_cases() -> dict:
    """Each DR operation on a track at mid-latitude, far north and across the antimeridian,
    as the map's preview must make it (vscode/test/unit/fixdrag.test.ts)."""
    out: dict = {"cases": []}
    places = (("mid", (-75.5, 37.1)), ("north", (20.0, 85.0)), ("antimeridian", (179.99, -30.0)))
    for label, start in places:
        track = dr(start)
        coords = [list(p) for p in track.geometry.coordinates]
        r = Reckoning.of(track)
        base = {"positions": coords, "times": r.times, "courses": r.courses, "speeds": r.speeds}

        def near(i: int, bearing: float, metres: float, coords=coords) -> list[float]:
            p = destination(Position(*coords[i]), Quantity(bearing, "deg"), Quantity(metres, "m"))
            return [p.longitude, p.latitude]

        every = list(range(8))
        ops = [
            {"op": "fix", "index": 5, "to": near(5, 30, 500)},
            {"op": "fix", "index": 0, "to": near(0, 30, 500)},
            {"op": "move", "indices": every, "metres": 3000, "bearing": 70},
            {"op": "move", "indices": [3, 4, 5], "metres": 900, "bearing": 0},
            {"op": "rotate", "indices": every, "pivot": coords[3], "degrees": 25},
            {"op": "rotate", "indices": [2, 3, 4], "pivot": coords[2], "degrees": -15},
            {"op": "stretch", "indices": every, "anchor": "start", "factor": 1.25},
            {"op": "stretch", "indices": [2, 3, 4, 5, 6], "anchor": "end", "factor": 0.8},
            {"op": "shear", "indices": every, "anchor": "start", "to": near(7, 200, 1100)},
            {"op": "shear", "indices": [2, 3, 4, 5, 6], "anchor": "end", "to": near(2, 300, 700)},
        ]
        for op in ops:
            after = run_op(track, op)
            ra = Reckoning.of(after)
            expected = {
                "positions": [list(p) for p in after.geometry.coordinates],
                "courses": ra.courses,
                "speeds": ra.speeds,
            }
            out["cases"].append({"place": label, **base, **op, "expected": expected})
    return out


def test_the_shared_vectors_are_what_python_makes() -> None:
    made = vector_cases()
    if os.environ.get("DEBRIEF_WRITE_VECTORS"):
        VECTORS.write_text(json.dumps(made, indent=1) + "\n")
    stored = json.loads(VECTORS.read_text())
    assert len(stored["cases"]) == len(made["cases"])
    for want, got in zip(stored["cases"], made["cases"], strict=True):
        for a, b in zip(want["expected"]["positions"], got["expected"]["positions"], strict=True):
            assert metres(a, b) < 1e-6
        assert want["expected"]["courses"] == pytest.approx(got["expected"]["courses"], abs=1e-9)
        assert want["expected"]["speeds"] == pytest.approx(got["expected"]["speeds"], abs=1e-9)
