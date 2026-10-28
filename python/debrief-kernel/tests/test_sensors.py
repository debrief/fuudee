"""Sensor cuts held to schemas/vectors/sensor-cuts.json (CAP-22), as the map is."""

import json
from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, TrackPath
from debrief_kernel.sensors import (
    DEFAULT_LENGTH_CAP_M,
    array_place,
    cut_end,
    cut_place,
    default_length_m,
    drawn_bearings,
    kept_for,
    relative_bearing,
    side_of,
)
from debrief_kernel.time import parse_utc

VECTORS = json.loads(
    (Path(__file__).parents[3] / "schemas" / "vectors" / "sensor-cuts.json").read_text()
)


def same_position(got: Position | None, expected: list[float] | None) -> None:
    if expected is None:
        assert got is None
        return
    assert got is not None
    assert abs(((got.longitude - expected[0] + 540) % 360) - 180) < 1e-9
    assert got.latitude == pytest.approx(expected[1], abs=1e-9)


@pytest.mark.parametrize("case", VECTORS["relative"], ids=lambda c: f"{c['course']}/{c['bearing']}")
def test_relative_bearing_and_side_as_legacy(case: dict) -> None:
    assert relative_bearing(case["course"], case["bearing"]) == pytest.approx(case["relative"])
    assert side_of(case["course"], case["bearing"]) == case["side"]


@pytest.mark.parametrize("case", VECTORS["default_length"], ids=lambda c: str(c["expected_m"]))
def test_default_length(case: dict) -> None:
    assert default_length_m(case["width_m"], case["height_m"]) == pytest.approx(case["expected_m"])


def test_the_longest_default_is_five_degrees_of_arc() -> None:
    assert DEFAULT_LENGTH_CAP_M == 555_600
    assert default_length_m(10_000_000, 1) == DEFAULT_LENGTH_CAP_M


def _cuts():
    for case in VECTORS["cases"]:
        host = case["host"]
        path = TrackPath(
            [parse_utc(t) for t in host["times"]],
            [Position(*c) for c in host["coordinates"]],
            host.get("courses"),
        )
        sensor = case.get("sensor", {})
        for cut in case["cuts"]:
            yield pytest.param(path, sensor, cut, id=f"{case['name']} {cut['time'][11:19]}")


@pytest.mark.parametrize(("path", "sensor", "cut"), list(_cuts()))
def test_cut_origin_course_side_lines_and_keeping(path: TrackPath, sensor: dict, cut: dict) -> None:
    expected = cut["expected"]
    at = parse_utc(cut["time"])
    own = Position(*cut["origin"]) if cut.get("origin") else None
    place = cut_place(
        path,
        at,
        own,
        sensor.get("array_offset_m", 0.0),
        sensor.get("array_mode", "worm_in_hole"),
        cut.get("course"),
    )
    origin = place.position if place else None
    same_position(origin, expected["origin"])
    course = place.course if place else None
    if expected["course"] is None:
        assert course is None
    else:
        assert course == pytest.approx(expected["course"], abs=1e-9)
        assert side_of(course, cut["bearing"]) == expected["side"]
    if origin is not None:
        length = cut.get("range_m", cut.get("length_m"))
        lines = drawn_bearings(cut["bearing"], cut.get("ambiguous_bearing"), cut.get("resolved"))
        assert [w for w, _ in lines] == [line["which"] for line in expected["lines"]]
        for (_, bearing), line in zip(lines, expected["lines"], strict=True):
            same_position(cut_end(origin, bearing, length), line["end"])
    ambiguous = cut.get("ambiguous_bearing")
    assert kept_for("port", cut["bearing"], ambiguous, course) == expected["keep_port"]
    assert kept_for("starboard", cut["bearing"], ambiguous, course) == expected["keep_starboard"]


def test_keeping_a_clicked_bearing_needs_no_course() -> None:
    assert kept_for("ambiguous_bearing", 10, 350, None) == "ambiguous_bearing"
    assert kept_for("bearing", 10, 350, None) == "bearing"
    assert kept_for("port", 10, None, 0) is None
    assert kept_for("ambiguous", 10, 350, 0) is None


def test_the_logged_course_tells_the_side_at_a_turn_as_legacy() -> None:
    """legs_20.rep: between fixes logged 000 and 090, legacy told the side by the 090 of
    the fix after; the line between the fixes runs 000, which would call it starboard."""
    path = TrackPath([0, 600_000], [Position(-75.6, 37.0), Position(-75.6, 37.05)], [0.0, 90.0])
    place = cut_place(path, 300_000)
    assert place is not None and place.course == pytest.approx(90.0)
    assert side_of(place.course, 45.0) == "port"
    assert path.course_at(300_000) == pytest.approx(0.0, abs=1e-6)


