"""How often a track's fixes are labelled, marked with a symbol and given a direction
arrow (CAP-32): presentation content, held per track and changed as one recorded,
undoable step, as colour is (SUB-22).

Each of a track's label_interval, symbol_interval and arrow_interval is a Duration
(a whole number of seconds from 1 s to 24 h), "off", or left out for Debrief's default
(labels and symbols: none; arrows: a few along the track in the time window). Labels
and symbols may also be "all": at every recorded fix, legacy Debrief's "All"
(decision, product owner, 15 Oct 2026); arrows may not. The map
draws them at each whole multiple of the interval of UTC, as legacy Debrief's
LightweightTrackWrapper.setFixes does (it rounds the track's start up to a multiple of
the frequency): every 10 min is 0900, 0910, 0920, whenever the track starts.

One change may set any of the three on several tracks at once; a member left out stays
as each track has it. The step is named for what it set, such as "Labels every 10 min,
arrows every 5 min on BLUE ONE and RED ONE".
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from debrief_kernel.time import (
    INTERVAL_ALL,
    INTERVAL_MAX_S,
    INTERVAL_MIN_S,
    INTERVAL_OFF,
    IntervalError,
    describe_interval,
    read_interval,
)
from debrief_kernel.units import Quantity
from debrief_schemas import models

FIELDS = ("label_interval", "symbol_interval", "arrow_interval")
# The intervals the forms offer, in seconds: legacy Debrief's, from 1 s to 24 h (as
# PRESETS in vscode/webview/frequencies.ts).
PRESETS = (1, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21_600, 43_200, 86_400)
NOUNS = {"label_interval": "labels", "symbol_interval": "symbols", "arrow_interval": "arrows"}

Interval = models.Duration | models.FixIntervalOffEnum | models.FixIntervalAllEnum | None
# Kinds that may be at every fix: labels and symbols, as legacy Debrief's "All".
AT_EVERY_FIX = ("label_interval", "symbol_interval")
ALL_PROBLEM = "Arrows cannot be at every fix: give an interval, such as 10 min, or off."


def seconds_of(duration: models.Duration) -> float:
    """A stored interval in seconds."""
    unit = getattr(duration.unit, "value", duration.unit)
    return Quantity(duration.value, str(unit)).to("s").value


def duration_of(seconds: int) -> models.Duration:
    """Seconds as a Duration in the largest unit that holds it exactly: 600 is 10 min,
    5400 is 90 min, 90 is 90 s."""
    for unit, size in (("h", 3600), ("min", 60)):
        if seconds % size == 0:
            return models.Duration(value=seconds // size, unit=unit)
    return models.Duration(value=seconds, unit="s")


def interval_from(value: Any, field: str = "label_interval") -> Interval:
    """An interval as a form or an agent gives it for a field: a Duration (or {value,
    unit}), seconds as a number, text such as "10 min" or "1h30", "off", "all" (at
    every fix: labels and symbols only), or None for Debrief's default. Raises
    IntervalError, in plain words."""
    if value is None:
        return None
    if isinstance(value, models.FixIntervalOffEnum):
        return value
    if isinstance(value, models.FixIntervalAllEnum):
        value = INTERVAL_ALL
    if isinstance(value, str):
        read = read_interval(value)
        if read == INTERVAL_ALL:
            if field not in AT_EVERY_FIX:
                raise IntervalError(ALL_PROBLEM)
            return models.FixIntervalAllEnum.all
        return models.FixIntervalOffEnum.off if read == INTERVAL_OFF else duration_of(int(read))
    if isinstance(value, bool):
        raise IntervalError("Give an interval, such as 10 min, or off.")
    if isinstance(value, int | float):
        seconds = float(value)
    else:
        if isinstance(value, dict):
            try:
                value = models.Duration(**value)
            except (TypeError, ValueError):
                raise IntervalError("Give an interval as {value, unit}, such as 10 min.") from None
        if not isinstance(value, models.Duration):
            raise IntervalError("Give an interval, such as 10 min, or off.")
        seconds = seconds_of(value)
    if abs(seconds - round(seconds)) > 1e-6:
        raise IntervalError("Give whole seconds: an interval is from 1 s to 24 h.")
    if not INTERVAL_MIN_S <= round(seconds) <= INTERVAL_MAX_S:
        raise IntervalError("An interval is from 1 s to 24 h.")
    return duration_of(round(seconds))


def same(a: Interval, b: Interval) -> bool:
    """Whether two intervals draw the same: equal durations in any unit, both off, both
    at every fix, or both left out."""
    if isinstance(a, models.Duration) and isinstance(b, models.Duration):
        return abs(seconds_of(a) - seconds_of(b)) < 1e-6
    if a is None or b is None:
        return a is None and b is None
    return _keyword(a) is not None and _keyword(a) == _keyword(b)


def _keyword(value: object) -> str | None:
    """ "off" or "all" for an interval that is one of them, as an enum or as text."""
    if isinstance(value, models.Duration) or value is None:
        return None
    said = str(getattr(value, "value", value))
    return said if said in (INTERVAL_OFF, INTERVAL_ALL) else None


def _off(value: Interval) -> bool:
    return _keyword(value) == INTERVAL_OFF


def describe(field: str, value: Interval) -> str:
    """One part of a step's name: "labels every 10 min", "arrows off", "arrows back to
    the default"."""
    noun = NOUNS[field]
    if value is None:
        return f"{noun} back to the default"
    if _off(value):
        return f"{noun} off"
    if _keyword(value) == INTERVAL_ALL:
        return f"{noun} at every fix"
    return f"{noun} every {describe_interval(round(seconds_of(value)))}"


def describe_track(props: Any) -> str:
    """A track's intervals in words, as its details show them (product owner, 15 Oct
    2026): "Labels every 10 min · Symbols off · Arrows default". Left out is "default".
    As describeFrequencies in vscode/webview/frequencies.ts, held to the shared vectors."""
    parts = []
    for field in FIELDS:
        value = getattr(props, field, None) if not isinstance(props, Mapping) else props.get(field)
        if isinstance(value, dict):
            value = models.Duration(**value)
        if value is None:
            said = "default"
        elif isinstance(value, models.Duration):
            said = f"every {describe_interval(round(seconds_of(value)))}"
        elif _keyword(value) == INTERVAL_ALL:
            said = "at every fix"
        else:
            said = "off"
        parts.append(f"{NOUNS[field].capitalize()} {said}")
    return " · ".join(parts)


def step_name(changes: Mapping[str, Interval], names: list[str]) -> str:
    """The step's name: what was set, then on which tracks (by name for one or two, by
    count for more), such as "Labels every 10 min on 3 tracks"."""
    said = ", ".join(describe(f, changes[f]) for f in FIELDS if f in changes)
    if len(names) == 1:
        who = names[0]
    elif len(names) == 2:
        who = f"{names[0]} and {names[1]}"
    else:
        who = f"{len(names)} tracks"
    return f"{said[:1].upper()}{said[1:]} on {who}"
