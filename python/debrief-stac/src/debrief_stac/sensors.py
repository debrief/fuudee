"""Sensors and their cuts in a plot (CAP-22): built from what importers read, named as
the History view shows them, and resolved.

A sensor is a feature of its own (kind sensor), carried by a host track; each of its cuts
is a feature too (kind sensor_cut), naming the sensor, so resolving one cut, or the cuts
of a period, is one small recorded step (SUB-19), as each narrative entry is. Cuts are
drawn from the host track's position at their time (debrief_kernel.sensors), so editing
the track carries them along, and a TMA solution (CAP-21) can be rooted in their times.

Ambiguity (product owner, 24 Oct 2026): a towed array's cut carries its bearing and the
ambiguous bearing it cannot be told from. Both are drawn until the analyst keeps one, for
one cut (clicking the line kept, or its menu) or for every cut in a period (the time
window, or a selection), as legacy Debrief's Keep port bearing and Keep starboard bearing
did; each is one step, with what was asked in its provenance, and can be undone, or the
cuts made ambiguous again. The cut records which bearing was kept, not the side: the side
depends on the host's course, which a later edit of the track can change.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field

from debrief_kernel.formatting import DEFAULT_SETTINGS, format_time
from debrief_kernel.geodesy import Position, TrackPath
from debrief_kernel.sensors import KEEPS, Place, cut_place, kept_for, side_of
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import DebriefFeatureCollection, models

SENSOR = "sensor"
CUT = "sensor_cut"
CUT_PREFIX = "cut-"
# Legacy Debrief's colour for a sensor whose source gives none: its first cut's, or blue.
DEFAULT_COLOUR = "#0064bd"
SIDES = {"port": "port", "starboard": "starboard"}
DATED = DEFAULT_SETTINGS.model_copy(update={"time_style": "date_time"})


class SensorError(ValueError):
    """A change to sensors or cuts that cannot be made as asked, said in plain words."""


# --- Reading a plot -----------------------------------------------------------------


def sensors(plot: DebriefFeatureCollection) -> list[models.SensorFeature]:
    return [f for f in plot.features if f.properties.kind == SENSOR]


def cuts(plot: DebriefFeatureCollection, sensor_id: str | None = None) -> list:
    """The plot's cuts, of one sensor if named, in time order (plot order at one time)."""
    found = [
        f
        for f in plot.features
        if f.properties.kind == CUT and (sensor_id is None or f.properties.sensor_id == sensor_id)
    ]
    return sorted(found, key=lambda f: f.properties.time)  # stable: plot order at one time


def degrees(angle: models.Angle | None) -> float | None:
    if angle is None:
        return None
    return angle.value if str(angle.unit) == "deg" else angle.value * 180 / 3.141592653589793


def angle(value: float) -> models.Angle:
    return models.Angle(value=value, unit="deg")


def normalised(degrees_value: float) -> float:
    """A bearing from 0 up to 360 degrees, as legacy files may give -153.5 or 360."""
    wrapped = degrees_value % 360.0
    return 0.0 if wrapped == 360.0 else wrapped


def is_ambiguous(cut) -> bool:
    """A cut with two bearings that the analyst has not resolved: both are drawn."""
    return cut.properties.ambiguous_bearing is not None and cut.properties.resolved is None


def kept_bearing(cut) -> float:
    """The bearing a resolved or unambiguous cut is drawn along."""
    props = cut.properties
    if props.resolved is not None and str(props.resolved) == "ambiguous_bearing":
        return degrees(props.ambiguous_bearing)
    return degrees(props.bearing)


# --- Names --------------------------------------------------------------------------


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "unnamed"


def new_sensor_id(host_name: str, name: str, taken: set[str]) -> str:
    base = f"sensor-{_slug(host_name)}-{_slug(name)}"
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    taken.add(candidate)
    return candidate


def new_cut_ids(taken: Iterable[str], count: int) -> list[str]:
    """Ids for new cuts, numbered on from the highest the plot uses: cut-00001 on."""
    highest = 0
    for feature_id in taken:
        if feature_id.startswith(CUT_PREFIX) and feature_id[len(CUT_PREFIX) :].isdigit():
            highest = max(highest, int(feature_id[len(CUT_PREFIX) :]))
    width = max(5, len(str(highest + count)))
    return [f"{CUT_PREFIX}{n:0{width}d}" for n in range(highest + 1, highest + count + 1)]


