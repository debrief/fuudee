"""Intervals for labels, symbols and arrows (CAP-32), held to the vectors shared with
TypeScript (vscode/webview/frequencies.ts)."""

import json
from pathlib import Path

import pytest

from debrief_kernel.time import (
    INTERVAL_OFF,
    IntervalError,
    describe_interval,
    read_interval,
)

VECTORS = json.loads(
    (Path(__file__).resolve().parents[3] / "schemas" / "vectors" / "fix-intervals.json").read_text()
)


@pytest.mark.parametrize("case", VECTORS["read"], ids=lambda c: repr(c["text"]))
def test_read(case: dict) -> None:
    if "problem" in case:
        with pytest.raises(IntervalError) as error:
            read_interval(case["text"])
        assert str(error.value) == case["problem"]
    else:
        assert read_interval(case["text"]) == case["seconds"]


@pytest.mark.parametrize("case", VECTORS["describe"], ids=lambda c: str(c["seconds"]))
def test_describe(case: dict) -> None:
    assert describe_interval(case["seconds"]) == case["text"]


def test_described_reads_back() -> None:
    for seconds in (1, 5, 59, 61, 600, 3599, 5400, 43_200, 86_400):
        assert read_interval(describe_interval(seconds)) == seconds


def test_off() -> None:
    assert read_interval(" OFF ") == INTERVAL_OFF
