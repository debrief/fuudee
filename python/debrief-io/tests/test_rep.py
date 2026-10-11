"""REP fix parsing, ported from legacy Debrief's ImportFix and DebriefFormatDateTime tests."""

from datetime import UTC, datetime

import pytest

from debrief_io import RepError, parse_fix, parse_rep, parse_time
from debrief_kernel.time import format_utc

LINE = "951212 051600 CARPET   @C   22 10 53.54 N 21 45 14.20 W 239.9   2.0      0 "


def _utc(*args: int) -> int:
    return int(datetime(*args, tzinfo=UTC).timestamp() * 1000)


def test_values() -> None:
    fix = parse_fix(LINE)
    assert fix.track == "CARPET"
    assert fix.symbology == "@C"
    assert fix.course_deg == pytest.approx(239.9)
    assert fix.speed_kn == pytest.approx(2.0)
    assert fix.depth_m == 0.0
    assert fix.latitude == pytest.approx(22 + 10 / 60 + 53.54 / 3600)
    assert fix.longitude == pytest.approx(-(21 + 45 / 60 + 14.20 / 3600))
    assert format_utc(fix.time_ms) == "1995-12-12T05:16:00.000Z"


@pytest.mark.parametrize(
    "line",
    [
        '951212 051600 "CARPET bag"     @C 22 10 53.54 N 21 45 14.20 W 239.9   2.0      0 ',
        '19951212 051600 "CARPET bag"     @C 22 10 53.54 N 21 45 14.20 W 239.9   2.0      0 ',
        '951212 051600 "CARPET bag" @C 22 10 53.54 N 021 45 14.20 W 239.9 2.0 0.0',
    ],
)
def test_quoted_names_and_four_digit_years(line: str) -> None:
    fix = parse_fix(line)
    assert fix.track == "CARPET bag"
    assert fix.symbology == "@C"
    assert fix.course_deg == pytest.approx(239.9)
    assert datetime.fromtimestamp(fix.time_ms / 1000, UTC).year == 1995


def test_tab_separated_fields_and_symbology_attributes() -> None:
    # As in legacy sample files: tabs between fields, attributes on the symbology.
    fix = parse_fix(
        "951212\t050000.000\tMISSILE_ROTATION\t@C[SYMBOL=missile]\t22\t12\t23.63\tN"
        "\t21\t32\t7.88\tW\t212.2\t4\t15\r"
    )
    assert (fix.track, fix.symbology, fix.depth_m) == (
        "MISSILE_ROTATION",
        "@C[SYMBOL=missile]",
        15.0,
    )
    assert fix.latitude == pytest.approx(22 + 12 / 60 + 23.63 / 3600)


def test_quoted_single_character_name() -> None:
    assert (
        parse_fix('951212 051600 "1"     @C 22 10 53.54 N 21 45 14.20 W 239.9   2.0      0 ').track
        == "1"
    )


@pytest.mark.parametrize(
    ("line", "lat", "lon"),
    [
        (
            "951212 051600 CARPET   @C   22 0 45 N 22 0 1.45 W 239.9   2.0      0 ",
            22.0125,
            -22.000402,
        ),
        (
            "951212 051600 CARPET   @C   22 0.5 00 N 14 0.5 0 W 239.9   2.0      0 ",
            22.008333,
            -14.008333,
        ),
        ("951212 051600 CARPET   @C   22.5 0 00 N 14.5 0 0 W 239.9   2.0      0 ", 22.5, -14.5),
        (
            "951212 051600 CARPET   @C   22 0 45 S 22 0 1.45 E 239.9   2.0      0 ",
            -22.0125,
            22.000402,
        ),
        (
            "951212 051600 CARPET   @C   22 0.5 00 S 14 0.5 0 E 239.9   2.0      0 ",
            -22.008333,
            14.008333,
        ),
        ("951212 051600 CARPET   @C   22.5 0 00 S 14.5 0 0 E 239.9   2.0      0 ", -22.5, 14.5),
    ],
)
def test_decimal_degrees_minutes_seconds(line: str, lat: float, lon: float) -> None:
    fix = parse_fix(line)
    assert fix.latitude == pytest.approx(lat, abs=1e-5)
    assert fix.longitude == pytest.approx(lon, abs=1e-5)


def test_hemisphere_run_into_longitude() -> None:
    fix = parse_fix("951212 051600 CARPET @C 22 10 53.54 N021 45 14.20 W 239.9 2.0 0")
    assert fix.longitude == pytest.approx(-(21 + 45 / 60 + 14.20 / 3600))