def when(time: str) -> str:
    """A cut's time as a step names it: 09:31:00Z."""
    return format_time(parse_utc(time), DEFAULT_SETTINGS)


def cut_title(cut, sensor_name: str) -> str:
    """A cut as a step names it: "Towed array cut at 09:31:00Z"."""
    return f"{sensor_name} cut at {when(cut.properties.time)}"


def name_of(feature, by_id: dict) -> str:
    """Any feature's name, as a step says it: a cut by its sensor and time."""
    props = feature.properties
    if props.kind == CUT:
        sensor = by_id.get(props.sensor_id)
        return cut_title(feature, sensor.properties.name if sensor is not None else "Sensor")
    return props.name


# --- Building from what an importer read --------------------------------------------


@dataclass
class ReadCut:
    """A cut as an importer read it, before it is a feature."""

    time_ms: int
    bearing: float
    ambiguous: float | None = None
    resolved: str | None = None
    range_m: float | None = None
    origin: tuple[float, float] | None = None
    label: str | None = None
    comment: str | None = None
    colour: str | None = None
    hidden: bool = False
    # ;SENSOR3:'s bearing accuracy, as written: kept, not drawn.
    bearing_accuracy: str | None = None
    # A derived origin (pinned at a split) and the course pinned with it.
    origin_derived: bool = False
    course: float | None = None


@dataclass
class ReadSensor:
    """A sensor as an importer read it: its name, its host track's id, colour and cuts."""

    name: str
    host_track_id: str
    colour: str = DEFAULT_COLOUR
    legacy_symbology: str | None = None
    hidden: bool = False
    cuts: list[ReadCut] = field(default_factory=list)
    # A towed array's offset astern, metres, and how it follows the ship (a legacy plot's).
    array_offset_m: float | None = None
    array_mode: str | None = None


def build(
    read: list[ReadSensor],
    plot_ids: Iterable[str],
    track_names: dict[str, str],
    existing: dict[tuple[str, str], tuple[str, str]] | None = None,
) -> list:
    """Sensor features, each followed by its cuts in time order, with ids the plot does
    not use. A cut whose colour is its sensor's takes it from the sensor (legacy). A
    sensor of the same name already on the same track (existing: (host, name) to its id
    and colour) is joined, its cuts added to it, as legacy Debrief's TrackWrapper.add
    merged a sensor read again into the one of its name."""
    taken = set(plot_ids)
    total = sum(len(s.cuts) for s in read)
    ids = iter(new_cut_ids(taken, total))
    out: list = []
    for sensor in read:
        joined = (existing or {}).get((sensor.host_track_id, sensor.name))
        if joined is not None:
            sensor_id, colour = joined
            for cut in sorted(sensor.cuts, key=lambda c: c.time_ms):
                out.append(cut_feature(next(ids), sensor_id, cut, colour))
            continue
        sensor_id = new_sensor_id(
            track_names.get(sensor.host_track_id, "track"), sensor.name, taken
        )
        out.append(
            models.SensorFeature(
                type="Feature",
                id=sensor_id,
                geometry=None,
                properties=models.SensorProperties(
                    kind=SENSOR,
                    name=sensor.name,
                    host_track_id=sensor.host_track_id,
                    colour=sensor.colour,
                    legacy_symbology=sensor.legacy_symbology,
                    hidden=True if sensor.hidden else None,
                    array_offset=models.Length(value=sensor.array_offset_m, unit="m")
                    if sensor.array_offset_m
                    else None,
                    array_mode=(sensor.array_mode or "worm_in_hole")
                    if sensor.array_offset_m
                    else None,
                ),
            )
        )
        for cut in sorted(sensor.cuts, key=lambda c: c.time_ms):
            out.append(cut_feature(next(ids), sensor_id, cut, sensor.colour))
    return out


def existing_sensors(plot: DebriefFeatureCollection) -> dict[tuple[str, str], tuple[str, str]]:
    """The plot's sensors by (host, name), to be joined by cuts read again (see build)."""
    out: dict[tuple[str, str], tuple[str, str]] = {}
    for sensor in sensors(plot):
        props = sensor.properties
        out.setdefault((props.host_track_id, props.name), (sensor.id, props.colour))
    return out


