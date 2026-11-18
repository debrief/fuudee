"""debrief_kernel.tma_fit against gitma2's own batch least squares (tests/data/gitma2-lsq.json,
made by tests/data/make_gitma2_lsq.py in a gitma2 checkout)."""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from debrief_kernel import tma_fit

CASES = json.loads((Path(__file__).parent / "data" / "gitma2-lsq.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_agrees_with_gitma2(case):
    fitted = tma_fit.fit(case["t"], case["ox"], case["oy"], case["z"])
    assert fitted is not None
    theirs = case["gitma2"]
    # Positions to a metre, velocities to a millimetre a second; cost to a part in 10^6.
    assert np.allclose(fitted.theta[:2], theirs["theta"][:2], atol=1.0)
    assert np.allclose(fitted.theta[2:], theirs["theta"][2:], atol=1e-3)
    assert fitted.cost == pytest.approx(theirs["cost"], rel=1e-6, abs=1e-20)
    assert fitted.converged == theirs["converged"]


def test_a_zig_determines_range():
    case = next(c for c in CASES if c["name"] == "zig, 1 degree")
    fitted = tma_fit.fit(case["t"], case["ox"], case["oy"], case["z"])
    x0, y0, vx, vy = case["truth"]
    truth = math.hypot(x0, y0)
    assert fitted.determined
    assert abs(fitted.range_m - truth) < 3 * fitted.range_sd_m
    assert fitted.course_rad == pytest.approx(math.atan2(vx, vy) % (2 * math.pi), abs=0.1)


def test_without_a_zig_range_is_undetermined():
    case = next(c for c in CASES if c["name"] == "no zig, 1 degree")
    fitted = tma_fit.fit(case["t"], case["ox"], case["oy"], case["z"])
    assert not fitted.determined


def test_too_few_cuts():
    assert tma_fit.fit([0, 30, 60, 90], [0] * 4, [0] * 4, [0.1] * 4) is None
