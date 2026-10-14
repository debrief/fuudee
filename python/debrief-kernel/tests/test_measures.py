"""Measures for the Tote (CAP-06): geodesic range and bearing, relative bearing,
course, speed and depth, interpolated as the map places tracks at current time."""

import json
import math
from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, TrackPath, destination, range_bearing
from debrief_kernel.measures import (
    CORE_GROUP,
    CORE_MEASURES,
    MEASURES,
    REVERSAL_TOLERANCE_DEG,
    TrackMotion,
    TrackState,
    group_measures,
    measure,
    relative_bearing,
)
from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity, bearing_difference
from debrief_schemas import load_plot

VECTORS = Path(__file__).resolve().parents[3] / "schemas" / "vectors"
HOUR = 3_600_000
KNOT = 1852.0 / 3600.0


def at(primary: TrackState | None, track: TrackState, name: str) -> float | None:
    return measure(MEASURES[name], track, primary)


def state(lon: float, lat: float, course: float | None = None, speed: float | None = None):
    return TrackState(Position(lon, lat), course, speed, None)


# --- The core group ------------------------------------------------------------------


def test_core_follows_legacy_totes_measures_in_order() -> None:
    assert CORE_GROUP.id == "core"
    assert CORE_GROUP.extends is None
    assert list(CORE_GROUP.measures) == [
        "range",
        "bearing",
        "relative_bearing",
        "aob",
        "bearing_rate",
        "course",
        "speed",
        "depth",
    ]
    assert [m.id for m in group_measures(CORE_GROUP)] == list(CORE_GROUP.measures)
    relative = {m.id for m in CORE_MEASURES if m.subject == "relative"}
    assert relative == {"range", "bearing", "relative_bearing", "aob", "bearing_rate"}
    assert MEASURES["bearing_rate"].quantity_kind == "angular_rate"
    assert MEASURES["bearing_rate"].unit == "deg/min"
    assert MEASURES["aob"].display == "relative_bearing"
    assert MEASURES["range"].display == "range"  # close range in yards (decision, 14 Oct 2026)


def test_core_group_and_measures_are_valid_schema_documents() -> None:
    from debrief_schemas import models

    models.MeasureGroup.model_validate(CORE_GROUP.to_json())
    for definition in CORE_MEASURES:
        models.MeasureDefinition.model_validate(definition.to_json())


# --- Range and bearing ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("a", "b", "metres", "bearing"),
    [
        # One degree of longitude on the equator: a * pi / 180 for WGS84.
        (Position(0, 0), Position(1, 0), 111_319.490_793, 90.0),
        # One degree of latitude from the equator: the WGS84 meridian arc.
        (Position(0, 0), Position(0, 1), 110_574.388_556, 0.0),
        # Westward across the antimeridian: short, not round the world.
        (Position(179.5, 0), Position(-179.5, 0), 111_319.490_793, 90.0),
    ],
)
def test_range_and_bearing_are_geodesic(a, b, metres, bearing) -> None:
    primary, secondary = state(a.longitude, a.latitude), state(b.longitude, b.latitude)
    assert at(primary, secondary, "range") == pytest.approx(metres, abs=1e-3)
    assert at(primary, secondary, "bearing") == pytest.approx(bearing, abs=1e-6)


def test_far_north_bearing_is_true_not_grid() -> None:
    # Near the pole a track due "east" on a chart is far from 090: the geodesic says so.
    primary, secondary = state(0, 89.9), state(90, 89.9)
    rng, brg = range_bearing(primary.position, secondary.position)
    assert at(primary, secondary, "range") == pytest.approx(rng.value)
    assert at(primary, secondary, "bearing") == pytest.approx(brg.value)
    assert 40 < brg.value < 50  # across the pole's top, not 090
    assert rng.value < 20_000


# --- Relative bearing ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("bearing", "heading", "expected"),
    [
        (10, 350, 20),  # across north: green 20, not -340
        (350, 10, -20),  # red 20
        (180, 0, 180),  # dead astern
        (0, 180, 180),
        (90, 90, 0),  # dead ahead
        (271, 90, -179),
        (269, 90, 179),
        (359.5, 0.5, -1),
    ],
)
def test_relative_bearing_wraps_at_360(bearing, heading, expected) -> None:
    assert relative_bearing(bearing, heading) == pytest.approx(expected)