@pytest.mark.parametrize(
    ("text", "label", "comment"),
    [
        ("brian may smells", "brian may smells", None),
        ("brian may smells   ", "brian may smells", None),
        ("a   ", "a", None),
        ("two  spaces kept", "two  spaces kept", None),
        ("label // and a comment", "label", "and a comment"),
        ("// comment only", None, "comment only"),
    ],
)
def test_labels_and_comments(text: str, label: str | None, comment: str | None) -> None:
    fix = parse_fix(f"951212 051600 CARPET   @C   22.5 0 00 S 14.5 0 0 E 239.9   2.0      0 {text}")
    assert (fix.label, fix.comment) == (label, comment)


def test_nan_depth() -> None:
    assert (
        parse_fix("951212 051600 CARPET @C 22 10 53.54 N 21 45 14.20 W 239.9 2.0 NaN").depth_m
        is None
    )


@pytest.mark.parametrize(
    ("time_token", "hms"),
    [
        ("051600.000100", (5, 16, 0)),
        ("51600.000100", (5, 16, 0)),
        ("1600.000100", (0, 16, 0)),
        ("600.000100", (0, 6, 0)),
        ("00.000100", (0, 0, 0)),
        ("0.000100", (0, 0, 0)),
        ("51600", (5, 16, 0)),
        ("1600", (0, 16, 0)),
        ("600", (0, 6, 0)),
        ("00", (0, 0, 0)),
    ],
)
def test_short_times_are_padded(time_token: str, hms: tuple[int, int, int]) -> None:
    epoch_ms, _ = parse_time("951212", time_token)
    when = datetime.fromtimestamp(epoch_ms // 1000, UTC)
    assert (when.hour, when.minute, when.second) == hms


@pytest.mark.parametrize(
    ("date_token", "year"),
    [
        ("951212", 1995),
        ("51212", 2005),
        ("500101", 1950),
        ("491231", 2049),
        ("461231", 2046),
        ("080101", 2008),
        ("19450101", 1945),
        ("20500101", 2050),
        ("80101", 2008),
    ],
)
def test_two_digit_year_window(date_token: str, year: int) -> None:
    epoch_ms, _ = parse_time(date_token, "000000")
    assert datetime.fromtimestamp(epoch_ms / 1000, UTC).year == year


@pytest.mark.parametrize(
    ("time_token", "millis", "truncated"),
    [
        ("000000", 0, False),
        ("000000.001", 1, False),
        ("000001.", 1000, False),
        ("000001.0", 1000, False),
        ("000001.01", 1010, False),
        ("000001.01001", 1010, True),
        ("000000.000001", 0, True),
    ],
)
def test_sub_second_parts(time_token: str, millis: int, truncated: bool) -> None:
    epoch_ms, was_truncated = parse_time("700101", time_token)
    assert (epoch_ms, was_truncated) == (millis, truncated)


@pytest.mark.parametrize(
    ("date_token", "time_token"),
    [
        ("700101", "000000.000000000022"),
        ("700001", "010000"),
        ("700100", "010000"),
        ("70a101", "010000"),
    ],
)
def test_malformed_dates_rejected(date_token: str, time_token: str) -> None:
    with pytest.raises(RepError):
        parse_time(date_token, time_token)


@pytest.mark.parametrize(
    "line",
    [
        "951212 051600 CARPET @C 22 10 53.54 X 21 45 14.20 W 239.9 2.0 0",
        "951212 051600 CARPET @C 22 10 53.54 N 21 45 14.20 Q 239.9 2.0 0",
        "951212 051600 CARPET @C 22 10 53.54 N 21 45 14.20 W 239.9",
        "951212 051600 CARPET @C 95 0 0 N 21 45 14.20 W 239.9 2.0 0",
        '951212 051600 "CARPET @C 22 10 53.54 N 21 45 14.20 W 239.9 2.0 0',
        "951212 051600 CARPET @C 22 ten 53.54 N 21 45 14.20 W 239.9 2.0 0",
    ],
)
def test_malformed_fixes_rejected(line: str) -> None:
    with pytest.raises(RepError):
        parse_fix(line)


def test_file_counts_other_records_and_reports_bad_lines() -> None:
    text = "\n".join(
        [
            LINE,
            ";SENSOR: 951212 051600 CARPET @A NULL 270.0 NULL NULL NULL NULL sonar",
            ";SENSOR: 951212 051700 CARPET @A NULL 271.0 NULL NULL NULL NULL sonar",
            ";NARRATIVE: 951212 051600 CARPET COMMENT text",
            "",
            "not a fix at all",
            LINE.replace("051600", "051700"),
        ]
    )
    parsed = parse_rep(text)
    assert len(parsed.fixes) == 2
    assert parsed.other_records == {";SENSOR:": 2, ";NARRATIVE:": 1}
    assert [number for number, _ in parsed.errors] == [6]
