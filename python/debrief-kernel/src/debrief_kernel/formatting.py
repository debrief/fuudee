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
import re
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from debrief_kernel.geodesy import Position
from debrief_kernel.time import from_epoch_ms
from debrief_kernel.units import Quantity, bearing_difference, normalise_bearing
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


# Close range in yards (decision, 14 Oct 2026): where lengths are in nautical miles, a range
# under one is in whole yards, as analysts call close ranges; from 1 nmi, nautical miles.
_NAUTICAL_MILE = "[nmi_i]"
_YARD = "[yd_i]"


def format_range(distance: Quantity, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A range between two vessels: as format_quantity, except that where the analyst's
    lengths are in nautical miles, a range under 1 nmi is in whole yards, "60 yd"."""
    if str(settings.length_unit) == _NAUTICAL_MILE and distance.to(_NAUTICAL_MILE).value < 1.0:
        return f"{fixed(distance.to(_YARD).value, 0)} {UNIT_LABELS[_YARD]}"
    return format_quantity(distance, settings)


def format_bearing(bearing: Quantity, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A true bearing as three figures, for example "045.0°T"."""
    decimals = settings.angle_decimals
    text = fixed(normalise_bearing(bearing.to("deg").value), decimals)
    if float(text) >= 360.0:
        text = fixed(0.0, decimals)
    width = 3 + (decimals + 1 if decimals else 0)
    return f"{text.zfill(width)}°T"


def format_relative_bearing(bearing: Quantity, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A bearing from a vessel's head, three figures, red to port and green to starboard:
    "R045.0°", "G120.0°"; dead ahead "000.0°" and dead astern "180.0°", with no side."""
    decimals = settings.angle_decimals
    signed = bearing_difference(bearing.to("deg").value, 0.0)
    text = fixed(abs(signed), decimals)
    width = 3 + (decimals + 1 if decimals else 0)
    if float(text) == 0.0 or float(text) >= 180.0:
        return f"{fixed(0.0 if float(text) == 0.0 else 180.0, decimals).zfill(width)}°"
    return f"{'R' if signed < 0 else 'G'}{text.zfill(width)}°"


# Feet where the analyst's lengths are in feet or yards; else metres. One decimal: depths
# are known to about a metre, and nautical miles would hide them (no depth setting yet).
_IMPERIAL = ("[ft_i]", "[yd_i]")
DEPTH_DECIMALS = 1


def format_depth(depth: Quantity, settings: FormatSettings = DEFAULT_SETTINGS) -> str:
    """A depth below the surface: "20.0 m", or "65.6 ft" where lengths are imperial."""
    unit = "[ft_i]" if str(settings.length_unit) in _IMPERIAL else "m"
    return f"{fixed(depth.to(unit).value, DEPTH_DECIMALS)} {UNIT_LABELS[unit]}"


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


# --- Reading positions the analyst types ------------------------------------------
#
# The inverse of format_position: a position typed in any of the notations
# Debrief writes (decimal degrees, degrees and decimal minutes, degrees,
# minutes and seconds), with or without the symbols, with the hemisphere
# letter before or after each half; or two signed decimal numbers, latitude
# first. The TypeScript twin in ts/kernel is held to the same vectors
# (schemas/vectors/positions.json).

_SYMBOLS = str.maketrans({c: " " for c in "°º˚'′’\"″”,;"})
_TOKEN = re.compile(r"[NSEW]|[+-]?\d+(?:\.\d+)?|[+-]?\.\d+")


class PositionError(ValueError):
    """A position that cannot be read, with what to type instead."""


POSITION_EXAMPLE = "50°20.120'N 004°07.210'W"


def parse_position(text: str) -> Position:
    """A position typed by the analyst, read as format_position writes it, and more.

    Raises PositionError, in plain words, if it cannot be read.
    """
    normal = text.upper().translate(_SYMBOLS)
    tokens = _TOKEN.findall(normal)
    if "".join(tokens) != re.sub(r"\s+", "", normal) or not tokens:
        raise PositionError(f"Not a position Debrief understands; type one like {POSITION_EXAMPLE}")
    letters = [t for t in tokens if t in "NSEW"]
    if not letters:
        if len(tokens) != 2:
            raise PositionError(
                f"Give latitude and longitude, such as {POSITION_EXAMPLE} or 50.335, -4.120"
            )
        latitude, longitude = (float(t) for t in tokens)
        return _checked_position(latitude, longitude)
    if len(letters) != 2:
        raise PositionError(f"Give one hemisphere letter for each half, as in {POSITION_EXAMPLE}")
    halves = _halves(tokens)
    values = {}
    for letter, numbers in halves:
        if any(n.startswith(("+", "-")) for n in numbers):
            raise PositionError("Use N, S, E or W, not a sign, with degrees and minutes")
        axis = "lat" if letter in "NS" else "lon"
        if axis in values:
            raise PositionError("Give one latitude (N or S) and one longitude (E or W)")
        magnitude = _degrees(numbers)
        values[axis] = -magnitude if letter in "SW" else magnitude
    return _checked_position(values["lat"], values["lon"])


def _halves(tokens: list[str]) -> list[tuple[str, list[str]]]:
    """Split tokens into two (letter, numbers) halves. Letters lead or trail, consistently."""
    leading = tokens[0] in "NSEW"
    halves: list[tuple[str, list[str]]] = []
    numbers: list[str] = []
    letter = None
    for token in tokens:
        if token in "NSEW":
            if leading:
                if letter is not None:
                    halves.append((letter, numbers))
                letter, numbers = token, []
            else:
                halves.append((token, numbers))
                numbers = []
        else:
            numbers.append(token)
    if leading and letter is not None:
        halves.append((letter, numbers))
    elif numbers:
        raise PositionError(
            f"Put each hemisphere letter after its numbers, as in {POSITION_EXAMPLE}"
        )
    if len(halves) != 2 or any(not 1 <= len(n) <= 3 for _, n in halves):
        raise PositionError(f"Not a position Debrief understands; type one like {POSITION_EXAMPLE}")
    return halves


def _degrees(numbers: list[str]) -> float:
    parts = [float(n) for n in numbers]
    if any("." in n for n in numbers[:-1]):
        raise PositionError("Only the last number of each half may have decimals")
    for value in parts[1:]:
        if value >= 60:
            raise PositionError("Minutes and seconds must be less than 60")
    degrees = parts[0]
    if len(parts) > 1:
        degrees += parts[1] / 60
    if len(parts) > 2:
        degrees += parts[2] / 3600
    return degrees


def _checked_position(latitude: float, longitude: float) -> Position:
    if not -90 <= latitude <= 90:
        raise PositionError("Latitude must be within 90° of the equator")
    if not -180 <= longitude <= 180:
        raise PositionError("Longitude must be within 180° of Greenwich")
    return Position(longitude, latitude)


__all__ = [
    "POSITION_EXAMPLE",
    "PositionError",
    "parse_position",
    "DEFAULT_SETTINGS",
    "FormatSettings",
    "fixed",
    "format_bearing",
    "format_position",
    "format_quantity",
    "format_time",
]