def test_a_worm_lags_round_a_turn_and_is_extrapolated_before_the_first_fix() -> None:
    north = Position(-75.6, 37.0)
    corner = Position(-75.6, 37.009)
    east = Position(-75.589, 37.009)
    path = TrackPath([0, 600_000, 1_200_000], [north, corner, east])
    after = cut_place(path, 660_000, offset_m=300.0)
    assert after is not None and after.position.longitude == pytest.approx(-75.6, abs=1e-9)
    assert after.position.latitude < corner.latitude
    assert after.course == pytest.approx(0.0, abs=1e-6)
    plain = cut_place(path, 660_000, offset_m=300.0, mode="plain")
    assert plain is not None and plain.position.latitude == pytest.approx(37.009, abs=1e-4)
    first = cut_place(path, 0, offset_m=300.0)
    assert first is not None and first.position.latitude < north.latitude


def exact_worm(path: TrackPath, at: int, offset: float) -> Position:
    """The worm walked leg by leg along geodesics, as round 1 did: the reference."""
    from debrief_kernel.geodesy import WGS84

    behind = path.position_at(at)
    remaining = offset
    for j in range(sum(1 for t in path.times_ms if t < at) - 1, -1, -1):
        fix = path.positions[j]
        leg = WGS84.Inverse(behind.latitude, behind.longitude, fix.latitude, fix.longitude)
        if leg["s12"] >= remaining:
            p = WGS84.Direct(behind.latitude, behind.longitude, leg["azi1"], remaining)
            return Position(p["lon2"], p["lat2"])
        remaining -= leg["s12"]
        behind = fix
    raise AssertionError("past the first fix")


def counting_geodesics(monkeypatch) -> list:
    from debrief_kernel.geodesy import WGS84

    calls: list = []
    real = WGS84.Inverse

    def counted(*args, **kwargs):
        calls.append(1)
        return real(*args, **kwargs)

    monkeypatch.setattr(WGS84, "Inverse", counted)
    return calls


def test_a_worm_on_a_dense_track_takes_one_geodesic_not_one_a_fix(monkeypatch) -> None:
    """M1: ALPHA.rep logs a fix a second; a 500 m worm walked a geodesic per fix, some 70
    per cut, and resolving 600 cuts took over 2 s. Legs are measured on the local
    ellipsoid, to well under a millimetre over the walk."""
    from debrief_kernel.geodesy import range_bearing

    path = TrackPath(
        [i * 1000 for i in range(2001)],
        [Position(-4.0 + 0.00007 * i, 50.0 + 0.00003 * (i % 40)) for i in range(2001)],
    )
    calls = counting_geodesics(monkeypatch)
    fast = array_place(path, 1_500_500, 500.0)
    assert len(calls) <= 2
    assert fast is not None
    apart, _ = range_bearing(fast.position, exact_worm(path, 1_500_500, 500.0))
    assert apart.to("m").value < 1e-3


def test_a_worm_on_a_track_that_sat_still_bisects_rather_than_walks(monkeypatch) -> None:
    """Round 3, M-5: a host still for three-quarters of 20,000 fixes; a worm walked every
    still leg (600 cuts, 2.7 s; 26 s at 200,000 fixes). The track's along-track distance
    is worked out once and bisected: a geodesic or two a cut, wherever it is."""
    from debrief_kernel.geodesy import range_bearing

    n, still = 20_000, 15_000
    positions = [Position(-4.0, 50.0 + max(0, i - still) * 5 / 111_000) for i in range(n)]
    path = TrackPath([i * 1000 for i in range(n)], positions, [0.0] * n)
    calls = counting_geodesics(monkeypatch)
    cuts = [k * (n - 1) * 1000 // 600 for k in range(600)]
    places = [array_place(path, t, 500.0) for t in cuts]
    assert len(calls) <= 2 * len(cuts)
    for t, place in zip(cuts, places, strict=True):
        if t > (still + 101) * 1000:  # far enough along to have run 500 m
            apart, _ = range_bearing(place.position, exact_worm(path, t, 500.0))
            assert apart.to("m").value < 1e-3, t
        else:  # still, or not yet 500 m from where it sat: astern of the first fix
            assert place.position.latitude < 50.0 + 1e-9, t
