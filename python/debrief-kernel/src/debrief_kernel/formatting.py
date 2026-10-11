"""Display formatting: the single place units, positions and times are written for people (SUB-04).

Views and tools never format values themselves; they call this service, or
its TypeScript twin in ts/kernel, with the analyst's settings. Both are held
to the shared vectors in schemas/vectors/formatting.json. Stored values are
never changed (SUB-01, SUB-02).
Defaults follow British practice at sea: knots, nautical miles, three-figure
true bearings, degrees and decimal minutes, and Zulu time.
"""

from __future__ import annotations

import math
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from debrief_kernel.geodesy import Position
from debrief_kernel.time import from_epoch_ms
from debrief_kernel.units import Quantity, normalise_bearing
from debrief_schemas.generated.debrief import FormatSettings

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
    "deg/min": "°/min",
    "deg/s": "°/s",
    "rad/s": "rad/s",
}

# Must equal schemas/vectors/format-defaults.json; a test checks.
DEFAULT_SETTINGS = FormatSettings(
    length_unit="[nmi_i]",
    length_decimals=2,
    speed_unit="[kn_i]",
    speed_decimals=1,
    angle_decimals=1,
    duration_unit="min",
    duration_decimals=1,
    position_notation="dm",
    position_decimals=3,
    time_style="time",
    show_milliseconds=False,
    time_zone="UTC",
)

# Fixed English month names, so output never depends on the machine's locale.
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def fixed(value: float, decimals: int) -> str:
    """Round half away from zero on the exact stored value, as JavaScript's toFixed does.

    Python's own formatting rounds half to even, so the TypeScript formatter
    and this one would disagree on ties such as 2.5. Both follow this rule;
    the shared vectors in schemas/vectors/formatting.json hold them to it.
    """
    quantum = Decimal(1).scaleb(-decimals)
    text = str(Decimal(value).quantize(quantum, rounding=ROUND_HALF_UP))
    # A value that rounds to zero is shown without a sign.
    return text[1:] if text.startswith("-") and not text.strip("-0.") else text


def _round_half_up(value: float) -> int:
    """Nearest integer for non-negative values, ties upwards, as JavaScript's Math.round."""
    return math.floor(value + 0.5)


def format_quantity(quantity: Quantity, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A quantity in the analyst's chosen unit for its kind, for example "12.3 kn"."""
    kind = quantity.kind
    if kind == "angle":
        return f"{fixed(quantity.to('deg').value, settings.angle_decimals)}°"
    if kind == "angular_rate":
        # Always degrees per minute, the analysts' standard for bearing rate.
        return f"{fixed(quantity.to('deg/min').value, settings.angle_decimals)}°/min"
    unit, decimals = {
        "length": (settings.length_unit, settings.length_decimals),
        "speed": (settings.speed_unit, settings.speed_decimals),
        "duration": (settings.duration_unit, settings.duration_decimals),
    }[kind]
    return f"{fixed(quantity.to(unit).value, decimals)} {UNIT_LABELS[unit]}"


def format_bearing(bearing: Quantity, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A true bearing as three figures, for example "045.0°T"."""
    decimals = settings.angle_decimals
    text = fixed(normalise_bearing(bearing.to("deg").value), decimals)
    if float(text) >= 360.0:
        text = fixed(0.0, decimals)
    width = 3 + (decimals + 1 if decimals else 0)
    return f"{text.zfill(width)}°T"


def format_position(position: Position, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    latitude = _format_coordinate(position.latitude, "NS", 2, settings)
    longitude = _format_coordinate(position.longitude, "EW", 3, settings)
    return f"{latitude} {longitude}"


def _format_coordinate(value: float, hemispheres: str, width: int, settings: FormatSettings) -> str:
    hemisphere = hemispheres[0] if value >= 0 else hemispheres[1]
    magnitude = abs(value)
    places = settings.position_decimals
    notation = settings.position_notation

    if notation == "dd":
        text = fixed(magnitude, places).zfill(width + 1 + places if places else width)
        return f"{text}°{hemisphere}"

    # Work in whole units of the last field so rounding carries correctly.
    if notation == "dm":
        scale = 60 * 10**places
        total = _round_half_up(magnitude * scale)
        degrees, minutes = divmod(total, scale)
        return f"{degrees:0{width}d}°{_scaled(minutes, places)}'{hemisphere}"

    scale = 3600 * 10**places
    total = _round_half_up(magnitude * scale)
    degrees, rest = divmod(total, scale)
    minutes, seconds = divmod(rest, 60 * 10**places)
    return f"{degrees:0{width}d}°{minutes:02d}'{_scaled(seconds, places)}\"{hemisphere}"


def _scaled(value: int, places: int) -> str:
    """An integer count of 10**-places units as two-digit whole part and fraction."""
    whole, fraction = divmod(value, 10**places)
    return f"{whole:02d}.{fraction:0{places}d}" if places else f"{whole:02d}"


def _offset_label(instant: datetime) -> str:
    """The zone as an offset from UTC, for example "UTC+1" or "UTC-3:30".

    Offsets rather than abbreviations: "BST" or "EST" are not available the
    same way in every runtime, and offsets are never ambiguous.
    """
    offset = instant.utcoffset()
    minutes = round(offset.total_seconds() / 60) if offset else 0
    sign = "-" if minutes < 0 else "+"
    hours, rest = divmod(abs(minutes), 60)
    return f"UTC{sign}{hours}" + (f":{rest:02d}" if rest else "")


def format_time(epoch_ms: int, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A time for display. Zulu unless the analyst chose another zone (SUB-01)."""
    instant = from_epoch_ms(epoch_ms)
    zulu = settings.time_zone == "UTC"
    if not zulu:
        instant = instant.astimezone(ZoneInfo(settings.time_zone))
    zone = "Z" if zulu else f" {_offset_label(instant)}"

    if settings.time_style == "dtg":
        if not zulu:
            raise ValueError("a date-time group is always in Zulu time")
        month = _MONTHS[instant.month - 1].upper()
        return f"{instant.strftime('%d%H%M')}Z {month} {instant.strftime('%y')}"

    clock = instant.strftime("%H:%M:%S")
    if settings.show_milliseconds:
        clock += f".{instant.microsecond // 1000:03d}"
    if settings.time_style == "date_time":
        return f"{instant.day} {_MONTHS[instant.month - 1]} {instant.year} {clock}{zone}"
    return f"{clock}{zone}"


__all__ = [
    "DEFAULT_SETTINGS",
    "FormatSettings",
    "fixed",
    "format_bearing",
    "format_position",
    "format_quantity",
    "format_time",
]