def read_cut_of(cut) -> ReadCut:
    """A cut feature as an importer would have read it, to be added to another plot."""
    props = cut.properties
    return ReadCut(
        time_ms=parse_utc(props.time),
        bearing=degrees(props.bearing),
        ambiguous=degrees(props.ambiguous_bearing) if props.ambiguous_bearing else None,
        resolved=str(props.resolved) if props.resolved is not None else None,
        range_m=Quantity(props.range.value, str(props.range.unit)).to("m").value
        if props.range is not None
        else None,
        origin=tuple(props.origin) if props.origin is not None else None,
        label=props.label,
        comment=props.comment,
        colour=props.colour,
        hidden=bool(props.hidden),
        bearing_accuracy=props.bearing_accuracy,
        origin_derived=bool(props.origin_derived),
        course=degrees(props.course) if props.course is not None else None,
    )


def cut_feature(feature_id: str, sensor_id: str, cut: ReadCut, sensor_colour: str):
    return models.SensorCutFeature(
        type="Feature",
        id=feature_id,
        geometry=None,
        properties=models.SensorCutProperties(
            kind=CUT,
            sensor_id=sensor_id,
            time=format_utc(cut.time_ms),
            bearing=angle(normalised(cut.bearing)),
            ambiguous_bearing=angle(normalised(cut.ambiguous))
            if cut.ambiguous is not None
            else None,
            resolved=cut.resolved if cut.ambiguous is not None else None,
            range=models.Length(value=cut.range_m, unit="m") if cut.range_m is not None else None,
            origin=list(cut.origin) if cut.origin is not None else None,
            origin_derived=True if cut.origin is not None and cut.origin_derived else None,
            course=angle(normalised(cut.course))
            if cut.origin is not None and cut.course is not None
            else None,
            bearing_accuracy=cut.bearing_accuracy or None,
            label=cut.label or None,
            comment=cut.comment or None,
            colour=cut.colour if cut.colour and cut.colour != sensor_colour else None,
            hidden=True if cut.hidden else None,
        ),
    )


def outside_host(read: ReadSensor, path: TrackPath | None) -> int:
    """How many of a sensor's cuts fall outside its host track's span: not drawn, as
    legacy Debrief drew none there."""
    if path is None:
        return len(read.cuts)
    return sum(1 for c in read.cuts if not path.start_ms <= c.time_ms <= path.end_ms)


def summary_note(read: list[ReadSensor], track_names: dict[str, str]) -> str:
    """What an import says of the sensor data it read: "611 cuts read: A_SENSOR on
    ALPHA (611, 0 ambiguous)"."""
    parts = []
    for sensor in read:
        ambiguous = sum(1 for c in sensor.cuts if c.ambiguous is not None)
        host = track_names.get(sensor.host_track_id, sensor.host_track_id)
        parts.append(
            f"{sensor.name} on {host} ({len(sensor.cuts):,} "
            f"{'cut' if len(sensor.cuts) == 1 else 'cuts'}, {ambiguous:,} ambiguous)"
        )
    total = sum(len(s.cuts) for s in read)
    return f"{total:,} sensor {'cut' if total == 1 else 'cuts'} read: {'; '.join(parts)}."


# --- Resolving ambiguity ------------------------------------------------------------


@dataclass
class Resolution:
    """What resolving changes: the cuts modified, and the step's name and notes."""

    modified: list
    note: str
    notes: list[str]
    chosen: list[str]


def resolution_from(value: models.AmbiguityResolution | dict) -> models.AmbiguityResolution:
    if isinstance(value, models.AmbiguityResolution):
        return value
    if not isinstance(value, dict):
        raise SensorError("Say what to keep, and which cuts: cut_ids, or sensor_ids and a period.")
    keep = value.get("keep")
    if keep not in KEEPS:
        raise SensorError(
            "keep is port, starboard, bearing, ambiguous_bearing, or ambiguous (both again)."
        )
    try:
        return models.AmbiguityResolution.model_validate(value)
    except ValueError as error:
        raise SensorError(f"The cuts to resolve could not be read: {error}") from None


