"""The scripted narrative: each serial's log of events, as plain text with Zulu times.

A narrative line is the date and time, the platform and the entry, separated
by two spaces:

    15 Jun 2023 08:40:00Z  BLUE ONE  Came to 270.0°T, 6.0 kn.

Entries come from the serial's script, from the legs each platform was
ordered to steer, and from what happened: contacts gained and lost, the
closest approach of blue and red, and AIS vessels passing close to the
ownship. Values are written by the display formatting service (SUB-04).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime

from debrief_kernel.formatting import (
    DEFAULT_SETTINGS,
    format_bearing,
    format_quantity,
    format_time,
)
from debrief_kernel.geodesy import ClosestApproach, TrackPath, closest_approach, range_between
from debrief_kernel.time import to_epoch_ms
from debrief_kernel.units import Quantity, bearing_difference, normalise_bearing
from debrief_sample.exercise import BLUE, CONTROL, RED, Platform, Serial
from debrief_sample.synth import Bearing, Contact

DATE_TIME = DEFAULT_SETTINGS.model_copy(update={"time_style": "date_time"})
METRES = DEFAULT_SETTINGS.model_copy(update={"length_unit": "m", "length_decimals": 0})
AIS_CPA_REPORT_NMI = 3.0
REPORT_MS = 30 * 60_000
STEADY_DEG_MIN = 0.2
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_LINE = re.compile(r"(\d{1,2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2})Z  (\S.*?)  (\S.*)")


@dataclass(frozen=True)
class Entry:
    time_ms: int
    platform: str
    text: str


def _leg_entries(serial: Serial, platform: Platform, with_depth: bool) -> list[Entry]:
    entries = []
    minute = 0
    for index, leg in enumerate(platform.legs):
        steer = f"{format_bearing(Quantity(leg.course_deg, 'deg'))}, "
        steer += format_quantity(Quantity(leg.speed_kn, "[kn_i]"))
        if with_depth:
            steer += ", " + format_quantity(Quantity(leg.depth_m, "m"), METRES)
        verb = "Steady on" if index == 0 else "Came to"
        entries.append(Entry(serial.start_ms + minute * 60_000, platform.name, f"{verb} {steer}."))
        minute += leg.minutes
    return entries


def _contact_entries(serial: Serial, contacts: list[Contact]) -> list[Entry]:
    deaf_starts = {serial.start_ms + a * 60_000 for a, _ in serial.deaf}
    entries = []
    for index, contact in enumerate(contacts):
        bearing = format_bearing(Quantity(contact.start.bearing_deg, "deg"))
        if index == 0:
            text = f"Bow sonar contact, bearing {bearing}. Classified submarine: {RED}."
        else:
            text = f"Regained contact on {RED}, bearing {bearing}."
        entries.append(Entry(contact.start.time_ms, BLUE, text))
        lost_to_sprint = any(0 < start - contact.end.time_ms <= 60_000 for start in deaf_starts)
        if contact.end.time_ms < serial.end_ms and not lost_to_sprint:
            last = format_bearing(Quantity(contact.end.bearing_deg, "deg"))
            entries.append(
                Entry(contact.end.time_ms, BLUE, f"Lost contact on {RED}, last bearing {last}.")
            )
    return entries


def _mean_bearing(bearings: list[Bearing]) -> float:
    """Circular mean, so bearings either side of north average correctly."""
    east = sum(math.sin(math.radians(b.bearing_deg)) for b in bearings)
    north = sum(math.cos(math.radians(b.bearing_deg)) for b in bearings)
    return normalise_bearing(math.degrees(math.atan2(east, north)))


def _bearing_reports(serial: Serial, bearings: list[Bearing]) -> list[Entry]:
    """Every half hour in contact, the target's bearing and which way it is drawing."""
    entries = []
    for time_ms in range(serial.start_ms + REPORT_MS, serial.end_ms, REPORT_MS):
        recent = [b for b in bearings if time_ms - 2 * 60_000 <= b.time_ms <= time_ms]
        earlier = [b for b in bearings if time_ms - 7 * 60_000 <= b.time_ms <= time_ms - 5 * 60_000]
        if len(recent) < 3 or len(earlier) < 3:
            continue
        now = _mean_bearing(recent)
        rate = bearing_difference(now, _mean_bearing(earlier)) / 5.0
        if abs(rate) < STEADY_DEG_MIN:
            drift = "steady"
        else:
            drift = "drawing right" if rate > 0 else "drawing left"
        bearing = format_bearing(Quantity(now, "deg"))
        entries.append(Entry(time_ms, BLUE, f"{RED} bearing {bearing}, {drift}."))
    return entries


