"""Reading REP (replay) files: fix, narrative and sensor lines (EXT-01, EXT-03).

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

Lines starting with ';;' are comments and carry no data. Narrative lines
(;NARRATIVE:, ;NARRATIVE2:) and sensor lines (;SENSOR:, ;SENSOR2:, ;SENSOR3:,
parse_sensor; a .dsf file from the acoustic replay application is these alone)
are read. Other lines starting with ';' are other record types (annotations,
towed-array shapes and so on). This reader counts them so an import can report
what it did not take, rather than dropping them silently.
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


@dataclass(frozen=True)
class RepNarrative:
    """A ;NARRATIVE: or ;NARRATIVE2: line: what its source logged at a time (CAP-20)."""

    time_ms: int
    time_truncated: bool
    source: str
    entry_type: str | None
    text: str
    line: int = 0


@dataclass(frozen=True)
class RepSensorCut:
    """A ;SENSOR:, ;SENSOR2: or ;SENSOR3: line: one cut of a sensor carried by a track
    (CAP-22). bearing is None where the line gives none (NULL, NaN, or a ;SENSOR3:
    frequency-only line); frequency is read only to say it was not imported (EXT-03)."""

    record: str
    time_ms: int
    time_truncated: bool
    track: str
    symbology: str
    origin: tuple[float, float] | None  # (longitude, latitude), recorded with the cut
    bearing: float | None
    ambiguous: float | None
    frequency: float | None
    range_yd: float | None
    sensor: str
    label: str | None
    comment: str | None
    # ;SENSOR3: only: the bearing and frequency accuracy as written, NULL as None.
    bearing_accuracy: str | None = None
    frequency_accuracy: str | None = None
    # A range of 0 on a ;SENSOR2: or ;SENSOR3: line, which legacy drew as a point.
    zero_range: bool = False
    line: int = 0


@dataclass
class RepFile:
    fixes: list[RepFix] = field(default_factory=list)
    narrative: list[RepNarrative] = field(default_factory=list)
    sensor_cuts: list[RepSensorCut] = field(default_factory=list)
    # Other record types by their leading token, such as ";SENSOR:".
    other_records: Counter[str] = field(default_factory=Counter)
    # (line number, problem) for lines that could not be read.
    errors: list[tuple[int, str]] = field(default_factory=list)
    # Comment lines (';;'), which hold no data.
    comments: int = 0


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
        raise RepError(f"'{date_token} {time_token}' is not a date and time")
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


class _Tokens:
    """Java's StringTokenizer, as legacy Debrief reads REP lines with it: each token
    runs to the next delimiter, leading delimiters skipped, and asking for the next
    token with other delimiters keeps them for the tokens after."""

    def __init__(self, text: str):
        self.text = text
        self.pos = 0
        self.delimiters = " \t\n\r\f"

    def next(self, delimiters: str | None = None) -> str:
        if delimiters is not None:
            self.delimiters = delimiters
        text, pos = self.text, self.pos
        while pos < len(text) and text[pos] in self.delimiters:
            pos += 1
        if pos >= len(text):
            raise RepError("too few fields")
        start = pos
        while pos < len(text) and text[pos] not in self.delimiters:
            pos += 1
        self.pos = pos
        return text[start:pos]

    def rest(self) -> str:
        """Everything after the last token, as legacy reads an entry's text."""
        rest, self.pos = self.text[self.pos :], len(self.text)
        return rest


def _quoted(tokens: _Tokens, what: str) -> str:
    """A name, in quotes if it holds spaces: legacy AbstractPlainLineImporter's
    checkForQuotedName. Unlike legacy, text run on after the closing quote is kept for
    the next field, not dropped with the quote."""
    name = tokens.next()
    first = name.find('"')
    if first < 0:
        return name
    if name.find('"', first + 1) >= 0:
        return name[1:-1].strip()  # both quotes in one token: "NELSON"
    pos = tokens.text.find('"', tokens.pos)
    if pos < 0:
        raise RepError(f"the {what} has an opening quote but no closing quote")
    name = (name + tokens.text[tokens.pos : pos])[first + 1 :]
    tokens.pos = pos + 1
    return name.strip()


NARRATIVE_RECORDS = (";NARRATIVE:", ";NARRATIVE2:")


