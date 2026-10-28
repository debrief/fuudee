"""TMA bearing residuals held to schemas/vectors/tma-residuals.json (CAP-21, NFR-04), as the
bearing view is while a solution is dragged; and the first guess's helpers."""

import json
import math
import time
from pathlib import Path

import pytest
from geographiclib.geodesic import Geodesic

from debrief_kernel import tma
from debrief_kernel.geodesy import Position, TrackPath, destination
from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity

VECTORS = json.loads(
    (Path(__file__).parents[3] / "schemas" / "vectors" / "tma-residuals.json").read_text()
)


def path_of(solution: dict) -> TrackPath:
    return TrackPath(
        [parse_utc(t) for t in solution["times"]],
        [Position(*c) for c in solution["coordinates"]],
    )


def cut_of(cut: dict) -> tma.CutBearing:
    return tma.CutBearing(
        parse_utc(cut["time"]),
        tuple(cut["origin"]) if cut.get("origin") else None,
        cut["bearing"],
        cut.get("ambiguous_bearing"),
        cut.get("resolved"),
    )


@pytest.mark.parametrize("case", VECTORS["residual_cases"], ids=lambda c: c["name"])
def test_residuals_as_the_shared_vectors_say(case: dict) -> None:
    found = tma.residuals([cut_of(c) for c in case["cuts"]], path_of(case["solution"]))
    for got, expected in zip(found, case["expected"]["rows"], strict=True):
        if expected is None:
            assert got.residual is None and got.calculated is None
            continue
        assert got.calculated == pytest.approx(expected["calculated"], abs=1e-6)
        assert got.measured == pytest.approx(expected["measured"], abs=1e-6)
        assert got.residual == pytest.approx(expected["residual"], abs=1e-6)
        assert got.used == expected["used"]
        assert got.nearer_side is expected["nearer_side"]
        if expected.get("other_residual") is None:
            assert got.other is None
        else:
            assert got.other == pytest.approx(expected["other_residual"], abs=1e-6)
    counted = [
        r.residual for c, r in zip(case["cuts"], found, strict=True) if not c.get("excluded")
    ]
    rms = tma.rms(counted)
    if case["expected"]["rms"] is None:
        assert rms is None
    else:
        assert rms == pytest.approx(case["expected"]["rms"], abs=1e-6)


def test_residuals_agree_with_geodesics_point_by_point() -> None:
    """The vectorised residuals against Karney's geodesics one at a time: each bearing
    calculated is the geodesic's initial bearing from the cut's origin."""
    case = VECTORS["residual_cases"][0]
    path = path_of(case["solution"])
    for cut, got in zip(
        case["cuts"], tma.residuals([cut_of(c) for c in case["cuts"]], path), strict=True
    ):
        where = path.position_at(parse_utc(cut["time"]))
        line = Geodesic.WGS84.Inverse(
            cut["origin"][1], cut["origin"][0], where.latitude, where.longitude
        )
        assert got.calculated == pytest.approx(line["azi1"] % 360, abs=1e-8)


@pytest.mark.parametrize(("angle", "wrapped"), VECTORS["wrap"])
def test_angles_wrap_within_plus_or_minus_180(angle: float, wrapped: float) -> None:
    assert tma.wrap(angle) == pytest.approx(wrapped)


@pytest.mark.parametrize("case", VECTORS["onto_line"], ids=lambda c: c["name"])
def test_a_click_is_taken_onto_its_cuts_line(case: dict) -> None:
    on = tma.onto_line(
        Position(*case["origin"]),
        case["bearing"],
        case.get("ambiguous_bearing"),
        case.get("resolved"),
        Position(*case["click"]),
    )
    expected = case["expected"]
    if expected is None:
        assert on is None
        return
    assert on.used == expected["used"]
    assert on.range_m == pytest.approx(expected["range_m"], abs=1e-3)
    assert on.position.longitude == pytest.approx(expected["position"][0], abs=1e-8)
    assert on.position.latitude == pytest.approx(expected["position"][1], abs=1e-8)


def test_the_first_guess_by_form_defaults() -> None:
    guess = VECTORS["first_guess"]
    assert tma.DEFAULT_RANGE.value == guess["range"]["value"]
    assert tma.DEFAULT_RANGE.unit == guess["range"]["unit"]
    assert tma.DEFAULT_SPEED.value == guess["speed"]["value"]
    for bearing, course in guess["across"]:
        assert tma.across(bearing) == pytest.approx(course)


def test_course_and_speed_between_two_positions() -> None:
    a = Position(-4.0, 50.0)
    b = destination(a, Quantity(120.0, "deg"), Quantity(1852.0 * 4, "m"))
    course, speed = tma.course_speed(a, b, 3600.0)
    assert course == pytest.approx(120.0, abs=1e-9)
    assert speed == pytest.approx(1852.0 * 4 / 3600, abs=1e-9)
    assert tma.course_speed(a, b, 0)[1] == 0.0


def test_two_thousand_cuts_take_milliseconds() -> None:
    """The drag budget (NFR-04): residuals for a realistic period are quick enough to be
    exact as a drag ends. 2,000 cuts on a solution of 2,000 fixes, measured."""
    n = 2000
    start = Position(-4.0, 50.1)
    positions = [start]
    for _ in range(n - 1):
        positions.append(destination(positions[-1], Quantity(200, "deg"), Quantity(150, "m")))
    times = [i * 30_000 for i in range(n)]
    path = TrackPath(times, positions)
    origin = (-4.0, 50.0)
    cuts = [tma.CutBearing(t, origin, 30.0, 150.0) for t in times]
    tma.residuals(cuts[:10], path)  # warm
    started = time.perf_counter()
    found = tma.residuals(cuts, path)
    took = (time.perf_counter() - started) * 1000
    assert len(found) == n and all(r.residual is not None for r in found)
    print(f"TMA residuals: {n} cuts in {took:.1f} ms")
    assert took < 200
    assert math.isfinite(tma.rms([r.residual for r in found]))
