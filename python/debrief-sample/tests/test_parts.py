"""The builder's parts: track synthesis, REP lines, bearings and the narrative format."""

from __future__ import annotations

import re
from dataclasses import replace

import pytest

from debrief_io import parse_fix
from debrief_kernel.geodesy import Position, TrackPath, range_bearing
from debrief_kernel.units import bearing_difference
from debrief_sample import narrative
from debrief_sample.ais import vessel_type
from debrief_sample.builder import SONAR
from debrief_sample.exercise import SERIALS
from debrief_sample.synth import (
    Bearing,
    Contact,
    Fix,
    _turn,
    course_lookup,
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


def _serial_paths(serial):
    blue = simulate(serial.blue, serial.start_ms, generator(1, "blue"))
    red = simulate(serial.red, serial.start_ms, generator(1, "red"))
    paths = [TrackPath([f.time_ms for f in t], [f.position for f in t]) for t in (blue, red)]
    course = course_lookup([f.time_ms for f in blue], [f.course_deg for f in blue])
    return paths, course


def test_no_bearings_while_deaf_out_of_range_or_in_the_baffles() -> None:
    serial = SERIALS[2]
    (blue, red), course = _serial_paths(serial)
    deaf = [(serial.start_ms + a * 60_000, serial.start_ms + b * 60_000) for a, b in serial.deaf]
    bearings, contacts = sonar_bearings(
        blue, red, own_course=course, model=SONAR, deaf_ms=deaf, rng=generator(1, "bearings")
    )
    assert bearings and len(contacts) >= 2
    assert not any(a <= b.time_ms < z for b in bearings for a, z in deaf)
    for b in bearings:
        distance, truth = range_bearing(blue.position_at(b.time_ms), red.position_at(b.time_ms))
        assert distance.value <= SONAR.detection_range_m
        astern = (course(b.time_ms) + 180.0) % 360.0
        assert abs(bearing_difference(truth.value, astern)) > SONAR.baffle_half_angle_deg


def test_a_sonar_that_never_detects_gives_no_bearings() -> None:
    serial = SERIALS[0]
    (blue, red), course = _serial_paths(serial)
    deaf_sonar = replace(SONAR, p_gain=0.0)
    bearings, contacts = sonar_bearings(
        blue, red, own_course=course, model=deaf_sonar, deaf_ms=[], rng=generator(1, "b")
    )
    assert (bearings, contacts) == ([], [])


def _bearings(start_ms: int, minutes: int, rate: float, rng_seed: int) -> list[Bearing]:
    rng = generator(rng_seed, "noise")
    return [
        Bearing(start_ms + i * 30_000, (100.0 + rate * i / 2 + rng.gauss(0.0, 1.5)) % 360.0)
        for i in range(minutes * 2 + 1)
    ]


def test_drift_is_steady_when_only_noise() -> None:
    serial = SERIALS[0]
    start = serial.start_ms + 15 * 60_000
    for seed in range(20):
        bearings = _bearings(start, 15, 0.0, seed)
        seen = narrative.picture(bearings, [Contact(bearings[0], bearings[-1])], 30_000)
        (report,) = narrative._bearing_reports(serial, seen)
        assert report.text.endswith("steady."), report.text


def test_drift_reports_a_real_bearing_rate() -> None:
    serial = SERIALS[0]
    bearings = _bearings(serial.start_ms + 15 * 60_000, 15, 1.0, 3)
    seen = narrative.picture(bearings, [Contact(bearings[0], bearings[-1])], 30_000)
    (report,) = narrative._bearing_reports(serial, seen)
    rate = re.search(r"drawing right (\d+\.\d)°/min", report.text)
    assert rate is not None and 0.7 <= float(rate.group(1)) <= 1.3, report.text


def test_classification_waits_and_scripted_lines_need_contact() -> None:
    serial = SERIALS[0]
    start = serial.start_ms + 10 * 60_000
    bearings = _bearings(start, 5, 0.0, 1)  # five minutes: not long enough to classify
    seen = narrative.picture(bearings, [Contact(bearings[0], bearings[-1])], 30_000)
    assert seen.classified_ms is None
    assert seen.label(serial.end_ms) == "the contact"
    assert not seen.holding(start + 5 * 60_000)
    (blue, red), _ = _serial_paths(serial)
    texts = [e.text for e in narrative.entries(serial, blue, red, seen, {})]
    assert not any("simulate an attack" in text for text in texts)
    assert any(text.endswith("Classifying.") for text in texts)


def test_a_target_lost_to_a_sprint_and_not_found_is_logged() -> None:
    serial = SERIALS[2]
    first_sprint = serial.start_ms + serial.deaf[0][0] * 60_000
    bearings = _bearings(first_sprint - 20 * 60_000, 20, 0.0, 2)
    seen = narrative.picture(bearings, [Contact(bearings[0], bearings[-1])], 30_000)
    entries = narrative._contact_entries(serial, seen)
    drift = serial.start_ms + serial.deaf[0][1] * 60_000
    assert (
        narrative.Entry(
            drift + narrative.NOT_REGAINED_MS, "BLUE ONE", "Not regained RED ONE after sprint."
        )
        in entries
    )


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
