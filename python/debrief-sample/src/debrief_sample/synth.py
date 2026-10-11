"""Synthesised blue and red tracks, written as REP files, and the ownship's sonar bearings.

Every random draw comes from a generator seeded from the build's seed and the
serial, so a build with the same seed gives the same files (SUB-20).
"""

from __future__ import annotations

import math
import random
from bisect import bisect_right
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC

from debrief_kernel.geodesy import Position, TrackPath, destination, range_bearing
from debrief_kernel.time import from_epoch_ms
from debrief_kernel.units import Quantity, bearing_difference, normalise_bearing
from debrief_sample.exercise import Platform

STEP_MS = 60_000
SPEED_RATE_KN_MIN = 1.0
DEPTH_RATE_M_MIN = 5.0
COURSE_JITTER_DEG = 0.6
SPEED_JITTER_KN = 0.1


def generator(seed: int, *labels: str) -> random.Random:
    """A generator for one purpose in one serial, independent of the others."""
    return random.Random(":".join([str(seed), *labels]))


@dataclass(frozen=True)
class Fix:
    time_ms: int
    position: Position
    course_deg: float
    speed_kn: float
    depth_m: float


def _towards(current: float, ordered: float, rate: float) -> float:
    if abs(ordered - current) <= rate:
        return ordered
    return current + math.copysign(rate, ordered - current)


def _turn(current: float, ordered: float, rate: float) -> float:
    """Turn the short way round, by at most rate degrees."""
    difference = bearing_difference(ordered, current)
    if abs(difference) <= rate:
        return ordered
    return normalise_bearing(current + math.copysign(rate, difference))


def simulate(platform: Platform, start_ms: int, rng: random.Random) -> list[Fix]:
    """One fix a minute, following the platform's legs with realistic turns and accelerations."""
    first = platform.legs[0]
    course, speed, depth = first.course_deg, first.speed_kn, first.depth_m
    position = Position(*platform.start)
    fixes: list[Fix] = []
    minute = 0
    for leg in platform.legs:
        for _ in range(leg.minutes):
            course = _turn(course, leg.course_deg, platform.turn_rate_deg_min)
            speed = _towards(speed, leg.speed_kn, SPEED_RATE_KN_MIN)
            depth = _towards(depth, leg.depth_m, DEPTH_RATE_M_MIN)
            # What a platform actually makes good wanders a little about what was ordered.
            made_course = normalise_bearing(course + rng.gauss(0.0, COURSE_JITTER_DEG))
            made_speed = max(0.0, speed + rng.gauss(0.0, SPEED_JITTER_KN))
            fixes.append(Fix(start_ms + minute * STEP_MS, position, made_course, made_speed, depth))
            position = destination(
                position,
                Quantity(made_course, "deg"),
                Quantity(made_speed * 1852.0 / 60.0, "m"),
            )
            minute += 1
    # The final fix closes the serial.
    fixes.append(Fix(start_ms + minute * STEP_MS, position, made_course, made_speed, depth))
    return fixes


def _dms(value: float, positive: str, negative: str, width: int) -> str:
    hemisphere = positive if value >= 0 else negative
    hundredths = round(abs(value) * 360_000)  # hundredths of a second of arc
    degrees, rest = divmod(hundredths, 360_000)
    minutes, rest = divmod(rest, 6_000)
    seconds = rest / 100
    return f"{degrees:0{width}d} {minutes:02d} {seconds:05.2f} {hemisphere}"


def rep_line(name: str, symbology: str, fix: Fix) -> str:
    """A REP fix line, as legacy Debrief writes them."""
    instant = from_epoch_ms(fix.time_ms).astimezone(UTC)
    quoted = f'"{name}"' if " " in name else name
    return " ".join(
        [
            instant.strftime("%y%m%d %H%M%S") + f".{instant.microsecond // 1000:03d}",
            quoted,
            symbology,
            _dms(fix.position.latitude, "N", "S", 2),
            _dms(fix.position.longitude, "E", "W", 3),
            f"{fix.course_deg:05.1f}",
            f"{fix.speed_kn:.1f}",
            f"{fix.depth_m:.1f}",
        ]
    )


def rep_text(platform: Platform, fixes: list[Fix], serial_title: str) -> str:
    header = [
        f";; {platform.name}, {serial_title}: synthesised track for the Debrief sample data.",
        ";; Fiction: not a record of any real platform.",
    ]
    lines = [rep_line(platform.name, platform.symbology, f) for f in fixes]
    return "\n".join(header + lines) + "\n"


@dataclass(frozen=True)
class Bearing:
    time_ms: int
    bearing_deg: float


@dataclass(frozen=True)
class Contact:
    """A period the ownship's sonar held the target."""

    start: Bearing
    end: Bearing


def course_lookup(times_ms: list[int], courses_deg: list[float]) -> Callable[[int], float]:
    """Own course at a time: the course of the latest fix at or before it."""

    def course_at(time_ms: int) -> float:
        return courses_deg[max(0, bisect_right(times_ms, time_ms) - 1)]

    return course_at


@dataclass(frozen=True)
class SonarModel:
    """A simple passive bow sonar.

    The target can be held only within the detection range, outside the
    baffles (the arc either side of dead astern) and while the sonar is
    listening. Within those limits contact comes and goes at random: each
    sample, a target not held is gained with p_gain, and one held is lost
    with p_lose.
    """

    interval_ms: int
    detection_range_m: float
    baffle_half_angle_deg: float
    p_gain: float
    p_lose: float
    bearing_sd_deg: float


def sonar_bearings(
    ownship: TrackPath,
    target: TrackPath,
    *,
    own_course: Callable[[int], float],
    model: SonarModel,
    deaf_ms: list[tuple[int, int]],
    rng: random.Random,
) -> tuple[list[Bearing], list[Contact]]:
    """Noisy true bearings from ownship to target while the sonar holds it.

    The truth is the geodesic bearing between the imported tracks, so the
    bearings agree with what an analyst sees in the plot (SUB-03).
    """
    start = max(ownship.start_ms, target.start_ms)
    end = min(ownship.end_ms, target.end_ms)
    bearings: list[Bearing] = []
    contacts: list[Contact] = []
    run: list[Bearing] = []
    for time_ms in range(start, end + 1, model.interval_ms):
        distance, true_bearing = range_bearing(
            ownship.position_at(time_ms), target.position_at(time_ms)
        )
        astern = normalise_bearing(own_course(time_ms) + 180.0)
        in_baffles = abs(bearing_difference(true_bearing.value, astern)) <= (
            model.baffle_half_angle_deg
        )
        listening = not any(a <= time_ms < b for a, b in deaf_ms)
        possible = listening and not in_baffles and distance.value <= model.detection_range_m
        draw = rng.random()  # drawn every sample, so one change does not shift the rest
        holding = possible and (draw >= model.p_lose if run else draw < model.p_gain)
        if holding:
            noise = rng.gauss(0.0, model.bearing_sd_deg)
            run.append(Bearing(time_ms, round(normalise_bearing(true_bearing.value + noise), 2)))
            continue
        if run:
            contacts.append(Contact(run[0], run[-1]))
            bearings += run
            run = []
    if run:
        contacts.append(Contact(run[0], run[-1]))
        bearings += run
    return bearings, contacts
