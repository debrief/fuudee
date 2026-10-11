"""The builder's parts: track synthesis, REP lines, bearings and the narrative format."""

from __future__ import annotations

import pytest

from debrief_io import parse_fix
from debrief_kernel.geodesy import Position, TrackPath
from debrief_sample import narrative
from debrief_sample.ais import vessel_type
from debrief_sample.exercise import SERIALS
from debrief_sample.synth import (
    Fix,
    _turn,
    generator,
    rep_line,
    simulate,
    sonar_bearings,
)


def test_turns_go_the_short_way_round() -> None:
    assert _turn(350.0, 10.0, 30.0) == 10.0
    assert _turn(350.0, 60.0, 30.0) == 20.0
    assert _turn(10.0, 300.0, 30.0) == 340.0


def test_rep_line_reads_back_through_debrief_io() -> None:
    fix = Fix(1_686_816_000_000, Position(-75.123456, 36.987654), 45.25, 9.8, 120.0)
    parsed = parse_fix(rep_line("BLUE ONE", "@A", fix))
    assert parsed.track == "BLUE ONE"
    assert parsed.time_ms == fix.time_ms
    arc = 3e-6  # REP positions are written to hundredths of a second of arc
    assert parsed.longitude == pytest.approx(fix.position.longitude, abs=arc)
    assert parsed.latitude == pytest.approx(fix.position.latitude, abs=arc)
    assert (parsed.course_deg, parsed.speed_kn, parsed.depth_m) == (45.2, 9.8, 120.0)


def test_simulation_is_repeatable_and_one_fix_a_minute() -> None:
    serial = SERIALS[0]
    a = simulate(serial.blue, serial.start_ms, generator(1, "x"))
    b = simulate(serial.blue, serial.start_ms, generator(1, "x"))
    assert a == b
    assert len(a) == serial.minutes + 1
    assert a[-1].time_ms == serial.end_ms


def test_no_bearings_while_deaf_or_out_of_range() -> None:
    serial = SERIALS[2]
    blue = simulate(serial.blue, serial.start_ms, generator(1, "blue"))
    red = simulate(serial.red, serial.start_ms, generator(1, "red"))
    paths = [TrackPath([f.time_ms for f in t], [f.position for f in t]) for t in (blue, red)]
    deaf = [(serial.start_ms + a * 60_000, serial.start_ms + b * 60_000) for a, b in serial.deaf]
    bearings, contacts = sonar_bearings(
        *paths,
        interval_ms=30_000,
        detection_range_m=8 * 1852.0,
        bearing_sd_deg=1.5,
        deaf_ms=deaf,
        rng=generator(1, "bearings"),
    )
    assert bearings and contacts
    assert not any(a <= b.time_ms < z for b in bearings for a, z in deaf)
    assert sum(1 for _ in contacts) >= 2


def test_narrative_round_trips() -> None:
    serial = SERIALS[0]
    entries = [
        narrative.Entry(serial.start_ms, "EXCON", "Serial 1 started."),
        narrative.Entry(serial.start_ms + 90_000, "BLUE ONE", "Came to 270.0°T, 6.0 kn."),
    ]
    text = narrative.write(serial, entries)
    assert "15 Jun 2023 08:01:30Z  BLUE ONE  Came to 270.0°T, 6.0 kn." in text
    assert narrative.parse(text) == entries


def test_narrative_refuses_a_malformed_line() -> None:
    with pytest.raises(ValueError, match="line 1"):
        narrative.parse("08:00Z BLUE ONE something\n")


@pytest.mark.parametrize(
    ("code", "expected"),
    [("70", "Cargo"), ("84", "Tanker"), ("30", "Fishing"), ("35", None), ("55", None), ("", None)],
)
def test_vessel_types(code: str, expected: str | None) -> None:
    assert vessel_type(code) == expected
