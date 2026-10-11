"""Formatting is tested through the vectors shared with the TypeScript formatter."""

import json
from pathlib import Path

import pytest

from debrief_kernel.formatting import (
    DEFAULT_SETTINGS,
    FormatSettings,
    fixed,
    format_bearing,
    format_position,
    format_quantity,
    format_time,
)
from debrief_kernel.geodesy import Position
from debrief_kernel.time import parse_utc
from debrief_kernel.units import Quantity

VECTORS = Path(__file__).resolve().parents[3] / "schemas" / "vectors"
CASES = json.loads((VECTORS / "formatting.json").read_text())["cases"]


def test_defaults_match_shared_defaults() -> None:
    shared = json.loads((VECTORS / "format-defaults.json").read_text())
    assert DEFAULT_SETTINGS.model_dump(mode="json") == shared


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_shared_vector(case: dict) -> None:
    settings = FormatSettings.model_validate({**DEFAULT_SETTINGS.model_dump(), **case["settings"]})
    given = case["input"]
    if case["op"] == "quantity":
        result = format_quantity(Quantity(given["value"], given["unit"]), settings)
    elif case["op"] == "bearing":
        result = format_bearing(Quantity(given["value"], given["unit"]), settings)
    elif case["op"] == "position":
        result = format_position(Position(given["longitude"], given["latitude"]), settings)
    else:
        result = format_time(parse_utc(given["utc"]), settings)
    assert result == case["expected"]


def test_vectors_cover_every_operation_and_notation() -> None:
    assert {c["op"] for c in CASES} == {"quantity", "bearing", "position", "time"}
    notations = {
        c["settings"].get("position_notation", "dm") for c in CASES if c["op"] == "position"
    }
    styles = {c["settings"].get("time_style", "time") for c in CASES if c["op"] == "time"}
    assert notations == {"dd", "dm", "dms"}
    assert styles == {"time", "date_time", "dtg"}


@pytest.mark.parametrize(
    ("value", "decimals", "expected"),
    [(2.5, 0, "3"), (-2.5, 0, "-3"), (0.125, 2, "0.13"), (1.005, 2, "1.00"), (-0.04, 1, "0.0")],
)
def test_fixed_rounds_half_away_from_zero(value: float, decimals: int, expected: str) -> None:
    assert fixed(value, decimals) == expected


def test_dtg_is_always_zulu() -> None:
    settings = DEFAULT_SETTINGS.model_copy(
        update={"time_style": "dtg", "time_zone": "Europe/London"}
    )
    with pytest.raises(ValueError):
        format_time(0, settings)