def _sprint_entries(serial: Serial) -> list[Entry]:
    entries = []
    for start, end in serial.deaf:
        entries.append(Entry(serial.start_ms + start * 60_000, BLUE, "Sprinting: sonar off."))
        entries.append(Entry(serial.start_ms + end * 60_000, BLUE, "Drifting: sonar listening."))
    return entries


def _closest(a: TrackPath, b: TrackPath) -> ClosestApproach | None:
    """Closest approach, searched only around the closest whole minute, for speed."""
    start, end = max(a.start_ms, b.start_ms), min(a.end_ms, b.end_ms)
    if start > end:
        return None
    nearest = min(
        range(start, end + 1, 60_000),
        key=lambda t: range_between(a.position_at(t), b.position_at(t)).value,
    )
    return closest_approach(a, b, nearest - 60_000, nearest + 60_000)


def _cpa_entries(blue: TrackPath, red: TrackPath, ais: dict[str, TrackPath]) -> list[Entry]:
    entries = []
    cpa = _closest(blue, red)
    if cpa is not None:
        entries.append(
            Entry(
                cpa.time_ms,
                CONTROL,
                f"Closest approach of {BLUE} and {RED}: {format_quantity(cpa.range)}.",
            )
        )
    for name, path in ais.items():
        cpa = _closest(blue, path)
        if cpa is not None and cpa.range.to("[nmi_i]").value <= AIS_CPA_REPORT_NMI:
            entries.append(
                Entry(cpa.time_ms, BLUE, f"{name} passed clear at {format_quantity(cpa.range)}.")
            )
    return entries


def entries(
    serial: Serial,
    blue: TrackPath,
    red: TrackPath,
    bearings: list[Bearing],
    contacts: list[Contact],
    ais: dict[str, TrackPath],
) -> list[Entry]:
    """Every narrative entry for a serial, in time order (script first at equal times)."""
    scripted = [
        Entry(serial.start_ms + line.minute * 60_000, line.platform, line.text)
        for line in serial.script
    ]
    found = (
        _leg_entries(serial, serial.blue, with_depth=False)
        + _leg_entries(serial, serial.red, with_depth=True)
        + _sprint_entries(serial)
        + _contact_entries(serial, contacts)
        + _bearing_reports(serial, bearings)
        + _cpa_entries(blue, red, ais)
    )
    # Truncate to whole seconds, as a log keeper would write them.
    found = [Entry(e.time_ms - e.time_ms % 1000, e.platform, e.text) for e in found]
    return sorted(scripted + found, key=lambda e: e.time_ms)


def write(serial: Serial, items: list[Entry]) -> str:
    width = max(len(e.platform) for e in items)
    lines = [
        f"# Narrative, {serial.title} of the Debrief sample exercise. Times are Zulu.",
        "# Fiction: the exercise and its platforms are invented; AIS vessel names are generated.",
    ]
    for entry in items:
        if "  " in entry.text or "  " in entry.platform:
            raise ValueError(f"narrative text may not hold two spaces together: {entry.text!r}")
        when = format_time(entry.time_ms, DATE_TIME)
        lines.append(f"{when}  {entry.platform.ljust(width)}  {entry.text}")
    return "\n".join(lines) + "\n"


def parse(text: str) -> list[Entry]:
    """Read a narrative back. Lines starting with '#' are comments."""
    result = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip() or line.startswith("#"):
            continue
        match = _LINE.fullmatch(line)
        if match is None or match.group(2) not in _MONTHS:
            raise ValueError(f"narrative line {number} is not 'DD Mon YYYY HH:MM:SSZ  WHO  TEXT'")
        day, month, year, hour, minute, second, platform, body = match.groups()
        instant = datetime(
            int(year),
            _MONTHS.index(month) + 1,
            int(day),
            int(hour),
            int(minute),
            int(second),
            tzinfo=UTC,
        )
        result.append(Entry(to_epoch_ms(instant), platform.strip(), body))
    return result
