"""Formatting is tested through the vectors shared with the TypeScript formatter."""

import json
from pathlib import Path

import pytest

from debrief_kernel.formatting import (
    DEFAULT_SETTINGS,
    FormatSettings,
    PositionError,
    fixed,
    format_bearing,
    format_depth,
    format_position,
    format_quantity,
    format_range,
    format_relative_bearing,
    format_time,
    parse_position,
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
    elif case["op"] == "range":
        result = format_range(Quantity(given["value"], given["unit"]), settings)
    elif case["op"] == "bearing":
        result = format_bearing(Quantity(given["value"], given["unit"]), settings)
    elif case["op"] == "relative_bearing":
        result = format_relative_bearing(Quantity(given["value"], given["unit"]), settings)
    elif case["op"] == "depth":
        result = format_depth(Quantity(given["value"], given["unit"]), settings)
    elif case["op"] == "position":
        result = format_position(Position(given["longitude"], given["latitude"]), settings)
    else:
        result = format_time(parse_utc(given["utc"]), settings)
    assert result == case["expected"]


def test_vectors_cover_every_operation_and_notation() -> None:
    assert {c["op"] for c in CASES} == {
        "quantity",
        "range",
        "bearing",
        "relative_bearing",
        "depth",
        "position",
        "time",
    }
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


# --- Reading positions -------------------------------------------------------------

POSITIONS = json.loads((VECTORS / "positions.json").read_text())["cases"]


@pytest.mark.parametrize("case", POSITIONS, ids=lambda c: c["name"])
def test_shared_position_vector(case: dict) -> None:
    if case.get("error"):
        with pytest.raises(PositionError):
            parse_position(case["input"])
        return
    position = parse_position(case["input"])
    assert position.longitude == pytest.approx(case["expected"][0], abs=1e-9)
    assert position.latitude == pytest.approx(case["expected"][1], abs=1e-9)


@pytest.mark.parametrize("notation", ["dd", "dm", "dms"])
def test_what_format_position_writes_reads_back(notation: str) -> None:
    settings = DEFAULT_SETTINGS.model_copy(update={"position_notation": notation})
    for position in (Position(-4.120166, 50.335333), Position(151.2153, -33.8568)):
        read = parse_position(format_position(position, settings))
        # Within the precision written: dd to a thousandth of a degree.
        assert read.longitude == pytest.approx(position.longitude, abs=6e-4)
        assert read.latitude == pytest.approx(position.latitude, abs=6e-4)


def test_a_position_error_says_what_to_type() -> None:
    with pytest.raises(PositionError, match="50°20.120'N 004°07.210'W"):
        parse_position("somewhere")
