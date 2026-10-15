"""Narrative entries: one combined Zulu time axis, added, changed and deleted by hand
(CAP-05, CAP-19, CAP-20).

Every narrative feature in a plot (kind narrative, null geometry) together makes the
plot's narrative, however many sources it came from: a REP file's ;NARRATIVE: lines, a
legacy plot's narrative layers, the sample's scripted log, entries typed by the analyst,
and, later, Word and PDF diaries. They are read as one list in one order (order): by
time; at the same time by source, ignoring case, so two platforms' entries at one
second always come in the same order whichever was imported first; and from one source
at one time in the plot's order, which is the order its log gave them. The same rule
orders the Timeline in TypeScript (vscode/webview/timelinelogic.ts); both are held to
schemas/vectors/narrative-order.json. Legacy Debrief sorted entries at one time by
source, then type, then text, which put a log's own order at one second out of order,
and dropped entries identical in all four; here both are kept.

The analyst's form and agents describe an entry the same way (NarrativeSpec: time,
source, type, text and the track it belongs to). This module makes that into a feature,
names each change as the History view shows it ("Narrative entry by BLUE ONE at
08:40:00Z added") and answers queries (debrief/narrative).
"""

from __future__ import annotations

import bisect
import re
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from debrief_kernel.formatting import DEFAULT_SETTINGS, format_time
from debrief_kernel.time import parse_utc
from debrief_schemas import DebriefFeatureCollection, models

KIND = "narrative"
ID_PREFIX = "narrative-"
SPEC_MEMBERS = ("time", "source", "entry_type", "text", "track_id")
DATED = DEFAULT_SETTINGS.model_copy(update={"time_style": "date_time"})


class NarrativeError(ValueError):
    """An entry that cannot be made as described, said in plain words."""


def entries(plot: DebriefFeatureCollection) -> list[models.NarrativeFeature]:
    """The plot's narrative entries, in plot order."""
    return [f for f in plot.features if f.properties.kind == KIND]


def order_key(time_ms: int, source: str, index: int) -> tuple[int, str, str, int]:
    """Where an entry comes in the narrative: by time, then source ignoring case (and,
    for sources differing only in case, as written), then plot order."""
    return (time_ms, source.lower(), source, index)


def order(features: Iterable[models.NarrativeFeature]) -> list[models.NarrativeFeature]:
    """Entries in the narrative's order (see the module description). Stable."""
    listed = list(features)
    keys = [
        order_key(parse_utc(f.properties.time), f.properties.source, i)
        for i, f in enumerate(listed)
    ]
    return [listed[i] for i in sorted(range(len(listed)), key=keys.__getitem__)]


def current_index(times_ms: Sequence[int], time_ms: int) -> int:
    """The entry current time is at: the last at or before it, in an ordered list of
    times; -1 if none has come yet."""
    return bisect.bisect_right(times_ms, time_ms) - 1


@dataclass(frozen=True)
class Query:
    """Which entries a reader or an agent wants: by source, by type, by text found in the
    entry (its text, source or type, ignoring case) and within a period, ends included.
    Members left out do not filter."""

    sources: frozenset[str] | None = None
    types: frozenset[str] | None = None
    text: str | None = None
    start_ms: int | None = None
    end_ms: int | None = None

    def matches(self, feature: models.NarrativeFeature, time_ms: int) -> bool:
        props = feature.properties
        if self.sources is not None and props.source not in self.sources:
            return False
        if self.types is not None and (props.entry_type or "") not in self.types:
            return False
        if self.start_ms is not None and time_ms < self.start_ms:
            return False
        if self.end_ms is not None and time_ms > self.end_ms:
            return False
        if self.text:
            needle = self.text.casefold()
            haystack = f"{props.text}\n{props.source}\n{props.entry_type or ''}".casefold()
            if needle not in haystack:
                return False
        return True


def query(
    plot: DebriefFeatureCollection, asked: Query | None = None
) -> list[models.NarrativeFeature]:
    """The entries matching asked, in the narrative's order."""
    asked = asked or Query()
    return [f for f in order(entries(plot)) if asked.matches(f, parse_utc(f.properties.time))]


def summary(features: Iterable[models.NarrativeFeature]) -> dict[str, list[dict[str, Any]]]:
    """How many entries each source and each type has, most first, then by name; an entry
    with no type is counted under ""."""
    listed = list(features)
    sources = Counter(f.properties.source for f in listed)
    types = Counter(f.properties.entry_type or "" for f in listed)

    def ranked(counter: Counter[str]) -> list[dict[str, Any]]:
        return [
            {"name": name, "entries": n}
            for name, n in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0].lower(), kv[0]))
        ]

    return {"sources": ranked(sources), "types": ranked(types)}


def as_json(feature: models.NarrativeFeature) -> dict[str, Any]:
    """An entry as debrief/narrative returns it."""
    props = feature.properties
    out: dict[str, Any] = {"id": feature.id, "time": props.time, "source": props.source}
    if props.entry_type:
        out["entry_type"] = props.entry_type
    out["text"] = props.text
    if props.track_id:
        out["track_id"] = props.track_id
    return out


def spec_from(value: models.NarrativeSpec | dict[str, Any]) -> models.NarrativeSpec:
    if isinstance(value, models.NarrativeSpec):
        return value
    if not isinstance(value, dict):
        raise NarrativeError("Describe the entry: its time, who wrote it and its text at least.")
    unknown = sorted(set(value) - set(SPEC_MEMBERS))
    if unknown:
        raise NarrativeError(f"A narrative entry has no {', '.join(unknown)}.")
    try:
        return models.NarrativeSpec.model_validate(value)
    except ValueError:
        raise NarrativeError(
            "The entry is not described properly: give its time as UTC to the "
            "millisecond, such as 2026-10-11T09:30:00.000Z, and its source, type and "
            "text as text."
        ) from None


