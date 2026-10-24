"""Sensor cuts held to schemas/vectors/sensor-cuts.json (CAP-22), as the map is."""

import json
from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, TrackPath
from debrief_kernel.sensors import (
    DEFAULT_LENGTH_CAP_M,
    cut_end,
    cut_origin,
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
            [parse_utc(t) for t in host["times"]], [Position(*c) for c in host["coordinates"]]
        )
        for cut in case["cuts"]:
            yield pytest.param(path, cut, id=f"{case['name']} {cut['time'][11:19]}")


@pytest.mark.parametrize(("path", "cut"), list(_cuts()))
def test_cut_origin_course_side_lines_and_keeping(path: TrackPath, cut: dict) -> None:
    expected = cut["expected"]
    at = parse_utc(cut["time"])
    own = Position(*cut["origin"]) if cut.get("origin") else None
    origin = cut_origin(path, at, own)
    same_position(origin, expected["origin"])
    course = path.course_at(at)
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