def test_relative_bearing_is_from_the_primarys_course() -> None:
    primary = state(0, 0, course=350.0)
    secondary = state(0.01, 0.01)  # about 045
    _, brg = range_bearing(primary.position, secondary.position)
    assert at(primary, secondary, "relative_bearing") == pytest.approx(brg.value + 10)


def test_relative_bearing_needs_the_primarys_course() -> None:
    assert at(state(0, 0), state(1, 1), "relative_bearing") is None


# --- Angle on the bow and bearing rate (decision, 14 Oct 2026) ---------------------------

NMI = 1852.0
KNOT = NMI / 3600.0


@pytest.mark.parametrize(
    ("course", "expected"),
    [
        (180.0, 0.0),  # bows on: heading straight for the primary
        (0.0, 180.0),  # stern on
        (90.0, 90.0),  # heading east, the primary to the south: on its starboard side
        (270.0, -90.0),  # heading west: the primary on its port side
        (135.0, 45.0),
    ],
)
def test_angle_on_the_bow_is_the_primarys_bearing_from_the_tracks_head(course, expected) -> None:
    primary = state(-4.0, 50.0, course=0.0, speed=5.0)
    secondary = state(-4.0, 50.1, course=course, speed=5.0)  # due north of the primary
    assert at(primary, secondary, "aob") == pytest.approx(expected, abs=1e-6)


def test_angle_on_the_bow_needs_the_tracks_course_not_the_primarys() -> None:
    assert at(state(-4.0, 50.0), state(-4.0, 50.1, course=180.0), "aob") == pytest.approx(0.0)
    assert at(state(-4.0, 50.0, course=0.0), state(-4.0, 50.1), "aob") is None


def test_bearing_rate_is_crossing_speed_over_range() -> None:
    # A secondary a mile north of a primary lying still, crossing east at 10 knots: the
    # bearing draws right at v / r radians a second.
    primary = state(0.0, 0.0, course=0.0, speed=0.0)
    north = Position(0.0, 0.0)

    north = destination(north, Quantity(0.0, "deg"), Quantity(NMI, "m"))
    secondary = TrackState(north, 90.0, 10 * KNOT, None)
    expected = 10 * KNOT / NMI * 180.0 / math.pi * 60.0  # about 9.55 °/min
    assert at(primary, secondary, "bearing_rate") == pytest.approx(expected, rel=1e-3)
    # Crossing west draws left: negative.
    west = TrackState(north, 270.0, 10 * KNOT, None)
    assert at(primary, west, "bearing_rate") == pytest.approx(-expected, rel=1e-3)


def test_bearing_rate_is_zero_on_a_steady_bearing() -> None:
    # Both on the same course and speed: the bearing holds (a collision course has it too).
    primary = state(-4.0, 50.0, course=45.0, speed=6.0)
    secondary = state(-3.9, 50.05, course=45.0, speed=6.0)
    assert at(primary, secondary, "bearing_rate") == pytest.approx(0.0, abs=1e-3)
    # Closing head on along the line of sight: no change of bearing either.
    ahead = state(0.0, 0.1, course=180.0, speed=8.0)
    assert at(state(0.0, 0.0, course=0.0, speed=8.0), ahead, "bearing_rate") == pytest.approx(
        0.0, abs=1e-6
    )


def test_bearing_rate_relative_motion_is_what_counts() -> None:
    # The primary crossing west under a still secondary to its north draws the bearing right.

    north = destination(Position(0.0, 0.0), Quantity(0.0, "deg"), Quantity(NMI, "m"))
    primary = state(0.0, 0.0, course=270.0, speed=10 * KNOT)
    secondary = TrackState(north, 0.0, 0.0, None)
    assert at(primary, secondary, "bearing_rate") == pytest.approx(9.55, abs=0.01)


def test_bearing_rate_far_north_and_across_the_antimeridian() -> None:
    primary = state(179.99, 0.0, course=90.0, speed=10.0)
    secondary = state(-179.99, 0.01, course=90.0, speed=10.0)
    assert at(primary, secondary, "bearing_rate") == pytest.approx(0.0, abs=1e-3)
    polar = at(
        state(0.0, 89.9, course=0.0, speed=0.0),
        state(180.0, 89.9, course=90.0, speed=5.0),
        "bearing_rate",
    )
    assert polar is not None and math.isfinite(polar)


def test_bearing_rate_needs_both_courses_and_speeds() -> None:
    moving = state(-4.0, 50.0, course=0.0, speed=5.0)
    assert at(state(-4.0, 50.1, course=0.0), moving, "bearing_rate") is None
    assert at(moving, state(-4.0, 50.1, speed=5.0), "bearing_rate") is None


