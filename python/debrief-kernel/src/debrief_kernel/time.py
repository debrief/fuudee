"""UTC time with millisecond precision (SUB-01).

Inside the kernel an instant is an integer count of milliseconds since the
Unix epoch, which keeps arithmetic exact. At the edges it is a timezone-aware
UTC datetime or the schema's text form, 2026-10-11T09:30:00.000Z. Time-zone
conversion is presentation only and lives in debrief_kernel.formatting.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

_TEXT = re.compile(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z")
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


class TimeError(ValueError):
    """A time could not be read or represented at millisecond precision."""


def parse_utc(text: str) -> int:
    """Read the schema's text form into epoch milliseconds."""
    match = _TEXT.fullmatch(text)
    if match is None:
        raise TimeError(
            f"{text!r} is not a UTC time with milliseconds, such as 2026-10-11T09:30:00.000Z"
        )
    year, month, day, hour, minute, second, millis = (int(g) for g in match.groups())
    try:
        instant = datetime(year, month, day, hour, minute, second, millis * 1000, tzinfo=UTC)
    except ValueError as error:
        raise TimeError(f"{text!r}: {error}") from None
    return to_epoch_ms(instant)


def format_utc(epoch_ms: int) -> str:
    """Write epoch milliseconds in the schema's text form."""
    instant = from_epoch_ms(epoch_ms)
    return instant.strftime("%Y-%m-%dT%H:%M:%S.") + f"{instant.microsecond // 1000:03d}Z"


def to_epoch_ms(instant: datetime) -> int:
    """Convert an aware datetime, refusing anything finer than a millisecond."""
    if instant.tzinfo is None:
        raise TimeError("naive datetime: give a time zone so it can be converted to UTC")
    if instant.microsecond % 1000:
        raise TimeError(f"{instant.isoformat()} is finer than a millisecond; use truncate_to_ms")
    delta = instant - _EPOCH
    return (delta.days * 86_400 + delta.seconds) * 1000 + delta.microseconds // 1000


def from_epoch_ms(epoch_ms: int) -> datetime:
    return _EPOCH + timedelta(milliseconds=epoch_ms)


def truncate_to_ms(instant: datetime) -> tuple[int, bool]:
    """Truncate to milliseconds, reporting whether anything was lost.

    Legacy files may hold sub-millisecond times; the importer truncates them
    and records the truncation in provenance (EXT-14).
    """
    if instant.tzinfo is None:
        raise TimeError("naive datetime: give a time zone so it can be converted to UTC")
    lost = instant.microsecond % 1000
    return to_epoch_ms(instant - timedelta(microseconds=lost)), lost != 0


# --- How often a track's fixes are labelled, marked or arrowed (CAP-32) -------------
# An interval is a whole number of seconds from 1 s to 24 h, as legacy Debrief's
# frequency choices run from 1 second to 24 hours. TypeScript reads and names them the
# same way (vscode/webview/frequencies.ts), held to schemas/vectors/fix-intervals.json.

INTERVAL_MIN_S = 1
INTERVAL_MAX_S = 86_400
INTERVAL_OFF = "off"
_INTERVAL_UNITS = {
    "d": 86_400,
    "day": 86_400,
    "days": 86_400,
    "h": 3600,
    "hr": 3600,
    "hrs": 3600,
    "hour": 3600,
    "hours": 3600,
    "m": 60,
    "min": 60,
    "mins": 60,
    "minute": 60,
    "minutes": 60,
    "s": 1,
    "sec": 1,
    "secs": 1,
    "second": 1,
    "seconds": 1,
}
_INTERVAL_PART = re.compile(r"(\d+(?:\.\d+)?)\s*([a-z]*)")
_NEXT_UNIT = {86_400: 3600, 3600: 60, 60: 1}
INTERVAL_RANGE_PROBLEM = "An interval is from 1 s to 24 h."
INTERVAL_UNIT_PROBLEM = "Say the unit, such as 30 s, 10 min or 1 h 30 min."
INTERVAL_WHOLE_PROBLEM = "Give whole seconds: an interval is from 1 s to 24 h."


class IntervalError(ValueError):
    """Text that is not an interval from 1 s to 24 h, in plain words."""


def read_interval(text: str) -> int | str:
    """Read an interval typed by the analyst: seconds, or INTERVAL_OFF for "off" or
    "none". Units may be written short or long ("90 s", "10 min", "2 hours", "1 day")
    and combined ("1 h 30 min"); a bare number after one with a unit is in the next
    smaller unit ("1h30" is 1 h 30 min, "2m30" 2 min 30 s). Raises IntervalError."""
    said = text.strip().lower()
    if said in ("off", "none"):
        return INTERVAL_OFF
    rest = said.replace(",", " ")
    total = 0.0
    previous: int | None = None
    position = 0
    while position < len(rest):
        if rest[position].isspace():
            position += 1
            continue
        match = _INTERVAL_PART.match(rest, position)
        if match is None:
            raise IntervalError(INTERVAL_UNIT_PROBLEM)
        number, unit = float(match.group(1)), match.group(2)
        if unit:
            size = _INTERVAL_UNITS.get(unit)
            if size is None or (previous is not None and size >= previous):
                raise IntervalError(INTERVAL_UNIT_PROBLEM)
        elif previous in _NEXT_UNIT:
            size = _NEXT_UNIT[previous]
        else:
            raise IntervalError(INTERVAL_UNIT_PROBLEM)
        total += number * size
        previous = size
        position = match.end()
    if previous is None:
        raise IntervalError(INTERVAL_UNIT_PROBLEM)
    seconds = round(total)
    if abs(total - seconds) > 1e-6:
        raise IntervalError(INTERVAL_WHOLE_PROBLEM)
    if not INTERVAL_MIN_S <= seconds <= INTERVAL_MAX_S:
        raise IntervalError(INTERVAL_RANGE_PROBLEM)
    return seconds


def describe_interval(seconds: int) -> str:
    """An interval in words, largest unit first: 90 is "1 min 30 s", 5400 "1 h 30 min",
    86400 "24 h"."""
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    parts = [f"{hours} h"] if hours else []
    parts += [f"{minutes} min"] if minutes else []
    parts += [f"{secs} s"] if secs or not parts else []
    return " ".join(parts)
