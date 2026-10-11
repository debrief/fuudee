"""The vectorised geodesics must agree with the per-point ones in debrief_kernel.geodesy."""

import random

import numpy as np
import pytest

from debrief_kernel import geodesy, geodesy_arrays
from debrief_kernel.geodesy import Position, TrackPath
from debrief_kernel.units import angle, bearing_difference, length

RNG = random.Random(20261011)
ORIGINS = [Position(RNG.uniform(-180, 180), RNG.uniform(-85, 85)) for _ in range(300)]
TARGETS = [
    geodesy.destination(p, angle(RNG.uniform(0, 360)), length(RNG.uniform(1, 2_000_000)))
    for p in ORIGINS
]


def _columns(points: list[Position]) -> tuple[np.ndarray, np.ndarray]:
    return np.array([p.longitude for p in points]), np.array([p.latitude for p in points])


def test_range_bearing_matches_per_point() -> None:
    result = geodesy_arrays.range_bearing(*_columns(ORIGINS), *_columns(TARGETS))
    for i, (a, b) in enumerate(zip(ORIGINS, TARGETS, strict=True)):
        rng, brg = geodesy.range_bearing(a, b)
        assert result.range_m[i] == pytest.approx(rng.value, abs=1e-6)
        assert abs(bearing_difference(result.bearing_deg[i], brg.value)) < 1e-9


def test_returns_forward_azimuth_not_back_azimuth() -> None:
    # pyproj returns (forward, back, distance); taking the back azimuth gives
    # plausible bearings about 180 degrees out. Due east must read 090.
    result = geodesy_arrays.range_bearing([0.0], [0.0], [1.0], [0.0])
    assert result.bearing_deg[0] == pytest.approx(90.0)
    assert result.range_m[0] == pytest.approx(111_319.490_793, abs=1e-3)


def test_bearings_in_range() -> None:
    result = geodesy_arrays.range_bearing([0.0, 0.0], [0.0, 0.0], [-1.0, 0.0], [0.0, -1.0])
    assert result.bearing_deg.tolist() == pytest.approx([270.0, 180.0])
    assert ((result.bearing_deg >= 0) & (result.bearing_deg < 360)).all()


def test_destination_matches_per_point() -> None:
    bearings = np.array([RNG.uniform(0, 360) for _ in ORIGINS])
    distances = np.array([RNG.uniform(0, 500_000) for _ in ORIGINS])
    result = geodesy_arrays.destination(*_columns(ORIGINS), bearings, distances)
    for i, origin in enumerate(ORIGINS):
        expected = geodesy.destination(origin, angle(bearings[i]), length(distances[i]))
        reached = Position(result.longitude[i], result.latitude[i])
        assert geodesy.range_between(reached, expected).value < 1e-6
        assert -180 <= result.longitude[i] < 180


def test_destination_across_the_antimeridian() -> None:
    result = geodesy_arrays.destination([179.9], [0.0], [90.0], [22_264.0])
    assert result.longitude[0] == pytest.approx(-179.9, abs=1e-4)


def _zigzag() -> TrackPath:
    times = [0, 600_000, 1_200_000, 1_200_000, 2_400_000]
    positions = [Position(-4.5, 50.0)]
    for course in (45, 120, 120, 10):
        positions.append(geodesy.destination(positions[-1], angle(course), length(3, "[nmi_i]")))
    return TrackPath(times, positions)


def test_positions_at_matches_position_at() -> None:
    track = _zigzag()
    times = np.array(
        [-1, 0, 1, 300_000, 599_999, 600_000, 1_200_000, 1_800_000, 2_400_000, 2_400_001]
    )
    result = geodesy_arrays.positions_at(track, times)
    for i, t in enumerate(times):
        expected = track.position_at(int(t))
        if expected is None:
            assert np.isnan(result.longitude[i]) and np.isnan(result.latitude[i])
            continue
        reached = Position(result.longitude[i], result.latitude[i])
        assert geodesy.range_between(reached, expected).value < 1e-6, t


def test_positions_at_single_fix_track() -> None:
    track = TrackPath([1000], [Position(1.0, 2.0)])
    result = geodesy_arrays.positions_at(track, [999, 1000, 1001])
    assert np.isnan(result.longitude[0]) and np.isnan(result.longitude[2])
    assert (result.longitude[1], result.latitude[1]) == (1.0, 2.0)


@pytest.mark.parametrize(
    ("measured", "calculated", "expected"),
    [(10, 350, 20), (350, 10, -20), (180, 0, 180), (0, 180, 180), (90, 90, 0), (359.5, 0.5, -1)],
)
def test_bearing_residuals_wrap_like_bearing_difference(measured, calculated, expected) -> None:
    result = geodesy_arrays.bearing_residuals([measured], [calculated])[0]
    assert result == pytest.approx(expected)
    assert result == pytest.approx(bearing_difference(measured, calculated))