def spec_of(feature: models.NarrativeFeature) -> models.NarrativeSpec:
    props = feature.properties
    return models.NarrativeSpec(
        time=props.time,
        source=props.source,
        entry_type=props.entry_type,
        text=props.text,
        track_id=props.track_id,
    )


def _text(value: str | None) -> str:
    """Text as logged, its lines kept, without spaces at either end of it or of a line."""
    lines = [line.rstrip() for line in (value or "").replace("\r\n", "\n").split("\n")]
    return "\n".join(lines).strip()


def build(
    spec: models.NarrativeSpec,
    feature_id: str,
    track_ids: set[str],
    previous: models.NarrativeFeature | None = None,
) -> models.NarrativeFeature:
    """The feature a description makes. track_ids are the plot's tracks; an entry may
    belong to one of them. previous, when changing an entry: its provenance carries
    over, and a link to a track since deleted may stay as it was."""
    if spec.time is None:
        raise NarrativeError("Give the entry its time.")
    try:
        parse_utc(spec.time)
    except ValueError:
        raise NarrativeError(f"{spec.time!r} is not a time Debrief can read.") from None
    source = " ".join((spec.source or "").split())
    if not source:
        raise NarrativeError("Say who wrote the entry: its source, such as BLUE ONE.")
    text = _text(spec.text)
    if not text:
        raise NarrativeError("Give the entry some text.")
    entry_type = " ".join((spec.entry_type or "").split()) or None
    track_id = spec.track_id or None
    kept = previous is not None and previous.properties.track_id == track_id
    if track_id is not None and track_id not in track_ids and not kept:
        raise NarrativeError(f"The plot has no track {track_id!r} for the entry to belong to.")
    return models.NarrativeFeature(
        type="Feature",
        id=feature_id,
        geometry=None,
        properties=models.NarrativeProperties(
            kind=KIND,
            time=spec.time,
            source=source,
            entry_type=entry_type,
            text=text,
            track_id=track_id,
            provenance=previous.properties.provenance if previous is not None else None,
        ),
    )


def title_of(feature: models.NarrativeFeature) -> str:
    """What the History view calls an entry: "Narrative entry by BLUE ONE at 08:40:00Z"."""
    props = feature.properties
    return f"Narrative entry by {props.source} at {format_time(parse_utc(props.time))}"


def describe_change(before: models.NarrativeFeature, after: models.NarrativeFeature) -> str | None:
    """The note naming a change to an entry, or None if nothing changed."""
    old, new = spec_of(before), spec_of(after)
    if old == new:
        return None
    changed = [m for m in SPEC_MEMBERS if getattr(old, m) != getattr(new, m)]
    if changed == ["time"]:
        return f"{title_of(before)} moved to {format_time(parse_utc(after.properties.time))}"
    words = {
        "text": "text",
        "source": "source",
        "entry_type": "type",
        "track_id": "track",
        "time": "time",
    }
    said = [words[m] for m in changed]
    listed = said[0] if len(said) == 1 else ", ".join(said[:-1]) + " and " + said[-1]
    return f"{title_of(before)}: {listed} changed"


_NUMBERED = re.compile(re.escape(ID_PREFIX) + r"(\d+)$")


def new_ids(taken: set[str], count: int = 1) -> list[str]:
    """Ids for new entries, narrative-0001 and on, after the highest the plot has."""
    highest = max(
        (int(m.group(1)) for i in taken if (m := _NUMBERED.match(i)) is not None), default=0
    )
    width = max(4, len(str(highest + count)))
    out = []
    n = highest
    while len(out) < count:
        n += 1
        candidate = f"{ID_PREFIX}{n:0{width}d}"
        if candidate not in taken:
            out.append(candidate)
    return out


def track_for(source: str, tracks: dict[str, str]) -> str | None:
    """The track an entry from this source belongs to: the one of the same name, ignoring
    case and spacing; none if there is none, or more than one."""
    key = " ".join(source.split()).casefold()
    found = [i for name, i in tracks.items() if " ".join(name.split()).casefold() == key]
    return found[0] if len(found) == 1 else None


def track_names(plot: DebriefFeatureCollection) -> dict[str, str]:
    """The plot's tracks, name to id; a name used twice keeps its first track."""
    out: dict[str, str] = {}
    for f in plot.features:
        if f.properties.kind == "track":
            out.setdefault(f.properties.name, f.id)
    return out


def period(features: Sequence[models.NarrativeFeature]) -> str | None:
    """The period entries span, as a sentence's end: "15 Jun 2023 08:00:00Z to 11:58:00Z"."""
    if not features:
        return None
    times = sorted(parse_utc(f.properties.time) for f in features)
    first, last = format_time(times[0], DATED), format_time(times[-1], DATED)
    if times[0] // 86_400_000 == times[-1] // 86_400_000:
        last = format_time(times[-1])
    return first if times[0] == times[-1] else f"{first} to {last}"


__all__ = [
    "KIND",
    "NarrativeError",
    "Query",
    "as_json",
    "build",
    "current_index",
    "describe_change",
    "entries",
    "new_ids",
    "order",
    "order_key",
    "period",
    "query",
    "spec_from",
    "spec_of",
    "summary",
    "title_of",
    "track_for",
    "track_names",
]