def parse_narrative(line: str, number: int = 0) -> RepNarrative:
    """A narrative line, ported from legacy ImportNarrative and ImportNarrative2:

        ;NARRATIVE:  YYMMDD HHMMSS[.fff] SOURCE TEXT...
        ;NARRATIVE2: YYMMDD HHMMSS[.fff] SOURCE TYPE TEXT...

    Fields are separated by spaces or tabs; the source (and a NARRATIVE2 type) is in
    quotes if it holds spaces; the text is the rest of the line, tabs kept, trimmed. As
    in legacy Debrief a ;NARRATIVE: line has no type: an unquoted source with a space,
    HMS TORBAY, reads as the source HMS and the text TORBAY and the rest.
    """
    tokens = _Tokens(line)
    record = tokens.next()
    if record not in NARRATIVE_RECORDS:
        raise RepError(f"{record} is not a narrative line")
    try:
        date_token, time_token = tokens.next(), tokens.next()
    except RepError:
        raise RepError("a narrative line needs a date and a time") from None
    time_ms, truncated = parse_time(date_token, time_token)
    try:
        source = _quoted(tokens, "source")
        entry_type = _quoted(tokens, "type") if record == ";NARRATIVE2:" else None
    except RepError as error:
        if "quote" in str(error):
            raise
        raise RepError("a narrative line needs its source, and then its text") from None
    if not source:
        raise RepError("a narrative line needs its source")
    text = tokens.rest().strip()
    if not text:
        raise RepError("a narrative line has no text")
    return RepNarrative(time_ms, truncated, source, entry_type or None, text, number)


SENSOR_RECORDS = (";SENSOR:", ";SENSOR2:", ";SENSOR3:")


def _java_split(text: str, separator: str) -> list[str]:
    """Java's String.split: trailing empty strings removed."""
    parts = text.split(separator)
    while parts and parts[-1] == "":
        parts.pop()
    return parts


def legacy_label(content: str | None) -> str | None:
    """The label of a line's text, before any "//": legacy ImportReplay.getLabel."""
    if content is None:
        return None
    if "//" in content:
        parts = _java_split(content.strip(), "//")
        first = parts[0].strip() if parts else ""
        return first or None
    return content.strip() or None


def legacy_comment(content: str | None) -> str | None:
    """The comment after "//" in a line's text: legacy ImportReplay.getComment (the
    second part only, as legacy kept it)."""
    if content is None or "//" not in content:
        return None
    parts = _java_split(content.strip(), "//")
    return parts[1].strip() if len(parts) > 1 else None


def _optional(token: str, what: str) -> float | None:
    """A number, or None for a token starting with N (NULL, NaN), as legacy read them."""
    if token.startswith("N"):
        return None
    return _number(token, what)