def _chosen_cuts(plot: DebriefFeatureCollection, asked: models.AmbiguityResolution) -> list:
    by_id = {f.id: f for f in plot.features}
    if asked.cut_ids:
        chosen = []
        for cut_id in dict.fromkeys(asked.cut_ids):
            feature = by_id.get(cut_id)
            if feature is None or feature.properties.kind != CUT:
                raise SensorError(f"The plot has no sensor cut {cut_id!r}.")
            chosen.append(feature)
        return sorted(chosen, key=lambda f: f.properties.time)
    if not asked.sensor_ids:
        raise SensorError("Choose the cuts: give cut_ids, or sensor_ids and perhaps a period.")
    for sensor_id in asked.sensor_ids:
        feature = by_id.get(sensor_id)
        if feature is None or feature.properties.kind != SENSOR:
            raise SensorError(f"The plot has no sensor {sensor_id!r}.")
    wanted = set(asked.sensor_ids)
    start = parse_utc(asked.period.start) if asked.period else None
    end = parse_utc(asked.period.end) if asked.period else None
    if start is not None and end is not None and start > end:
        raise SensorError("The period's start is after its end.")
    return [
        f
        for f in cuts(plot)
        if f.properties.sensor_id in wanted
        and (start is None or start <= parse_utc(f.properties.time) <= end)
    ]


KEEP_WORDS = {
    "port": "Port bearing kept",
    "starboard": "Starboard bearing kept",
    "bearing": "Bearing kept",
    "ambiguous_bearing": "Bearing kept",
    "ambiguous": "Made ambiguous again",
}


def resolve(plot: DebriefFeatureCollection, asked: models.AmbiguityResolution) -> Resolution:
    """The cuts asked for, resolved as asked (or made ambiguous again): those that change,
    the step's name ("Port kept: 42 Towed array cuts 09:00:00Z–09:59:30Z")
    and its notes (cuts left as they were, and why)."""
    keep = str(asked.keep)
    chosen = _chosen_cuts(plot, asked)
    hidden = 0
    if not asked.cut_ids:
        # A sensor's cuts in a period, or all of them: those drawn. Hidden cuts, and those
        # of a sensor hidden, are left as they are, and said; named, they are resolved.
        sensors_hidden = {f.id for f in sensors(plot) if f.properties.hidden}
        shown = [
            c
            for c in chosen
            if not c.properties.hidden and c.properties.sensor_id not in sensors_hidden
        ]
        hidden = len(chosen) - len(shown)
        chosen = shown
    if not chosen:
        raise SensorError(
            "There are no cuts to resolve there: none of the sensor's cuts fall in the period."
        )
    by_id = {f.id: f for f in plot.features}
    paths: dict[str, TrackPath | None] = {}

    def host_path(sensor_id: str) -> TrackPath | None:
        if sensor_id not in paths:
            sensor = by_id.get(sensor_id)
            track = by_id.get(sensor.properties.host_track_id) if sensor is not None else None
            paths[sensor_id] = (
                TrackPath.lazy_from_feature(track)
                if track is not None and track.properties.kind == "track"
                else None
            )
        return paths[sensor_id]

    modified = []
    plain = no_course = already = 0
    sides: Counter[str] = Counter()
    for cut in chosen:
        props = cut.properties
        if props.ambiguous_bearing is None:
            plain += 1
            continue
        if keep == "ambiguous":
            if props.resolved is None:
                already += 1
                continue
            modified.append(
                cut.model_copy(update={"properties": props.model_copy(update={"resolved": None})})
            )
            continue
        path = host_path(props.sensor_id)
        place = place_of(cut, path, by_id.get(props.sensor_id))
        course = place.course if place is not None else None
        kept = kept_for(keep, degrees(props.bearing), degrees(props.ambiguous_bearing), course)
        if kept is None:
            no_course += 1
            continue
        if props.resolved is not None and str(props.resolved) == kept:
            already += 1
            continue
        if course is not None:
            bearing = degrees(props.bearing if kept == "bearing" else props.ambiguous_bearing)
            sides[side_of(course, bearing)] += 1
        modified.append(
            cut.model_copy(update={"properties": props.model_copy(update={"resolved": kept})})
        )

    sensor_names = list(
        dict.fromkeys(
            by_id[c.properties.sensor_id].properties.name
            for c in chosen
            if c.properties.sensor_id in by_id
        )
    )
    notes = []
    if hidden:
        notes.append(f"{_count(hidden, 'hidden cut')} left as they are: show them to resolve them.")
    if plain:
        notes.append(f"{_count(plain, 'cut')} had no ambiguous bearing, so nothing to keep.")
    if no_course:
        notes.append(
            f"{_count(no_course, 'cut')} left ambiguous: outside the host track's span, or "
            "where it did not move, so port and starboard cannot be told."
        )
    if already:
        state = "ambiguous" if keep == "ambiguous" else "resolved so"
        notes.append(f"{_count(already, 'cut')} already {state}.")
    if not modified:
        raise SensorError(
            "Nothing to change: " + (" ".join(notes) or "the cuts are already as asked.")
        )
    note, span = _step_name(keep, modified, sensor_names, sides, by_id)
    return Resolution(modified, note, [span, *notes] if span else notes, [c.id for c in chosen])


