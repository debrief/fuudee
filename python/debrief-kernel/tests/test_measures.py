"""Measures for the Tote (CAP-06): geodesic range and bearing, relative bearing,
course, speed and depth, interpolated as the map places tracks at current time."""

import json
from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, TrackPath, range_bearing
from debrief_kernel.measures import (
    CORE_GROUP,
    CORE_MEASURES,
    MEASURES,
    TrackMotion,
    TrackState,
    group_measures,
    measure,
    relative_bearing,
)
from debrief_kernel.time import parse_utc
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
        "course",
        "speed",
        "depth",
    ]
    assert [m.id for m in group_measures(CORE_GROUP)] == list(CORE_GROUP.measures)
    relative = {m.id for m in CORE_MEASURES if m.subject == "relative"}
    assert relative == {"range", "bearing", "relative_bearing"}


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
        motion, path = TrackMotion(times, positions), TrackPath(times, positions)
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
