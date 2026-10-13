import pytest

from debrief_kernel.geodesy import (
    CURVE_SIDES,
    Position,
    TrackPath,
    circle_ring,
    closest_approach,
    destination,
    ellipse_ring,
    geodesic_points,
    interpolate,
    range_bearing,
    range_between,
)
from debrief_kernel.time import parse_utc
from debrief_kernel.units import angle, duration, length, speed
from debrief_schemas import load_plot

HOUR_MS = 3_600_000


@pytest.mark.parametrize(
    ("a", "b", "metres", "bearing"),
    [
        # One degree of longitude on the equator: a * pi / 180 for WGS84.
        (Position(0, 0), Position(1, 0), 111_319.490_793, 90.0),
        # One degree of latitude from the equator: the WGS84 meridian arc.
        (Position(0, 0), Position(0, 1), 110_574.388_556, 0.0),
        # Wellington to Salamanca, the worked example in Karney (2013) and geographiclib.
        (Position(174.81, -41.32), Position(-5.50, 40.96), 19_959_679.267_353, 161.067_669_986),
    ],
)
def test_range_bearing_reference_values(a, b, metres, bearing) -> None:
    rng, brg = range_bearing(a, b)
    assert rng.to("m").value == pytest.approx(metres, abs=1e-3)
    assert brg.to("deg").value == pytest.approx(bearing, abs=1e-6)


def test_bearing_is_normalised() -> None:
    _, brg = range_bearing(Position(0, 0), Position(-1, 0))
    assert brg.value == pytest.approx(270.0)


def test_destination_inverts_range_bearing() -> None:
    a, b = Position(-4.12, 50.35), Position(-3.5, 50.9)
    rng, brg = range_bearing(a, b)
    reached = destination(a, brg, rng)
    assert range_between(reached, b).value < 1e-3


def test_crossing_the_antimeridian() -> None:
    a, b = Position(179.9, 0), Position(-179.9, 0)
    rng, brg = range_bearing(a, b)
    assert rng.to("km").value == pytest.approx(22.264, abs=1e-3)
    assert brg.value == pytest.approx(90.0)
    middle = interpolate(a, b, 0.5)
    assert abs(middle.longitude) == pytest.approx(180.0)
    assert -180 <= destination(a, angle(90), length(20, "km")).longitude < -179


def test_geodesic_points_follow_the_geodesic() -> None:
    a, b = Position(-70, 40), Position(0, 50)
    points = geodesic_points(a, b, 10)
    assert points[0] == a
    assert points[-1].latitude == pytest.approx(b.latitude)
    total = range_between(a, b).value
    pieces = sum(range_between(p, q).value for p, q in zip(points, points[1:], strict=False))
    assert pieces == pytest.approx(total, rel=1e-9)
    assert max(p.latitude for p in points) > 50  # a great-circle route bows poleward


def _straight_track(
    start: Position, course: float, knots: float, start_ms: int, hours: float, fixes: int
) -> TrackPath:
    times, positions = [], []
    for i in range(fixes):
        t = start_ms + round(i * hours * HOUR_MS / (fixes - 1))
        travelled = speed(knots, "[kn_i]") * duration((t - start_ms) / 1000)
        times.append(t)
        positions.append(destination(start, angle(course), travelled))
    return TrackPath(times, positions)