def _count(n: int, noun: str) -> str:
    return f"{n:,} {noun}{'' if n == 1 else 's'}"


# The longest name the History shows a step by (the hosts' STEP_NAME_LENGTH); a longer one
# leaves out its period, said in the step's next note instead.
STEP_NAME_LENGTH = 64


def _step_name(keep, modified, sensor_names, sides, by_id) -> tuple[str, str | None]:
    """The step's name, short enough for the History: "Port bearing kept on Towed array
    cut at 09:31:00Z"; "Starboard kept: 42 Towed array cuts 09:00:00Z–09:59:30Z";
    "Ambiguous again: 3 Towed array cuts 09:00:00Z–09:02:00Z". And, if the name had to
    leave out its period, a note saying it in full."""
    if keep in ("bearing", "ambiguous_bearing"):
        # A line clicked: say the side it is on, where the course tells it.
        # Lines clicked on both sides (an agent naming several cuts): said so.
        keep_said = next(iter(sides), None) if len(sides) <= 1 else "mixed-side"
        words = f"{keep_said.capitalize()} bearing kept" if keep_said else KEEP_WORDS[keep]
    else:
        words = KEEP_WORDS[keep]
    sensor = sensor_names[0] if len(sensor_names) == 1 else "sensor"
    if len(modified) == 1:
        title = name_of(modified[0], by_id)
        if keep == "ambiguous":
            return f"{title} made ambiguous again", None
        return f"{words} on {title}", None
    first, last = modified[0].properties.time, modified[-1].properties.time
    lead = "Ambiguous again" if keep == "ambiguous" else words.replace(" bearing kept", " kept")
    cuts = f"{len(modified):,} {sensor} cuts"
    name = f"{lead}: {cuts} {when(first)}–{when(last)}"
    if len(name) <= STEP_NAME_LENGTH:
        return name, None
    return f"{lead}: {cuts}", f"{cuts} from {when(first)} to {when(last)}."


def resolution_parameters(asked: models.AmbiguityResolution) -> list[models.ParameterValue]:
    """What was asked, for the step's record (SUB-24)."""
    out = [models.ParameterValue(name="keep", value=str(asked.keep))]
    if asked.sensor_ids:
        out.append(models.ParameterValue(name="sensors", value=", ".join(asked.sensor_ids)))
    if asked.period:
        out.append(models.ParameterValue(name="start", value=asked.period.start))
        out.append(models.ParameterValue(name="end", value=asked.period.end))
    if asked.cut_ids:
        out.append(models.ParameterValue(name="cuts", value=len(asked.cut_ids)))
    return out


# --- What agents read (debrief/sensors) ---------------------------------------------


def describe(
    plot: DebriefFeatureCollection,
    *,
    sensor_ids: list[str] | None = None,
    period: tuple[int, int] | None = None,
    with_cuts: bool = False,
) -> list[dict]:
    """The plot's sensors: each with its host, colour, how many cuts it has (ambiguous,
    resolved), its first and last cut's time; and, asked for, its cuts in a period, each
    with the bearings drawn and where it is drawn from (the host's position then)."""
    by_id = {f.id: f for f in plot.features}
    out = []
    for sensor in sensors(plot):
        if sensor_ids is not None and sensor.id not in sensor_ids:
            continue
        own = cuts(plot, sensor.id)
        host = by_id.get(sensor.properties.host_track_id)
        path = (
            TrackPath.lazy_from_feature(host)
            if host is not None and host.properties.kind == "track"
            else None
        )
        entry = {
            "id": sensor.id,
            "name": sensor.properties.name,
            "host_track_id": sensor.properties.host_track_id,
            "host": host.properties.name if host is not None else None,
            "colour": sensor.properties.colour,
            "hidden": bool(sensor.properties.hidden),
            **_array_entry(sensor),
            "cuts": len(own),
            "ambiguous": sum(1 for c in own if is_ambiguous(c)),
            "resolved": sum(1 for c in own if c.properties.resolved is not None),
            "start": own[0].properties.time if own else None,
            "end": own[-1].properties.time if own else None,
        }
        if with_cuts:
            listed = []
            for cut in own:
                at = parse_utc(cut.properties.time)
                if period is not None and not period[0] <= at <= period[1]:
                    continue
                listed.append(_cut_entry(cut, path, at, sensor))
            entry["cut_list"] = listed
        out.append(entry)
    return out


