"""The scripted narrative: each serial's log of events, as plain text with Zulu times.

A narrative line is the date and time, the platform, the kind of entry and the
entry, separated by two spaces:

    15 Jun 2023 08:40:00Z  BLUE ONE  Course  Came to 270.0°T, 6.0 kn.

Kinds: Course for an ordered leg, Sonar for what the sonar held and when it was
off, CPA for a closest approach, and the script's own (Log, Intention, Weather).

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
    fixed,
    format_bearing,
    format_quantity,
    format_time,
)
from debrief_kernel.geodesy import ClosestApproach, TrackPath, closest_approach, range_between
from debrief_kernel.time import to_epoch_ms
from debrief_kernel.units import Quantity, bearing_difference
from debrief_sample.exercise import BLUE, CONTROL, RED, Platform, Serial
from debrief_sample.synth import Bearing, Contact

DATE_TIME = DEFAULT_SETTINGS.model_copy(update={"time_style": "date_time"})
METRES = DEFAULT_SETTINGS.model_copy(update={"length_unit": "m", "length_decimals": 0})
AIS_CPA_REPORT_NMI = 3.0
REPORT_MS = 30 * 60_000
RATE_WINDOW_MS = 10 * 60_000
STEADY_DEG_MIN = 0.1
CLASSIFY_MS = 8 * 60_000
HOLDING_MS = 2 * 60_000
NOT_REGAINED_MS = 10 * 60_000
FLICKER_MS = 3 * 60_000
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_LINE = re.compile(
    r"(\d{1,2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2})Z  (\S.*?)  +(\S.*?)  +(\S.*)"
)


@dataclass(frozen=True)
class Entry:
    time_ms: int
    platform: str
    text: str
    entry_type: str = "Log"


def _leg_entries(serial: Serial, platform: Platform, with_depth: bool) -> list[Entry]:
    entries = []
    minute = 0
    for index, leg in enumerate(platform.legs):
        steer = f"{format_bearing(Quantity(leg.course_deg, 'deg'))}, "
        steer += format_quantity(Quantity(leg.speed_kn, "[kn_i]"))
        if with_depth:
            steer += ", " + format_quantity(Quantity(leg.depth_m, "m"), METRES)
        verb = "Steady on" if index == 0 else "Came to"
        entries.append(
            Entry(serial.start_ms + minute * 60_000, platform.name, f"{verb} {steer}.", "Course")
        )
        minute += leg.minutes
    return entries


@dataclass(frozen=True)
class Picture:
    """What BLUE ONE's sonar held, and when the contact was classified as RED ONE."""

    bearings: list[Bearing]
    contacts: list[Contact]
    classified_ms: int | None

    def label(self, time_ms: int) -> str:
        classified = self.classified_ms is not None and self.classified_ms <= time_ms
        return RED if classified else "the contact"

    def holding(self, time_ms: int) -> bool:
        """Holding the classified target: classified, with a bearing in the last two minutes."""
        if self.classified_ms is None or self.classified_ms > time_ms:
            return False
        return any(time_ms - HOLDING_MS <= b.time_ms <= time_ms for b in self.bearings)


def picture(bearings: list[Bearing], contacts: list[Contact], interval_ms: int) -> Picture:
    """What the operator would log: classification, and contacts with flickers smoothed.

    Classification comes once the contact has been held for CLASSIFY_MS in
    all. Contacts separated by less than FLICKER_MS are one contact to the
    log keeper, and contacts shorter than a minute go unlogged, though every
    bearing stays in the payload.
    """
    needed = math.ceil(CLASSIFY_MS / interval_ms)
    classified = bearings[needed - 1].time_ms if len(bearings) >= needed else None
    merged: list[Contact] = []
    for contact in contacts:
        if merged and contact.start.time_ms - merged[-1].end.time_ms < FLICKER_MS:
            merged[-1] = Contact(merged[-1].start, contact.end)
        else:
            merged.append(contact)
    logged = [c for c in merged if c.end.time_ms - c.start.time_ms >= 60_000]
    return Picture(bearings, logged, classified)


def _contact_entries(serial: Serial, seen: Picture) -> list[Entry]:
    deaf = [(serial.start_ms + a * 60_000, serial.start_ms + b * 60_000) for a, b in serial.deaf]
    entries = []
    if seen.classified_ms is not None:
        bearing = next(b for b in seen.bearings if b.time_ms == seen.classified_ms)
        text = (
            f"Contact classified submarine, designated {RED}, bearing "
            f"{format_bearing(Quantity(bearing.bearing_deg, 'deg'))}."
        )
        entries.append(Entry(seen.classified_ms, BLUE, text, "Sonar"))
    for index, contact in enumerate(seen.contacts):
        bearing = format_bearing(Quantity(contact.start.bearing_deg, "deg"))
        if index == 0:
            text = f"Bow sonar contact, bearing {bearing}. Classifying."
        else:
            text = f"Regained {seen.label(contact.start.time_ms)}, bearing {bearing}."
        entries.append(Entry(contact.start.time_ms, BLUE, text, "Sonar"))
        lost_to_sprint = any(0 < a - contact.end.time_ms <= 60_000 for a, _ in deaf)
        if contact.end.time_ms < serial.end_ms and not lost_to_sprint:
            last = format_bearing(Quantity(contact.end.bearing_deg, "deg"))
            label = seen.label(contact.end.time_ms)
            entries.append(
                Entry(contact.end.time_ms, BLUE, f"Lost {label}, last bearing {last}.", "Sonar")
            )
    # After a sprint, a target held before it and not found again soon after.
    for a, b in deaf:
        held_before = any(c.start.time_ms < a for c in seen.contacts)
        found = any(
            c.start.time_ms <= b + NOT_REGAINED_MS and c.end.time_ms >= b for c in seen.contacts
        )
        if held_before and not found and b + NOT_REGAINED_MS < serial.end_ms:
            label = seen.label(a)
            entries.append(
                Entry(b + NOT_REGAINED_MS, BLUE, f"Not regained {label} after sprint.", "Sonar")
            )
    return entries