def test_tracks_in_one_place_have_no_bearing() -> None:
    # Geodesy gives 180° between coincident points: a direction that is not there.
    primary = state(-4.0, 50.0, course=90.0)
    for secondary in (state(-4.0, 50.0), state(-4.0, 50.0 + 1e-12)):
        assert at(primary, secondary, "range") == pytest.approx(0.0, abs=1e-3)
        assert at(primary, secondary, "bearing") is None
        assert at(primary, secondary, "relative_bearing") is None
        assert at(primary, secondary, "aob") is None
    assert at(primary, state(-4.0, 50.0001), "bearing") == pytest.approx(0.0, abs=1e-6)


# --- Missing data ----------------------------------------------------------------------


def test_relative_measures_need_the_primary_own_measures_do_not() -> None:
    track = TrackState(Position(1, 1), 45.0, 5.0, 20.0)
    for name in ("range", "bearing", "relative_bearing"):
        assert at(None, track, name) is None
    assert at(None, track, "course") == 45.0
    assert at(None, track, "speed") == 5.0
    assert at(None, track, "depth") == 20.0


def test_no_state_outside_the_tracks_span() -> None:
    motion = TrackMotion([HOUR, 2 * HOUR], [Position(0, 0), Position(1, 0)])
    assert motion.state_at(HOUR - 1) is None
    assert motion.state_at(2 * HOUR + 1) is None
    assert motion.state_at(HOUR) is not None
    assert motion.state_at(2 * HOUR) is not None