_LENGTH_WORDS = {"m": "m", "km": "km", "[yd_i]": "yd", "[nmi_i]": "nmi", "[ft_i]": "ft"}


def array_length(offset) -> models.Length | None:
    """An array offset as given (a Quantity, a Length, {value, unit}, or None or 0 for
    none), as a sensor holds it: a Length astern, in the unit it was given in."""
    if offset is None:
        return None
    if isinstance(offset, dict):
        offset = models.Length.model_validate(offset)
    value, unit = (offset.value, str(offset.unit))
    if unit not in _LENGTH_WORDS:
        raise SensorError(f"{unit!r} is not a length unit: give m, km, [yd_i], [nmi_i] or [ft_i].")
    if not math.isfinite(value) or value < 0:
        raise SensorError("An array offset is a distance astern: 0 or more.")
    if value == 0:
        return None
    return models.Length(value=value, unit=unit)


def describe_array(length: models.Length | None, mode: str) -> str:
    """ "300 m astern, worm in the hole"; "300 m straight astern"; "at the ship"."""
    if length is None:
        return "at the ship"
    distance = f"{length.value:g} {_LENGTH_WORDS[str(length.unit)]}"
    if mode == "plain":
        return f"{distance} straight astern"
    return f"{distance} astern, worm in the hole"


def array_of(sensor) -> tuple[float, str]:
    """A sensor's array offset astern, metres, and its mode (worm in the hole unless plain)."""
    props = sensor.properties
    offset = props.array_offset
    metres = Quantity(offset.value, str(offset.unit)).to("m").value if offset is not None else 0.0
    mode = (
        "plain"
        if props.array_mode is not None and str(props.array_mode) == "plain"
        else "worm_in_hole"
    )
    return metres, mode


def array_props(sensor) -> tuple[models.Length | None, str]:
    """A sensor's array offset as it holds it, and its mode, for describe_array."""
    return sensor.properties.array_offset, array_of(sensor)[1]


def place_of(cut, path: TrackPath | None, sensor, at: int | None = None) -> Place | None:
    """Where a cut is drawn from and the course its sides are told by (cut_place), for
    its sensor's array."""
    props = cut.properties
    own = Position(*props.origin) if props.origin is not None else None
    offset, mode = array_of(sensor) if sensor is not None else (0.0, "worm_in_hole")
    when = parse_utc(props.time) if at is None else at
    pinned = degrees(props.course) if props.course is not None and own is not None else None
    return cut_place(path, when, own, offset, mode, pinned)  # type: ignore[arg-type]


def _array_entry(sensor) -> dict:
    offset, mode = array_of(sensor)
    return {"array_offset_m": offset, "array_mode": mode} if offset > 0 else {}


def _cut_entry(cut, path: TrackPath | None, at: int, sensor=None) -> dict:
    props = cut.properties
    place = place_of(cut, path, sensor, at)
    origin = place.position if place else None
    course = place.course if place else None
    entry: dict = {
        "id": cut.id,
        "time": props.time,
        "bearing": degrees(props.bearing),
        "origin": [origin.longitude, origin.latitude] if origin is not None else None,
    }
    if props.origin_derived:
        entry["origin_derived"] = True  # worked out by Debrief, not recorded (for TMA)
    if props.ambiguous_bearing is not None:
        entry["ambiguous_bearing"] = degrees(props.ambiguous_bearing)
        entry["resolved"] = str(props.resolved) if props.resolved is not None else None
        if course is not None:
            entry["side"] = side_of(course, degrees(props.bearing))
    if props.range is not None:
        entry["range_m"] = Quantity(props.range.value, str(props.range.unit)).to("m").value
    for name in ("label", "comment"):
        value = getattr(props, name)
        if value:
            entry[name] = value
    return entry