def _bearing_rate(bearings: list[Bearing]) -> tuple[float, float]:
    """Least-squares bearing rate in degrees a minute, and its standard error."""
    t0, b0 = bearings[0].time_ms, bearings[0].bearing_deg
    xs = [(b.time_ms - t0) / 60_000 for b in bearings]
    ys = [bearing_difference(b.bearing_deg, b0) for b in bearings]  # unwrapped about the first
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / sxx
    residual = sum((y - my - slope * (x - mx)) ** 2 for x, y in zip(xs, ys, strict=True))
    return slope, math.sqrt(residual / (n - 2) / sxx)


def _bearing_reports(serial: Serial, seen: Picture) -> list[Entry]:
    """Every half hour in contact, the bearing and its drift over the last ten minutes.

    The drift is a regression over the window. It is called steady unless the
    rate is more than twice its standard error, so noise is not reported as drift.
    """
    entries = []
    for time_ms in range(serial.start_ms + REPORT_MS, serial.end_ms, REPORT_MS):
        window = [b for b in seen.bearings if time_ms - RATE_WINDOW_MS <= b.time_ms <= time_ms]
        if len(window) < 10 or time_ms - window[-1].time_ms > 60_000:
            continue
        if window[-1].time_ms - window[0].time_ms < RATE_WINDOW_MS // 2:
            continue
        rate, error = _bearing_rate(window)
        if abs(rate) <= max(2 * error, STEADY_DEG_MIN):
            drift = "steady"
        else:
            side = "right" if rate > 0 else "left"
            drift = f"drawing {side} {fixed(abs(rate), 1)}°/min"
        bearing = format_bearing(Quantity(window[-1].bearing_deg, "deg"))
        label = seen.label(time_ms)
        label = label[0].upper() + label[1:]
        entries.append(Entry(time_ms, BLUE, f"{label} bearing {bearing}, {drift}.", "Sonar"))
    return entries


def _sprint_entries(serial: Serial) -> list[Entry]:
    entries = []
    for start, end in serial.deaf:
        entries.append(
            Entry(serial.start_ms + start * 60_000, BLUE, "Sprinting: sonar off.", "Sonar")
        )
        entries.append(
            Entry(serial.start_ms + end * 60_000, BLUE, "Drifting: sonar listening.", "Sonar")
        )
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
                "CPA",
            )
        )
    for name, path in ais.items():
        cpa = _closest(blue, path)
        if cpa is not None and cpa.range.to("[nmi_i]").value <= AIS_CPA_REPORT_NMI:
            entries.append(
                Entry(
                    cpa.time_ms,
                    BLUE,
                    f"{name} passed clear at {format_quantity(cpa.range)}.",
                    "CPA",
                )
            )
    return entries


def entries(
    serial: Serial,
    blue: TrackPath,
    red: TrackPath,
    seen: Picture,
    ais: dict[str, TrackPath],
) -> list[Entry]:
    """Every narrative entry for a serial, in time order (script first at equal times).

    A scripted line that depends on holding RED ONE is left out when the
    sonar did not hold it then.
    """
    scripted = [
        Entry(serial.start_ms + line.minute * 60_000, line.platform, line.text, line.entry_type)
        for line in serial.script
        if line.if_holding_at is None or seen.holding(serial.start_ms + line.if_holding_at * 60_000)
    ]
    found = (
        _leg_entries(serial, serial.blue, with_depth=False)
        + _leg_entries(serial, serial.red, with_depth=True)
        + _sprint_entries(serial)
        + _contact_entries(serial, seen)
        + _bearing_reports(serial, seen)
        + _cpa_entries(blue, red, ais)
    )
    # Truncate to whole seconds, as a log keeper would write them.
    found = [Entry(e.time_ms - e.time_ms % 1000, e.platform, e.text, e.entry_type) for e in found]
    return sorted(scripted + found, key=lambda e: e.time_ms)


def write(serial: Serial, items: list[Entry]) -> str:
    width = max(len(e.platform) for e in items)
    kinds = max(len(e.entry_type) for e in items)
    lines = [
        f"# Narrative, {serial.title} of the Debrief sample exercise. Times are Zulu.",
        "# Fiction: the exercise and its platforms are invented; AIS vessel names are generated.",
    ]
    for entry in items:
        if any("  " in t for t in (entry.text, entry.platform, entry.entry_type)):
            raise ValueError(f"narrative text may not hold two spaces together: {entry.text!r}")
        when = format_time(entry.time_ms, DATE_TIME)
        kind = entry.entry_type.ljust(kinds)
        lines.append(f"{when}  {entry.platform.ljust(width)}  {kind}  {entry.text}")
    return "\n".join(lines) + "\n"


def parse(text: str) -> list[Entry]:
    """Read a narrative back. Lines starting with '#' are comments."""
    result = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip() or line.startswith("#"):
            continue
        match = _LINE.fullmatch(line)
        if match is None or match.group(2) not in _MONTHS:
            raise ValueError(
                f"narrative line {number} is not 'DD Mon YYYY HH:MM:SSZ  WHO  KIND  TEXT'"
            )
        day, month, year, hour, minute, second, platform, kind, body = match.groups()
        instant = datetime(
            int(year),
            _MONTHS.index(month) + 1,
            int(day),
            int(hour),
            int(minute),
            int(second),
            tzinfo=UTC,
        )
        result.append(Entry(to_epoch_ms(instant), platform.strip(), body, kind.strip()))
    return result
