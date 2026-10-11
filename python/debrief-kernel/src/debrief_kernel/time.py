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
