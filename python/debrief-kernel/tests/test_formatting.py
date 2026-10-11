from dataclasses import replace

import pytest

from debrief_kernel.formatting import (
    DEFAULT_SETTINGS,
    PositionNotation,
    TimeStyle,
    format_bearing,
    format_position,
    format_quantity,
    format_time,
)
from debrief_kernel.geodesy import Position
from debrief_kernel.time import parse_utc
from debrief_kernel.units import angle, duration, length, speed

PLYMOUTH = Position(-4.120167, 50.335333)


@pytest.mark.parametrize(
    ("quantity", "expected"),
    [
        (length(1852), "1.00 nmi"),
        (speed(5.144444, "m/s"), "10.0 kn"),
        (angle(45), "45.0°"),
        (duration(90), "1.5 min"),
    ],
)
def test_quantities_in_default_units(quantity, expected) -> None:
    assert format_quantity(quantity) == expected


def test_quantity_units_follow_settings() -> None:
    settings = replace(DEFAULT_SETTINGS, length_unit="[yd_i]", length_decimals=0)
    assert format_quantity(length(1, "[nmi_i]"), settings) == "2025 yd"


@pytest.mark.parametrize(
    ("degrees", "decimals", "expected"),
    [
        (5, 1, "005.0°T"),
        (45, 0, "045°T"),
        (359.96, 1, "000.0°T"),
        (-90, 1, "270.0°T"),
        (180, 2, "180.00°T"),
    ],
)
def test_bearings_are_three_figures(degrees, decimals, expected) -> None:
    settings = replace(DEFAULT_SETTINGS, angle_decimals=decimals)
    assert format_bearing(angle(degrees), settings) == expected


@pytest.mark.parametrize(
    ("notation", "places", "expected"),
    [
        (PositionNotation.DEGREES_MINUTES, 3, "50°20.120'N 004°07.210'W"),
        (PositionNotation.DECIMAL_DEGREES, 3, "50.335°N 004.120°W"),
        (PositionNotation.DEGREES_MINUTES_SECONDS, 1, "50°20'07.2\"N 004°07'12.6\"W"),
    ],
)
def test_position_notations(notation, places, expected) -> None:
    settings = replace(DEFAULT_SETTINGS, position_notation=notation, position_decimals=places)
    assert format_position(PLYMOUTH, settings) == expected


def test_position_rounding_carries_into_degrees() -> None:
    assert format_position(Position(0.0, 50.9999999)) == "51°00.000'N 000°00.000'E"


def test_southern_and_eastern_hemispheres() -> None:
    assert format_position(Position(151.2, -33.85)) == "33°51.000'S 151°12.000'E"


@pytest.mark.parametrize(
    ("changes", "expected"),
    [
        ({}, "09:30:05Z"),
        ({"show_milliseconds": True}, "09:30:05.250Z"),
        ({"time_style": TimeStyle.DATE_TIME}, "11 Oct 2026 09:30:05Z"),
        ({"time_style": TimeStyle.DTG}, "110930Z OCT 26"),
        ({"time_zone": "Europe/London"}, "10:30:05 BST"),
    ],
)
def test_time_styles(changes, expected) -> None:
    epoch_ms = parse_utc("2026-10-11T09:30:05.250Z")
    assert format_time(epoch_ms, replace(DEFAULT_SETTINGS, **changes)) == expected


def test_dtg_is_always_zulu() -> None:
    settings = replace(DEFAULT_SETTINGS, time_style=TimeStyle.DTG, time_zone="Europe/London")
    with pytest.raises(ValueError):
        format_time(0, settings)
