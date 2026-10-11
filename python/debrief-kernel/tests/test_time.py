from datetime import UTC, datetime, timedelta, timezone

import pytest

from debrief_kernel.time import (
    TimeError,
    format_utc,
    from_epoch_ms,
    parse_utc,
    to_epoch_ms,
    truncate_to_ms,
)


def test_round_trip_text() -> None:
    text = "2026-10-11T09:30:00.123Z"
    assert format_utc(parse_utc(text)) == text


def test_epoch() -> None:
    assert parse_utc("1970-01-01T00:00:00.000Z") == 0
    assert parse_utc("1969-12-31T23:59:59.999Z") == -1


def test_before_epoch_round_trips() -> None:
    text = "1995-03-14T23:59:59.999Z"
    assert format_utc(parse_utc(text)) == text


@pytest.mark.parametrize(
    "text",
    [
        "2026-10-11T09:30:00Z",  # no milliseconds
        "2026-10-11T09:30:00.000123Z",  # microseconds
        "2026-10-11T09:30:00.000+00:00",  # offset rather than Z
        "2026-02-30T09:30:00.000Z",  # no such date
    ],
)
def test_rejects_other_forms(text: str) -> None:
    with pytest.raises(TimeError):
        parse_utc(text)


def test_offsets_converted_to_utc() -> None:
    local = datetime(2026, 10, 11, 10, 30, tzinfo=timezone(timedelta(hours=1)))
    assert format_utc(to_epoch_ms(local)) == "2026-10-11T09:30:00.000Z"


def test_naive_refused() -> None:
    with pytest.raises(TimeError, match="naive"):
        to_epoch_ms(datetime(2026, 10, 11))


def test_sub_millisecond_refused_but_truncatable() -> None:
    fine = datetime(2026, 10, 11, 9, 30, 0, 123456, tzinfo=UTC)
    with pytest.raises(TimeError):
        to_epoch_ms(fine)
    epoch_ms, truncated = truncate_to_ms(fine)
    assert truncated
    assert format_utc(epoch_ms) == "2026-10-11T09:30:00.123Z"
    assert truncate_to_ms(from_epoch_ms(epoch_ms)) == (epoch_ms, False)