def test_position_at() -> None:
    track = _straight_track(Position(0, 0), 90, 10, 0, 2, 3)
    assert track.position_at(-1) is None
    assert track.position_at(2 * HOUR_MS + 1) is None
    assert track.position_at(0) == Position(0, 0)
    halfway = track.position_at(HOUR_MS // 2)
    assert range_between(Position(0, 0), halfway).to("[nmi_i]").value == pytest.approx(5, abs=1e-6)


def test_track_from_feature() -> None:
    from pathlib import Path

    fixture = (
        Path(__file__).resolve().parents[3] / "schemas/fixtures/plot/valid/imported-rep-track.json"
    )
    track = TrackPath.from_feature(load_plot(fixture.read_text()).features[0])
    assert track.start_ms == parse_utc("2026-10-11T09:30:00.000Z")
    assert track.position_at(track.start_ms) == Position(-4.1201, 50.3502)


def test_head_on_cpa_is_zero_at_meeting_time() -> None:
    a = _straight_track(Position(0, 0), 90, 10, 0, 2, 2)
    b_start = destination(Position(0, 0), angle(90), length(20, "[nmi_i]"))
    b = _straight_track(b_start, 270, 10, 0, 2, 2)
    cpa = closest_approach(a, b)
    assert cpa.range.value < 1.0
    assert cpa.time_ms == pytest.approx(HOUR_MS, abs=100)


def _brute_force_cpa(a: TrackPath, b: TrackPath, step_ms: int) -> tuple[int, float]:
    lo, hi = max(a.start_ms, b.start_ms), min(a.end_ms, b.end_ms)
    return min(
        (
            (t, range_between(a.position_at(t), b.position_at(t)).value)
            for t in range(lo, hi + 1, step_ms)
        ),
        key=lambda pair: pair[1],
    )


def test_crossing_cpa_matches_brute_force() -> None:
    # A zigzags north-east; B crosses ahead of it heading west-north-west.
    times = [0, 20 * 60_000, 45 * 60_000, 70 * 60_000, 90 * 60_000]
    courses = [45, 10, 80, 30]
    positions = [Position(-4.5, 50.0)]
    for i, course in enumerate(courses):
        leg = speed(12, "[kn_i]") * duration((times[i + 1] - times[i]) / 1000)
        positions.append(destination(positions[-1], angle(course), leg))
    a = TrackPath(times, positions)
    b = _straight_track(Position(-4.1, 50.25), 300, 15, 5 * 60_000, 1.5, 7)

    cpa = closest_approach(a, b)
    t, r = _brute_force_cpa(a, b, 250)
    assert cpa.range.value <= r + 1e-6
    assert cpa.range.value == pytest.approx(r, abs=0.5)
    assert cpa.time_ms == pytest.approx(t, abs=500)
    assert range_between(cpa.position_a, cpa.position_b).isclose(cpa.range)


def test_cpa_window_and_no_overlap() -> None:
    a = _straight_track(Position(0, 0), 90, 10, 0, 2, 2)
    b_start = destination(Position(0, 0), angle(90), length(20, "[nmi_i]"))
    b = _straight_track(b_start, 270, 10, 0, 2, 2)
    late = closest_approach(a, b, start_ms=int(1.5 * HOUR_MS))
    assert late.time_ms == int(1.5 * HOUR_MS)
    assert late.range.to("[nmi_i]").value == pytest.approx(10, abs=1e-3)
    later = _straight_track(Position(0, 0), 90, 10, 3 * HOUR_MS, 1, 2)
    assert closest_approach(a, later) is None


def test_track_rejects_bad_input() -> None:
    with pytest.raises(ValueError):
        TrackPath([1, 0], [Position(0, 0), Position(1, 1)])
    with pytest.raises(ValueError):
        TrackPath([], [])


# --- Circles and ellipses ------------------------------------------------------------


def test_circle_ring_is_closed_and_every_position_at_the_radius() -> None:
    centre = Position(-4.0, 50.0)
    ring = circle_ring(centre, length(2, "[nmi_i]"))
    assert len(ring) == CURVE_SIDES + 1
    assert ring[0] == ring[-1]
    for position in ring[:-1]:
        assert range_between(centre, position).value == pytest.approx(3704.0, abs=1e-6)
    # The first position is due north; they go clockwise.
    assert range_bearing(centre, ring[0])[1].value == pytest.approx(0.0, abs=1e-9)
    assert range_bearing(centre, ring[CURVE_SIDES // 4])[1].value == pytest.approx(90.0, abs=1e-9)


def test_ellipse_ring_has_its_axes_where_it_says() -> None:
    centre = Position(-4.0, 50.0)
    ring = ellipse_ring(centre, length(3000), length(1000), angle(45))
    assert ring[0] == ring[-1]
    end_of_major = range_bearing(centre, ring[0])
    assert end_of_major[0].value == pytest.approx(3000, abs=1e-6)
    assert end_of_major[1].value == pytest.approx(45, abs=1e-9)
    end_of_minor = range_bearing(centre, ring[CURVE_SIDES // 4])
    assert end_of_minor[0].value == pytest.approx(1000, abs=1e-6)
    assert end_of_minor[1].value == pytest.approx(135, abs=1e-9)
    for position in ring:
        assert 1000 - 1e-6 <= range_between(centre, position).value <= 3000 + 1e-6


def test_a_circle_of_equal_axes_is_a_circle() -> None:
    centre = Position(10.0, -20.0)
    as_ellipse = ellipse_ring(centre, length(500), length(500), angle(0))
    as_circle = circle_ring(centre, length(500))
    for a, b in zip(as_ellipse, as_circle, strict=True):
        assert a.longitude == pytest.approx(b.longitude, abs=1e-12)
        assert a.latitude == pytest.approx(b.latitude, abs=1e-12)


@pytest.mark.parametrize(
    "make",
    [
        lambda c: circle_ring(c, length(0)),
        lambda c: ellipse_ring(c, length(100), length(200), angle(0)),
        lambda c: ellipse_ring(c, length(100), length(0), angle(0)),
    ],
)
def test_curves_of_no_size_or_the_wrong_way_round_are_refused(make) -> None:
    with pytest.raises(ValueError):
        make(Position(0, 0))