def parse_sensor(line: str, number: int = 0) -> RepSensorCut:
    """A sensor line, ported from legacy ImportSensor, ImportSensor2 and ImportSensor3:

        ;SENSOR:  YYMMDD HHMMSS[.SSS] TRACK SYMB (LAT LONG | NULL) BRG RANGE SENSOR [LABEL]
        ;SENSOR2: ... (LAT LONG | NULL) BRG AMBIG FREQ RANGE SENSOR LABEL
        ;SENSOR3: ... (LAT LONG | NULL) BRG BRG_ACC FREQ FREQ_ACC RANGE SENSOR LABEL

    Fields are separated by spaces or tabs; the track and sensor names are in quotes if
    they hold spaces; the label is the rest of the line, a comment after "//". A token
    starting with N (NULL, NaN) is no value. The sensor's position, when given, is in
    degrees, minutes and seconds as a fix's is (the hemisphere may run into the longitude
    degrees). Ranges are in yards; a ;SENSOR: range of 0 is none. Legacy quirks kept: a
    ;SENSOR2: or ;SENSOR3: line must have a label; a ;SENSOR3: line has no ambiguous
    bearing, and from a sensor named UNKNOWN with a frequency, a bearing of 0 is none."""
    tokens = _Tokens(line)
    record = tokens.next()
    if record not in SENSOR_RECORDS:
        raise RepError(f"{record} is not a sensor line")
    try:
        date_token, time_token = tokens.next(), tokens.next()
    except RepError:
        raise RepError("a sensor line needs a date and a time") from None
    time_ms, truncated = parse_time(date_token, time_token)
    try:
        track = _quoted(tokens, "track")
        symbology = tokens.next()
        first = tokens.next().strip()
        origin = None
        if not first.startswith("N"):
            lat_d = _number(first, "sensor latitude")
            lat_m = _number(tokens.next(), "sensor latitude")
            lat_s = _number(tokens.next(), "sensor latitude")
            hemisphere = tokens.next()
            if len(hemisphere) > 3:  # run together, as legacy tells it: "N021"
                lon_d = _number(hemisphere[1:], "sensor longitude")
            else:
                lon_d = _number(tokens.next(), "sensor longitude")
            lat_h = hemisphere[0]
            lon_m = _number(tokens.next(), "sensor longitude")
            lon_s = _number(tokens.next(), "sensor longitude")
            lon_h = tokens.next()[0]
            if lat_h.upper() not in "NS" or lon_h.upper() not in "EW":
                raise RepError("the sensor's position is not a latitude and a longitude")
            latitude = _angle(lat_d, lat_m, lat_s, lat_h, "S")
            longitude = _angle(lon_d, lon_m, lon_s, lon_h, "W")
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise RepError(f"sensor position {latitude:.4f}, {longitude:.4f} is out of range")
            origin = (longitude, latitude)
        bearing = _optional(tokens.next(), "bearing")
        ambiguous = frequency = None
        bearing_accuracy = frequency_accuracy = None
        zero = False
        if record == ";SENSOR:":
            range_value = _optional(tokens.next(), "range")
            range_yd = range_value or None  # legacy: a range of 0 is none
        elif record == ";SENSOR2:":
            ambiguous = _optional(tokens.next(), "ambiguous bearing")
            frequency = _optional(tokens.next(), "frequency")
            range_yd = _optional(tokens.next(), "range")
        else:
            accuracy = tokens.next()
            bearing_accuracy = None if accuracy.startswith("N") else accuracy
            frequency = _optional(tokens.next(), "frequency")
            accuracy = tokens.next()
            frequency_accuracy = None if accuracy.startswith("N") else accuracy
            range_yd = _optional(tokens.next(), "range")
        if record != ";SENSOR:" and range_yd == 0:
            range_yd, zero = None, True
        sensor = _quoted(tokens, "sensor").strip()
    except RepError as error:
        if "quote" in str(error) or "position" in str(error) or "number" in str(error):
            raise
        raise RepError(f"too few fields for a {record} line") from None
    rest = tokens.rest()
    if record != ";SENSOR:" and not rest:
        raise RepError(f"a {record} line needs a label after the sensor's name")
    text = rest.strip() if record == ";SENSOR3:" else (rest or None)
    if (
        record == ";SENSOR3:"
        and sensor == "UNKNOWN"
        and frequency is not None
        and bearing is not None
        and bearing == 0
    ):
        bearing = None  # legacy: such a line is a frequency, not a bearing of 000
    for value, what in ((bearing, "bearing"), (ambiguous, "ambiguous bearing")):
        if value is not None and not math.isfinite(value):
            raise RepError(f"the {what} is not a number")
    return RepSensorCut(
        record,
        time_ms,
        truncated,
        track,
        symbology,
        origin,
        bearing,
        ambiguous,
        frequency,
        range_yd,
        sensor,
        legacy_label(text),
        legacy_comment(text),
        bearing_accuracy,
        frequency_accuracy,
        zero,
        number,
    )


_RECORD_TYPE = re.compile(r";\S*")


def parse_rep(text: str) -> RepFile:
    """Read every line: fixes and narrative lines are parsed, other record types counted,
    bad lines reported."""
    result = RepFile()
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith(";;"):
            result.comments += 1
            continue
        if line.startswith(";"):
            record = _RECORD_TYPE.match(line).group(0)
            if record in NARRATIVE_RECORDS:
                try:
                    result.narrative.append(parse_narrative(line, number))
                except RepError as error:
                    result.errors.append((number, str(error)))
                continue
            if record in SENSOR_RECORDS:
                try:
                    result.sensor_cuts.append(parse_sensor(line, number))
                except RepError as error:
                    result.errors.append((number, str(error)))
                continue
            result.other_records[record] += 1
            continue
        try:
            result.fixes.append(parse_fix(line))
        except RepError as error:
            result.errors.append((number, str(error)))
    return result
