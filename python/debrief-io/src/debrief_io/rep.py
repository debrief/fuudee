"""Reading REP (replay) files: fix lines (EXT-01).

Ported from legacy Debrief's ImportFix and DebriefFormatDateTime, and
tested against their cases. A fix line is:

    YYMMDD HHMMSS[.ffffff] NAME SYMBOLOGY
        DD MM SS.ss H  DDD MM SS.ss H  COURSE SPEED DEPTH [LABEL[ // COMMENT]]

- The date may have a four-digit year. Two-digit years read as 1950 to 2049,
  a fixed window, so a file reads the same whatever today's date.
- Short date and time tokens are padded with leading zeros ("51600" is
  05:16:00). Fractions of a second may run to microseconds; finer than that
  is an error. Debrief keeps milliseconds (SUB-01): finer times are truncated
  and the truncation reported.
- A track name containing spaces is quoted: "CARPET bag".
- Degrees, minutes and seconds may each have decimals. The latitude
  hemisphere may be run together with the longitude degrees ("N021").
- Course is true degrees, speed knots, depth metres or NaN.

Lines starting with ';' are other record types (sensor, narrative,
annotation and so on). This reader counts them so an import can report what
it did not take, rather than dropping them silently.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime

from debrief_kernel.time import to_epoch_ms

TWO_DIGIT_YEAR_START = 1950

# REP symbology colour letters (second character), from legacy ImportReplay.
SYMBOLOGY_COLOURS = {
    "@": "#ffffff",
    "A": "#0064bd",  # blue
    "B": "#00800b",  # green
    "C": "#e01c3e",  # red
    "D": "#ffd700",  # yellow
    "E": "#ff00ff",  # magenta
    "F": "#ff9600",  # orange
    "G": "#a100e6",  # purple
    "H": "#00ffff",  # cyan
    "I": "#996600",  # brown
    "J": "#58ff00",  # light green
    "K": "#ff4dff",  # pink
    "L": "#e6c814",  # gold
    "M": "#ededed",  # light grey
    "N": "#808080",  # grey
    "O": "#c0c0c0",  # dark grey (legacy value)
    "P": "#fffffe",  # white
    "Q": "#1a1a1a",  # black
    "R": "#a5bfdd",  # medium blue
    "S": "#6595cc",  # dark blue
}
DEFAULT_COLOUR = SYMBOLOGY_COLOURS["C"]  # legacy falls back to red


class RepError(ValueError):
    """A line could not be read as a REP fix."""


@dataclass(frozen=True)
class RepFix:
    time_ms: int
    time_truncated: bool
    track: str
    symbology: str
    latitude: float
    longitude: float
    course_deg: float
    speed_kn: float
    depth_m: float | None
    label: str | None = None
    comment: str | None = None


@dataclass
class RepFile:
    fixes: list[RepFix] = field(default_factory=list)
    # Other record types by their leading token, such as ";SENSOR:".
    other_records: Counter[str] = field(default_factory=Counter)
    # (line number, problem) for lines that could not be read.
    errors: list[tuple[int, str]] = field(default_factory=list)


def colour_for(symbology: str) -> str:
    if len(symbology) < 2:
        return DEFAULT_COLOUR
    return SYMBOLOGY_COLOURS.get(symbology[1].upper(), DEFAULT_COLOUR)


def _pad(token: str) -> str:
    return token.rjust(6, "0") if len(token) < 6 else token


def parse_time(date_token: str, time_token: str) -> tuple[int, bool]:
    """Epoch milliseconds, and whether finer digits were truncated."""
    whole, _, fraction = time_token.partition(".")
    if not (date_token.isdigit() and whole.isdigit() and (fraction == "" or fraction.isdigit())):
        raise RepError(f"{date_token} {time_token} is not a date and time")
    if len(fraction) > 6:
        raise RepError(f"{time_token}: finer than a microsecond")
    date = date_token if len(date_token) == 8 else _pad(date_token)
    clock = _pad(whole)
    if len(date) == 8:
        year, rest = int(date[:4]), date[4:]
    elif len(date) == 6:
        two = int(date[:2])
        year = 1900 + two if two >= TWO_DIGIT_YEAR_START - 1900 else 2000 + two
        rest = date[2:]
    else:
        raise RepError(f"{date_token}: a date has six or eight digits")
    if len(clock) != 6:
        raise RepError(f"{time_token}: a time has at most six digits before the decimal point")
    micros = int(fraction.ljust(6, "0")) if fraction else 0
    try:
        instant = datetime(
            year,
            int(rest[:2]),
            int(rest[2:]),
            int(clock[:2]),
            int(clock[2:4]),
            int(clock[4:]),
            micros,
            tzinfo=UTC,
        )
    except ValueError as error:
        raise RepError(f"{date_token} {time_token}: {error}") from None
    truncated = micros % 1000 != 0
    instant = instant.replace(microsecond=micros - micros % 1000)
    return to_epoch_ms(instant), truncated


def _number(token: str, what: str) -> float:
    try:
        value = float(token)
    except ValueError:
        raise RepError(f"{token!r} is not a number ({what})") from None
    return value


def _angle(degrees: float, minutes: float, seconds: float, hemisphere: str, negative: str) -> float:
    value = degrees + minutes / 60.0 + seconds / 3600.0
    return -value if hemisphere.upper() == negative else value


def _split_name(rest: str) -> tuple[str, str]:
    """The track name, quoted if it holds spaces, and the remainder of the line."""
    rest = rest.lstrip()
    if rest.startswith('"'):
        end = rest.find('"', 1)
        if end < 0:
            raise RepError("track name has an opening quote but no closing quote")
        return rest[1:end].strip(), rest[end + 1 :]
    parts = rest.split(None, 1)  # any whitespace: legacy files often use tabs
    return parts[0], parts[1] if len(parts) > 1 else ""


def parse_fix(line: str) -> RepFix:
    tokens = line.split(None, 2)
    if len(tokens) < 3:
        raise RepError("too few fields for a fix")
    time_ms, truncated = parse_time(tokens[0], tokens[1])
    track, rest = _split_name(tokens[2])
    if not track:
        raise RepError("missing track name")
    spans = list(re.finditer(r"\S+", rest))
    if len(spans) < 2:
        raise RepError("too few fields for a fix")
    symbology = spans[0].group(0)
    spans = spans[1:]
    fields = [m.group(0) for m in spans]

    try:
        lat_d, lat_m, lat_s = (_number(f, "latitude") for f in fields[0:3])
        marker = fields[3]
        if marker[0].upper() not in "NS":
            raise RepError(f"{marker!r} is not a latitude hemisphere")
        lat_h = marker[0]
        if len(marker) > 1:  # hemisphere run into longitude degrees: "N021"
            lon_d, index = _number(marker[1:], "longitude"), 4
        else:
            lon_d, index = _number(fields[4], "longitude"), 5
        lon_m = _number(fields[index], "longitude")
        lon_s = _number(fields[index + 1], "longitude")
        lon_h = fields[index + 2][0]
        if lon_h.upper() not in "EW":
            raise RepError(f"{fields[index + 2]!r} is not a longitude hemisphere")
        course = _number(fields[index + 3], "course")
        speed = _number(fields[index + 4], "speed")
        depth_token = fields[index + 5]
    except IndexError:
        raise RepError("too few fields for a fix") from None

    depth = None if depth_token == "NaN" else _number(depth_token, "depth")
    latitude = _angle(lat_d, lat_m, lat_s, lat_h, "S")
    longitude = _angle(lon_d, lon_m, lon_s, lon_h, "W")
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise RepError(f"position {latitude:.4f}, {longitude:.4f} is out of range")
    if not (math.isfinite(course) and math.isfinite(speed)):
        raise RepError("course and speed must be numbers")

    # The label is the rest of the line, spacing kept, as legacy reads it.
    label = comment = None
    text = rest[spans[index + 5].end() :].strip()
    if text:
        head, separator, tail = text.partition("//")
        label = head.strip() or None
        comment = (tail.strip() or None) if separator else None

    return RepFix(
        time_ms,
        truncated,
        track,
        symbology,
        latitude,
        longitude,
        course,
        speed,
        depth,
        label,
        comment,
    )


_RECORD_TYPE = re.compile(r";\S*")


def parse_rep(text: str) -> RepFile:
    """Read every line: fixes are parsed, other record types counted, bad lines reported."""
    result = RepFile()
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith(";"):
            result.other_records[_RECORD_TYPE.match(line).group(0)] += 1
            continue
        try:
            result.fixes.append(parse_fix(line))
        except RepError as error:
            result.errors.append((number, str(error)))
    return result