def test_no_depth_where_none_is_recorded() -> None:
    motion = TrackMotion([0, HOUR], [Position(0, 0), Position(1, 0)])
    assert motion.state_at(HOUR // 2).depth_m is None


# --- Interpolation ---------------------------------------------------------------------


def test_position_is_where_the_map_puts_the_marker() -> None:
    # The map's positionAt is held to the same vectors (vscode/test/unit/tote.test.ts).
    cases = json.loads((VECTORS / "track-positions.json").read_text())["cases"]
    for case in cases:
        times = [parse_utc(t) for t in case["times"]]
        positions = [Position(lon, lat) for lon, lat in case["coordinates"]]
        courses = case.get("courses")
        motion = TrackMotion(times, positions, courses_deg=courses)
        path = TrackPath(times, positions)
        for sample in case["samples"]:
            t = parse_utc(sample["at"])
            expected = sample["expected"]
            found = motion.state_at(t)
            assert (found is None) == (expected is None), (case["name"], sample["at"])
            assert (path.position_at(t) is None) == (expected is None)
            if expected is not None:
                assert found.position.longitude == pytest.approx(expected[0], abs=1e-9)
                assert found.position.latitude == pytest.approx(expected[1], abs=1e-9)
                assert path.position_at(t) == found.position
            if courses is not None and expected is not None:
                # The Tote's course; the same bearing either side of north is one course.
                turn = bearing_difference(found.course_deg, sample["course"])
                assert abs(turn) < 1e-9, (case["name"], sample["at"], found.course_deg)


def test_recorded_course_speed_and_depth_are_interpolated() -> None:
    motion = TrackMotion(
        [0, HOUR],
        [Position(0, 0), Position(0, 1)],
        courses_deg=[350.0, 10.0],
        speeds_ms=[4.0, 6.0],
        depths_m=[20.0, 30.0],
    )
    quarter = motion.state_at(HOUR // 4)
    assert quarter.course_deg == pytest.approx(355.0)  # the shorter way, through north
    assert quarter.speed_ms == pytest.approx(4.5)
    assert quarter.depth_m == pytest.approx(22.5)
    half = motion.state_at(HOUR // 2)
    assert half.course_deg == pytest.approx(0.0, abs=1e-9)


@pytest.mark.parametrize(
    ("courses", "at_minutes", "expected"),
    [
        ([0.0, 180.0], 10, 0.0),  # nearer the first fix: its course
        ([0.0, 180.0], 50, 180.0),  # nearer the second: its course
        ([0.0, 180.0], 30, 180.0),  # half way: the later fix's
        ([45.0, 225.0], 29, 45.0),
        ([270.0, 90.0], 31, 90.0),
        ([90.0, 270.4], 20, 90.0),  # within half a degree of opposite: still a reversal
        ([90.0, 269.6], 40, 269.6),
    ],
)
def test_no_course_is_made_up_across_a_reversal(
    courses: list[float], at_minutes: int, expected: float
) -> None:
    # Courses either side exactly opposite have no shorter way round, and a course half way
    # is one the track never steered (decision, 14 Oct 2026): the nearer fix's course.
    motion = TrackMotion([0, HOUR], [Position(0, 0), Position(0, 0.1)], courses_deg=courses)
    assert motion.state_at(at_minutes * 60_000).course_deg == pytest.approx(expected)


def test_a_turn_short_of_a_reversal_is_interpolated() -> None:
    # 179° is a turn with a shorter way round, beyond the half-degree tolerance.
    motion = TrackMotion([0, HOUR], [Position(0, 0), Position(0, 0.1)], courses_deg=[10.0, 189.0])
    assert motion.state_at(HOUR // 2).course_deg == pytest.approx(99.5)
    assert REVERSAL_TOLERANCE_DEG == 0.5


def test_at_a_fix_its_own_values() -> None:
    motion = TrackMotion(
        [0, HOUR, 2 * HOUR],
        [Position(0, 0), Position(0, 1), Position(1, 1)],
        courses_deg=[0.0, 90.0, 180.0],
        speeds_ms=[1.0, 2.0, 3.0],
    )
    assert motion.state_at(HOUR).course_deg == 90.0
    assert motion.state_at(HOUR).position == Position(0, 1)
    last = motion.state_at(2 * HOUR)
    assert (last.course_deg, last.speed_ms, last.position) == (180.0, 3.0, Position(1, 1))


def test_course_and_speed_from_positions_when_none_recorded() -> None:
    # One degree of longitude along the equator in an hour.
    motion = TrackMotion([0, HOUR], [Position(0, 0), Position(1, 0)])
    half = motion.state_at(HOUR // 2)
    assert half.course_deg == pytest.approx(90.0)
    assert half.speed_ms == pytest.approx(111_319.490_793 / 3600.0, abs=1e-6)


def test_course_from_positions_far_north_follows_the_geodesic() -> None:
    # Over the pole: the course turns from north to south at the top.
    motion = TrackMotion([0, HOUR], [Position(0, 89.5), Position(180, 89.5)])
    assert motion.state_at(HOUR // 10).course_deg == pytest.approx(0.0, abs=1e-6)
    assert motion.state_at(9 * HOUR // 10).course_deg == pytest.approx(180.0, abs=1e-6)


def test_across_the_antimeridian() -> None:
    motion = TrackMotion([0, HOUR], [Position(179.5, 0), Position(-179.5, 0)])
    half = motion.state_at(HOUR // 2)
    assert abs(half.position.longitude) == pytest.approx(180.0)
    assert half.course_deg == pytest.approx(90.0)
    assert half.speed_ms == pytest.approx(111_319.490_793 / 3600.0, abs=1e-6)
    secondary = TrackMotion([0, HOUR], [Position(-179.9, 0.01), Position(-179.9, 0.01)])
    rng = at(half, secondary.state_at(HOUR // 2), "range")
    assert rng < 20_000  # a few kilometres, not round the world


def test_a_track_that_stops_has_no_course_from_positions() -> None:
    motion = TrackMotion([0, HOUR], [Position(1, 1), Position(1, 1)])
    stopped = motion.state_at(HOUR // 2)
    assert stopped.course_deg is None
    assert stopped.speed_ms == 0.0


def test_a_single_fix_track_has_a_state_only_at_its_time() -> None:
    motion = TrackMotion([HOUR], [Position(1, 1)], courses_deg=[400.0], speeds_ms=[2.0])
    only = motion.state_at(HOUR)
    assert (only.position, only.course_deg, only.speed_ms) == (Position(1, 1), 40.0, 2.0)
    assert motion.state_at(HOUR + 1) is None


def test_from_a_feature_in_its_own_units() -> None:
    plot = load_plot(
        (
            Path(__file__).resolve().parents[3]
            / "schemas"
            / "fixtures"
            / "plot"
            / "valid"
            / "speeds-in-knots.json"
        ).read_text()
    )
    track = next(f for f in plot.features if f.properties.kind == "track")
    motion = TrackMotion.from_feature(track)
    first = motion.state_at(parse_utc(track.properties.times[0]))
    assert first.speed_ms == pytest.approx(track.properties.speeds.values[0] * KNOT)
