"""Display formatting: the single place units, positions and times are written for people (SUB-04).

Views and tools never format values themselves; they call this service with
the analyst's settings. Stored values are never changed (SUB-01, SUB-02).
Defaults follow British practice at sea: knots, nautical miles, three-figure
true bearings, degrees and decimal minutes, and Zulu time.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from zoneinfo import ZoneInfo

from debrief_kernel.geodesy import Position
from debrief_kernel.time import from_epoch_ms
from debrief_kernel.units import Quantity, normalise_bearing

UNIT_LABELS = {
    "m": "m",
    "km": "km",
    "[nmi_i]": "nmi",
    "[yd_i]": "yd",
    "[ft_i]": "ft",
    "m/s": "m/s",
    "[kn_i]": "kn",
    "km/h": "km/h",
    "deg": "°",
    "rad": "rad",
    "ms": "ms",
    "s": "s",
    "min": "min",
    "h": "h",
}


class PositionNotation(StrEnum):
    DECIMAL_DEGREES = "dd"  # 50.33533°N 004.12017°W
    DEGREES_MINUTES = "dm"  # 50°20.120'N 004°07.210'W
    DEGREES_MINUTES_SECONDS = "dms"  # 50°20'07.2"N 004°07'12.6"W


class TimeStyle(StrEnum):
    TIME = "time"  # 09:30:00Z
    DATE_TIME = "date_time"  # 11 Oct 2026 09:30:00Z
    DTG = "dtg"  # 110930Z OCT 26, the military date-time group


@dataclass(frozen=True)
class FormatSettings:
    length_unit: str = "[nmi_i]"
    length_decimals: int = 2
    speed_unit: str = "[kn_i]"
    speed_decimals: int = 1
    angle_decimals: int = 1
    duration_unit: str = "min"
    duration_decimals: int = 1
    position_notation: PositionNotation = PositionNotation.DEGREES_MINUTES
    position_decimals: int = 3
    time_style: TimeStyle = TimeStyle.TIME
    show_milliseconds: bool = False
    time_zone: str = "UTC"


DEFAULT_SETTINGS = FormatSettings()

# Fixed English month names, so output never depends on the machine's locale.
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def format_quantity(quantity: Quantity, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A quantity in the analyst's chosen unit for its kind, for example "12.3 kn"."""
    kind = quantity.kind
    if kind == "angle":
        return f"{quantity.to('deg').value:.{settings.angle_decimals}f}°"
    unit, decimals = {
        "length": (settings.length_unit, settings.length_decimals),
        "speed": (settings.speed_unit, settings.speed_decimals),
        "duration": (settings.duration_unit, settings.duration_decimals),
    }[kind]
    return f"{quantity.to(unit).value:.{decimals}f} {UNIT_LABELS[unit]}"


def format_bearing(bearing: Quantity, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A true bearing as three figures, for example "045.0°T"."""
    decimals = settings.angle_decimals
    value = round(normalise_bearing(bearing.to("deg").value), decimals)
    if value >= 360.0:
        value = 0.0
    width = 3 + (decimals + 1 if decimals else 0)
    return f"{value:0{width}.{decimals}f}°T"


def format_position(position: Position, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    latitude = _format_coordinate(position.latitude, "NS", 2, settings)
    longitude = _format_coordinate(position.longitude, "EW", 3, settings)
    return f"{latitude} {longitude}"


def _format_coordinate(value: float, hemispheres: str, width: int, settings: FormatSettings) -> str:
    hemisphere = hemispheres[0] if value >= 0 else hemispheres[1]
    magnitude = abs(value)
    places = settings.position_decimals
    notation = settings.position_notation

    if notation is PositionNotation.DECIMAL_DEGREES:
        text = f"{magnitude:0{width + 1 + places}.{places}f}°"
        return f"{text}{hemisphere}"

    # Work in whole units of the last field so rounding carries correctly.
    if notation is PositionNotation.DEGREES_MINUTES:
        scale = 60 * 10**places
        total = round(magnitude * scale)
        degrees, minutes = divmod(total, scale)
        minutes_text = f"{minutes / 10**places:0{3 + places if places else 2}.{places}f}"
        return f"{degrees:0{width}d}°{minutes_text}'{hemisphere}"

    scale = 3600 * 10**places
    total = round(magnitude * scale)
    degrees, rest = divmod(total, scale)
    minutes, seconds = divmod(rest, 60 * 10**places)
    seconds_text = f"{seconds / 10**places:0{3 + places if places else 2}.{places}f}"
    return f"{degrees:0{width}d}°{minutes:02d}'{seconds_text}\"{hemisphere}"


def format_time(epoch_ms: int, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A time for display. Zulu unless the analyst chose another zone (SUB-01)."""
    instant = from_epoch_ms(epoch_ms)
    zulu = settings.time_zone == "UTC"
    if not zulu:
        instant = instant.astimezone(ZoneInfo(settings.time_zone))
    zone = "Z" if zulu else instant.strftime(" %Z")

    if settings.time_style is TimeStyle.DTG:
        if not zulu:
            raise ValueError("a date-time group is always in Zulu time")
        month = _MONTHS[instant.month - 1].upper()
        return f"{instant.strftime('%d%H%M')}Z {month} {instant.strftime('%y')}"

    clock = instant.strftime("%H:%M:%S")
    if settings.show_milliseconds:
        clock += f".{instant.microsecond // 1000:03d}"
    if settings.time_style is TimeStyle.DATE_TIME:
        return f"{instant.day} {_MONTHS[instant.month - 1]} {instant.year} {clock}{zone}"
    return f"{clock}{zone}"


__all__ = [
    "DEFAULT_SETTINGS",
    "FormatSettings",
    "PositionNotation",
    "TimeStyle",
    "format_bearing",
    "format_position",
    "format_quantity",
    "format_time",
]
