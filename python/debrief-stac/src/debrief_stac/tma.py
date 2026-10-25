"""TMA solutions (CAP-21; product owner, 24 Oct 2026): made from a period of bearing cuts,
split into legs, their cuts left out of the RMS error or counted again, and their bearing
residuals worked out.

A solution is an ordinary track plotted by dead reckoning (CAP-01), so every track
operation works on it unchanged: dragged (moved, rotated, sheared, stretched), split and
merged. What makes it a solution is its tag (TrackProperties.tma): the contact it is a
solution of, and the cuts it is rooted in, named by their ids (a sensor's id changes when
its track is split; a cut's does not). Debrief makes it with a fix at each of the cuts'
times, every fix on one course at one speed, from a first guess.

Legs (product owner, 24 Oct 2026): the analyst splits a solution into legs at a time (a
fix exactly at it starts the later leg, as a split does). It stays one track: each leg is
a period of it, dragged on its own (This leg, on the map). Each leg is independent, as in
legacy Debrief (product owner, 25 Oct 2026): dragging one moves only it, and the joins
either side of it (the stretch from the leg before's last fix to its first, and from its
last fix to the next leg's first) are solved again, their courses and speeds made to
reach; legs already fitted never move (legs_kept).

Hidden cuts (product owner, 25 Oct 2026, as legacy's "only plot visible data"): a cut
hidden on the map is rooted, if in the period, but left out of the residuals and the RMS,
and the view says how many; shown again, it counts again, with nothing else to do.

Residuals (debrief_kernel.tma): each rooted cut's bearing less the bearing from where it
was taken to where the solution was then. An ambiguous cut not yet resolved is measured by
the bearing nearer the solution, and the view says so; its other bearing's residual is
given too (other_residual), drawn faint and never counted. Each cut is taken from its origin as
the map draws it: its own origin (one Debrief worked out when its track was split is used
as it is, and counted, origin_derived), else its sensor's position then, its array's
astern if it has an offset (debrief/sensors gives the same).

Each change is one recorded, undoable step, named for what was done ("Contact 1 solution
made: 120 Bow sonar cuts 09:00:00Z–09:59:30Z", "Contact 1 solution split into legs at
09:30:00Z", "Contact 1 solution: cut at 09:21:00Z left out of the RMS").
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from debrief_kernel import tma as kernel
from debrief_kernel.formatting import (
    DEFAULT_SETTINGS,
    fixed,
    format_bearing,
    format_position,
    format_quantity,
    format_time,
)
from debrief_kernel.geodesy import Position, TrackPath, range_bearing
from debrief_kernel.sensors import side_of
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import DebriefFeatureCollection, models
from debrief_schemas.documents import tma_request_problems
from debrief_stac import sensors, tracks

# The colour Debrief gives a solution unless the analyst says (vscode/webview/palette.ts).
TMA_COLOUR = "#e8710a"
CONTACT = re.compile(r"^Contact (\d+)$")


class TmaError(ValueError):
    """A TMA change that cannot be made as asked, said in plain words."""


# --- Reading a plot -------------------------------------------------------------------


def is_solution(feature) -> bool:
    props = feature.properties
    return props.kind == "track" and props.tma is not None


def solutions(plot: DebriefFeatureCollection) -> list[models.TrackFeature]:
    return [f for f in plot.features if is_solution(f)]


def solution(plot: DebriefFeatureCollection, feature_id: str) -> models.TrackFeature:
    for feature in plot.features:
        if feature.id == feature_id:
            if not is_solution(feature):
                raise TmaError(f"{feature.properties.name} is not a TMA solution.")
            return feature
    raise TmaError(f"The plot has no TMA solution {feature_id!r}.")


def next_contact(plot: DebriefFeatureCollection) -> str:
    """The contact a new solution is of unless the analyst says: Contact 1, Contact 2..."""
    used = {
        int(m.group(1))
        for f in solutions(plot)
        if (m := CONTACT.match(f.properties.tma.contact.strip()))
    }
    n = 1
    while n in used:
        n += 1
    return f"Contact {n}"


def _when(ms: int) -> str:
    return format_time(ms, DEFAULT_SETTINGS)


def _count(n: int, noun: str, plural: str | None = None) -> str:
    return f"{n:,} {noun if n == 1 else plural or noun + 's'}"


def _span(times: Sequence[int]) -> str:
    return f"{_when(times[0])}–{_when(times[-1])}" if times[0] != times[-1] else _when(times[0])


@dataclass
class CutInfo:
    """A rooted cut as residuals and the bearing view need it."""

    cut: object
    sensor: object | None
    origin: Position | None
    course: float | None


def _paths(plot: DebriefFeatureCollection) -> dict[str, TrackPath]:
    return {
        f.id: TrackPath.lazy_from_feature(f) for f in plot.features if f.properties.kind == "track"
    }


def cut_infos(plot: DebriefFeatureCollection, chosen: Iterable) -> list[CutInfo]:
    """Where each cut was taken from, and the course its sides are told by, as the map
    draws it (sensors.place_of): its own origin, else its sensor's position then."""
    by_id = {f.id: f for f in plot.features}
    paths: dict[str, TrackPath | None] = {}
    out = []
    for cut in chosen:
        sensor = by_id.get(cut.properties.sensor_id)
        host_id = sensor.properties.host_track_id if sensor is not None else None
        if host_id not in paths:
            host = by_id.get(host_id) if host_id else None
            paths[host_id] = (
                TrackPath.lazy_from_feature(host)
                if host is not None and host.properties.kind == "track"
                else None
            )
        place = sensors.place_of(cut, paths[host_id], sensor)
        out.append(
            CutInfo(cut, sensor, place.position if place else None, place.course if place else None)
        )
    return out


def _cut_bearing(info: CutInfo) -> kernel.CutBearing:
    props = info.cut.properties
    return kernel.CutBearing(
        time_ms=parse_utc(props.time),
        origin=(info.origin.longitude, info.origin.latitude) if info.origin else None,
        bearing=sensors.degrees(props.bearing),
        ambiguous=sensors.degrees(props.ambiguous_bearing),
        resolved=str(props.resolved) if props.resolved is not None else None,
    )


def leg_starts_ms(track: models.TrackFeature) -> list[int]:
    return [parse_utc(t) for t in track.properties.tma.leg_starts or []]


def leg_of(starts: Sequence[int], at_ms: int) -> int:
    """Which leg, from 1, a time falls in: a time exactly at a leg's start is in it."""
    return 1 + sum(1 for s in starts if s <= at_ms)


def legs(track: models.TrackFeature) -> list[tuple[int, int]]:
    """Each leg's first and last fix (indices), the legs with no fix left out."""
    times = tracks.times_of(track)
    bounds = [0]
    for start in leg_starts_ms(track):
        index = next((i for i, t in enumerate(times) if t >= start), len(times))
        if bounds[-1] < index < len(times):
            bounds.append(index)
    bounds.append(len(times))
    return [(a, b - 1) for a, b in zip(bounds, bounds[1:], strict=False) if b > a]


# --- Residuals ------------------------------------------------------------------------


def residual_report(plot: DebriefFeatureCollection, feature_id: str) -> dict:
    """A solution's residuals, as debrief/tma_residuals returns them and the bearing view
    shows them (TmaResiduals): a row per rooted cut in time order, with the cut's time,
    bearings, origin, the bearing measured and which, whether it was chosen as the nearer
    of an ambiguous pair, the bearing calculated, the residual, whether it is left out, and
    its leg; and the RMS error of those counted."""
    track = solution(plot, feature_id)
    tag = track.properties.tma
    by_id = {f.id: f for f in plot.features}
    rooted = [
        by_id[i] for i in tag.cut_ids if i in by_id and by_id[i].properties.kind == "sensor_cut"
    ]
    rooted.sort(key=lambda c: c.properties.time)
    missing = len(tag.cut_ids) - len(rooted)
    infos = cut_infos(plot, rooted)
    found = kernel.residuals([_cut_bearing(i) for i in infos], TrackPath.from_feature(track))
    excluded = set(tag.excluded_cut_ids or [])
    starts = leg_starts_ms(track)
    rows = []
    counted: list[float | None] = []
    for info, res in zip(infos, found, strict=True):
        row = cut_row(info)
        row["leg"] = leg_of(starts, parse_utc(info.cut.properties.time))
        if res.residual is not None:
            row.update(
                measured=res.measured,
                used=res.used,
                calculated=res.calculated,
                residual=res.residual,
            )
            if res.nearer_side:
                row["nearer_side"] = True
            if res.other is not None:
                row["other_residual"] = res.other
        if info.cut.id in excluded:
            row["excluded"] = True
        # Hidden on the map: left out until shown again (legacy's "only plot visible data").
        elif res.residual is not None and not row.get("hidden"):
            counted.append(res.residual)
        rows.append(row)
    rms = kernel.rms(counted)
    shown = [r for r in rows if not r.get("hidden")]
    report = {
        "solution_id": feature_id,
        "rows": rows,
        "counted": len(counted),
        "excluded": sum(1 for r in rows if r.get("excluded")),
        "without": missing + sum(1 for r in shown if r.get("residual") is None),
        "nearer_side": sum(1 for r in shown if r.get("nearer_side")),
        "derived_origins": sum(1 for r in shown if r.get("origin_derived")),
    }
    hidden = len(rows) - len(shown)
    if hidden:
        report["hidden"] = hidden
    if rms is not None:
        report["rms"] = rms
    return report


def cut_row(info: CutInfo) -> dict:
    """A cut as the bearing view lists it (TmaCut)."""
    props = info.cut.properties
    sensor = info.sensor
    row: dict = {
        "id": info.cut.id,
        "sensor_id": props.sensor_id,
        "time": props.time,
        "bearing": sensors.degrees(props.bearing),
    }
    if sensor is not None:
        row["sensor"] = sensor.properties.name
    colour = props.colour or (sensor.properties.colour if sensor is not None else None)
    if colour:
        row["colour"] = colour
    if props.ambiguous_bearing is not None:
        row["ambiguous_bearing"] = sensors.degrees(props.ambiguous_bearing)
        if props.resolved is not None:
            row["resolved"] = str(props.resolved)
        if info.course is not None:
            row["side"] = side_of(info.course, row["bearing"])
    if info.origin is not None:
        row["origin"] = [info.origin.longitude, info.origin.latitude]
    if props.origin_derived:
        row["origin_derived"] = True
    if props.label:
        row["label"] = props.label
    if props.hidden:
        row["hidden"] = True
    return row


def rms_value(report: dict) -> str:
    """ "1.4° over 118 cuts", or "none" when no cut gives a residual."""
    if report.get("rms") is None:
        return "none"
    value = fixed(report["rms"], DEFAULT_SETTINGS.angle_decimals)
    return f"{value}° over {_count(report['counted'], 'cut')}"


def rms_text(report: dict) -> str:
    """ "RMS 1.4° over 118 cuts", or why there is none."""
    if report.get("rms") is None:
        return "No RMS: no rooted cut gives a residual"
    return f"RMS {rms_value(report)}"


# --- Making a solution ------------------------------------------------------------------


def request_from(value: models.TmaRequest | dict) -> models.TmaRequest:
    try:
        request = value if isinstance(value, models.TmaRequest) else models.TmaRequest(**value)
    except (TypeError, ValueError):
        raise TmaError(
            "Say which cuts to root the solution in (sensor_ids and a period, or cut_ids) "
            "and, if wanted, a first guess: a range, a course and a speed, or two positions."
        ) from None
    problems = tma_request_problems(request, "The TMA solution asked for")
    if problems:
        raise TmaError(problems[0])
    return request


def rooted_cuts(plot: DebriefFeatureCollection, request: models.TmaRequest) -> list:
    """The cuts a solution asked for is rooted in, in time order: those named, or every
    cut of the sensors named whose time is in the period. Hidden ones are rooted too, so
    that shown again they count with nothing else to do, but are left out of the residuals
    while hidden (product owner, 25 Oct 2026)."""
    by_id = {f.id: f for f in plot.features}
    if request.cut_ids:
        missing = [
            i
            for i in request.cut_ids
            if by_id.get(i) is None or by_id[i].properties.kind != "sensor_cut"
        ]
        if missing:
            raise TmaError(f"The plot has no cut {missing[0]!r}.")
        chosen = [by_id[i] for i in dict.fromkeys(request.cut_ids)]
        return sorted(chosen, key=lambda c: c.properties.time)
    if not request.sensor_ids:
        raise TmaError("Say which sensor's cuts to root the solution in.")
    for sensor_id in request.sensor_ids:
        if by_id.get(sensor_id) is None or by_id[sensor_id].properties.kind != "sensor":
            raise TmaError(f"The plot has no sensor {sensor_id!r}.")
    period = (
        (parse_utc(request.period.start), parse_utc(request.period.end)) if request.period else None
    )
    chosen = [
        c
        for sensor_id in dict.fromkeys(request.sensor_ids)
        for c in sensors.cuts(plot, sensor_id)
        if period is None or period[0] <= parse_utc(c.properties.time) <= period[1]
    ]
    return sorted(chosen, key=lambda c: c.properties.time)


def _sensor_names(infos: Sequence[CutInfo]) -> str:
    names = list(dict.fromkeys(i.sensor.properties.name for i in infos if i.sensor is not None))
    return " and ".join(names) if len(names) <= 2 else f"{len(names)} sensors'"


@dataclass
class Made:
    track: models.TrackFeature
    note: str
    notes: list[str]
    parameters: list[models.ParameterValue]


def _knots(metres_per_second: float) -> float:
    return Quantity(metres_per_second, "m/s").to("[kn_i]").value


def _course_speed_text(course: float, knots: float) -> str:
    speed = Quantity(knots, "[kn_i]").to(DEFAULT_SETTINGS.speed_unit)
    return f"{format_bearing(Quantity(course, 'deg'))} {format_quantity(speed)}"


def create(plot: DebriefFeatureCollection, value: models.TmaRequest | dict) -> Made:
    """A new solution, as asked: rooted in the cuts, with a fix at each of their times, on
    one course at one speed from the first guess, plotted by dead reckoning."""
    request = request_from(value)
    rooted = rooted_cuts(plot, request)
    if not rooted:
        raise TmaError("There are no cuts there to root a solution in: choose a period with cuts.")
    # Its fixes at the times of the cuts shown: a hidden cut shown again is measured
    # against the solution where it was then, between its fixes.
    shown = [c for c in rooted if not c.properties.hidden]
    if not shown:
        raise TmaError(
            f"Those {_count(len(rooted), 'cut')} are all hidden on the map, so none would count: "
            "show some, or choose another period."
        )
    times = sorted({parse_utc(c.properties.time) for c in shown})
    if len(times) < 2:
        raise TmaError(
            f"A solution needs cuts shown at two times or more: these "
            f"{_count(len(shown), 'cut')} are all at {_when(times[0])}. Choose a longer period."
        )
    infos = cut_infos(plot, rooted)
    visible = [i for i in infos if not i.cut.properties.hidden]
    first = next(i for i in visible if parse_utc(i.cut.properties.time) == times[0])
    last = [i for i in visible if parse_utc(i.cut.properties.time) == times[-1]][-1]
    host_name = _host_name(plot, first)
    notes: list[str] = []
    parameters: list[models.ParameterValue] = []
    if request.first_position is not None:
        start, course, knots, said = _two_clicks(request, first, last, times, host_name)
        notes.append(said)
        parameters += [
            models.ParameterValue(name="first_longitude", value=request.first_position[0]),
            models.ParameterValue(name="first_latitude", value=request.first_position[1]),
            models.ParameterValue(name="last_longitude", value=request.last_position[0]),
            models.ParameterValue(name="last_latitude", value=request.last_position[1]),
        ]
    else:
        start, course, knots, said, asked = _by_form(request, first, host_name)
        notes.append(said)
        parameters += asked
    contact = (request.contact or "").strip() or next_contact(plot)
    name = (request.name or "").strip() or f"{contact} solution"
    taken = {f.id for f in plot.features}
    feature_id = tracks.new_track_id(name, taken)
    n = len(times)
    period = request.period or models.TimeRange(
        start=format_utc(times[0]), end=format_utc(times[-1])
    )
    tag = models.TmaSolution(
        contact=contact,
        sensor_ids=list(dict.fromkeys(c.properties.sensor_id for c in rooted)),
        cut_ids=[c.id for c in rooted],
        period=period,
    )
    track = models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[start.longitude, start.latitude]] * n
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=[format_utc(t) for t in times],
            courses=models.AngleSeries(unit="deg", values=[course] * n),
            speeds=models.SpeedSeries(unit="[kn_i]", values=[knots] * n),
            style=models.TrackStyle(colour=request.colour or TMA_COLOUR),
            plotting_mode="dr",
            tma=tag,
        ),
    )
    positions = tracks.dead_reckoned_positions(track)
    track = track.model_copy(
        update={"geometry": track.geometry.model_copy(update={"coordinates": positions})}
    )
    note = f"{name} made: {_count(len(rooted), f'{_sensor_names(infos)} cut')} {_span(times)}"
    notes.append(
        f"A TMA solution of {contact}: its {_count(n, 'fix', 'fixes')} at the cuts' times, "
        "by dead reckoning"
    )
    notes += describe_cuts(infos, host_name)
    parameters = [
        models.ParameterValue(name="contact", value=contact),
        models.ParameterValue(name="period_start", value=period.start),
        models.ParameterValue(name="period_end", value=period.end),
        models.ParameterValue(name="cuts", value=len(rooted)),
        *parameters,
        models.ParameterValue(name="course", value=models.Angle(value=course, unit="deg")),
        models.ParameterValue(name="speed", value=models.Speed(value=knots, unit="[kn_i]")),
    ]
    return Made(track, note, notes, parameters)


def _host_name(plot: DebriefFeatureCollection, info: CutInfo) -> str:
    if info.sensor is None:
        return "its track"
    host = next((f for f in plot.features if f.id == info.sensor.properties.host_track_id), None)
    return host.properties.name if host is not None else "its track"


def describe_cuts(infos: Sequence[CutInfo], host_name: str) -> list[str]:
    """What a step making or splitting a solution says of its cuts: ambiguous ones, ones
    giving no residual, hidden ones, ones from origins Debrief worked out."""
    notes = []
    ambiguous = sum(1 for i in infos if sensors.is_ambiguous(i.cut))
    if ambiguous:
        notes.append(
            f"{_count(ambiguous, 'cut is', 'cuts are')} ambiguous: until resolved, each is "
            "measured by the bearing nearer the solution"
        )
    outside = sum(1 for i in infos if i.origin is None)
    if outside:
        notes.append(
            f"{_count(outside, 'cut was', 'cuts were')} taken outside {host_name}'s fixes: "
            f"{'it gives' if outside == 1 else 'they give'} no residual"
        )
    hidden = sum(1 for i in infos if i.cut.properties.hidden)
    if hidden:
        notes.append(
            f"{_count(hidden, 'cut')} hidden on the map {'is' if hidden == 1 else 'are'} left "
            "out of the residuals until shown again"
        )
    derived = sum(1 for i in infos if i.cut.properties.origin_derived)
    if derived:
        notes.append(
            f"{_count(derived, 'cut is', 'cuts are')} taken from where Debrief worked out "
            "the sensor was (pinned when its track was split), not a recorded position"
        )
    return notes


def _bearing_of(cut, which: str | None) -> tuple[float, str]:
    props = cut.properties
    if props.ambiguous_bearing is None:
        return sensors.degrees(props.bearing), "bearing"
    choice = which or (str(props.resolved) if props.resolved is not None else "bearing")
    if choice == "ambiguous_bearing":
        return sensors.degrees(props.ambiguous_bearing), "ambiguous_bearing"
    return sensors.degrees(props.bearing), "bearing"


def _by_form(request: models.TmaRequest, first: CutInfo, host_name: str):
    if first.origin is None:
        raise TmaError(
            f"The first cut, at {sensors.when(first.cut.properties.time)}, was taken outside "
            f"{host_name}'s fixes, so the solution has nowhere to start: choose a period that "
            "starts where the track has fixes."
        )
    which = str(request.first_bearing) if request.first_bearing is not None else None
    bearing, _used = _bearing_of(first.cut, which)
    guessed = request.range is None
    distance = (
        Quantity(request.range.value, str(request.range.unit))
        if request.range
        else kernel.DEFAULT_RANGE
    )
    course = (
        sensors.degrees(request.course) % 360.0
        if request.course is not None
        else kernel.across(bearing)
    )
    speed = (
        Quantity(request.speed.value, str(request.speed.unit))
        if request.speed
        else kernel.DEFAULT_SPEED
    )
    knots = speed.to("[kn_i]").value
    start = kernel.start_on_bearing(first.origin, bearing, distance.to("m").value)
    said = (
        f"First guess: {format_quantity(distance.to(DEFAULT_SETTINGS.length_unit))} along "
        f"{format_bearing(Quantity(bearing, 'deg'))} from where the first cut was taken, "
        f"then {_course_speed_text(course, knots)}"
    )
    if guessed:
        said += " (Debrief's first guess: 10,000 yd, across the bearing, 8 kn)"
    asked = [
        models.ParameterValue(
            name="range", value=models.Length(value=distance.value, unit=distance.unit)
        ),
        models.ParameterValue(name="first_bearing", value=models.Angle(value=bearing, unit="deg")),
    ]
    return start, course, knots, said, asked


def _two_clicks(request: models.TmaRequest, first: CutInfo, last: CutInfo, times, host_name: str):
    ends = []
    for info, click, which in (
        (first, request.first_position, "first"),
        (last, request.last_position, "last"),
    ):
        if info.origin is None:
            raise TmaError(
                f"The {which} cut, at {sensors.when(info.cut.properties.time)}, was taken outside "
                f"{host_name}'s fixes, so it has no line to click on: choose another period."
            )
        props = info.cut.properties
        on = kernel.onto_line(
            info.origin,
            sensors.degrees(props.bearing),
            sensors.degrees(props.ambiguous_bearing),
            str(props.resolved) if props.resolved is not None else None,
            Position(*click),
        )
        if on is None:
            raise TmaError(
                f"The {which} click is behind where the {which} cut was taken: click on its line, "
                "ahead of the sensor."
            )
        ends.append(on)
    course, metres_per_second = kernel.course_speed(
        ends[0].position, ends[1].position, (times[-1] - times[0]) / 1000
    )
    knots = _knots(metres_per_second)
    said = (
        f"First guess by two clicks: from {format_position(ends[0].position)} on the first cut's "
        f"line to {format_position(ends[1].position)} on the last's, "
        f"{_course_speed_text(course, knots)}"
    )
    return ends[0].position, course, knots, said


# --- Changing a solution ----------------------------------------------------------------


def _with_tag(track: models.TrackFeature, **update) -> models.TrackFeature:
    tag = track.properties.tma.model_copy(update=update)
    return track.model_copy(update={"properties": track.properties.model_copy(update={"tma": tag})})


@dataclass
class Changed:
    track: models.TrackFeature
    note: str
    notes: list[str]


def excluded(
    plot: DebriefFeatureCollection, feature_id: str, cut_ids: Sequence[str], leave_out: bool
) -> Changed | None:
    """Rooted cuts left out of the solution's RMS error (leave_out), or counted again;
    None if none would change."""
    track = solution(plot, feature_id)
    tag = track.properties.tma
    rooted = set(tag.cut_ids)
    stray = [i for i in cut_ids if i not in rooted]
    if stray:
        raise TmaError(f"{track.properties.name} is not rooted in cut {stray[0]!r}.")
    if not cut_ids:
        raise TmaError("Say which cuts to leave out, or count again.")
    out = list(tag.excluded_cut_ids or [])
    if leave_out:
        changing = [i for i in dict.fromkeys(cut_ids) if i not in out]
        after = [i for i in tag.cut_ids if i in set(out) | set(changing)]
    else:
        changing = [i for i in dict.fromkeys(cut_ids) if i in out]
        after = [i for i in out if i not in set(changing)]
    if not changing:
        return None
    before = residual_report(plot, feature_id)
    changed = _with_tag(track, excluded_cut_ids=after or None)
    by_id = {f.id: f for f in plot.features}
    times = sorted(parse_utc(by_id[i].properties.time) for i in changing if i in by_id)
    name = track.properties.name
    what = (
        f"cut at {_when(times[0])}"
        if len(changing) == 1 and times
        else _count(len(changing), "cut")
    )
    note = f"{name}: {what} {'left out of' if leave_out else 'counted again in'} the RMS"
    replotted = plot.model_copy(
        update={"features": [changed if f.id == feature_id else f for f in plot.features]}
    )
    now = residual_report(replotted, feature_id)
    notes = []
    if len(changing) > 1 and times:
        notes.append(f"Cuts {_span(times)}")
    notes.append(f"{rms_text(now)} (was {rms_value(before)})")
    return Changed(changed, note, notes)


def split_leg(plot: DebriefFeatureCollection, feature_id: str, at_ms: int) -> Changed:
    """The solution split into legs at a time: the fix at or after it starts a new leg,
    each leg keeping at least two fixes, as a split does. Still one track."""
    track = solution(plot, feature_id)
    times = tracks.times_of(track)
    index = next((i for i, t in enumerate(times) if t >= at_ms), len(times))
    name = track.properties.name
    starts = leg_starts_ms(track)
    if index >= len(times):
        raise TmaError(
            f"{name} was not split into legs at {_when(at_ms)}: that is after its last fix."
        )
    if times[index] in starts:
        raise TmaError(f"{name} already has a leg starting at {_when(times[index])}.")
    firsts = (next((i for i, t in enumerate(times) if t >= s), len(times)) for s in starts)
    bounds = sorted({0, len(times), *firsts})
    before = index - max(b for b in bounds if b <= index)
    after = min(b for b in bounds if b > index) - index
    if before < tracks.FEWEST_FIXES or after < tracks.FEWEST_FIXES:
        raise TmaError(
            f"{name} was not split into legs at {_when(at_ms)}: the leg there would have "
            f"{tracks._fixes(before)} before then and {tracks._fixes(after)} from then on, and "
            f"each leg needs at least {tracks.FEWEST_FIXES}."
        )
    new_starts = sorted({*starts, times[index]})
    changed = _with_tag(track, leg_starts=[format_utc(t) for t in new_starts])
    note = f"{name} split into legs at {_when(times[index])}"
    spans = legs(changed)
    listed = ", ".join(
        f"leg {n} {_span([times[a], times[b]])}" for n, (a, b) in enumerate(spans, 1)
    )
    notes = [
        listed[0].upper() + listed[1:],
        "Each leg is dragged on its own: the other legs stay where they are, and the joins "
        "either side of it are solved again",
    ]
    return Changed(changed, note, notes)


def joined_legs(plot: DebriefFeatureCollection, feature_id: str, at_ms: int) -> Changed:
    """The leg starting at a time joined to the one before: the split taken back."""
    track = solution(plot, feature_id)
    starts = leg_starts_ms(track)
    if at_ms not in starts:
        raise TmaError(f"{track.properties.name} has no leg starting at {_when(at_ms)}.")
    kept = [format_utc(s) for s in starts if s != at_ms]
    changed = _with_tag(track, leg_starts=kept or None)
    return Changed(changed, f"{track.properties.name} legs joined at {_when(at_ms)}", [])


# --- Legs kept, joins solved -------------------------------------------------------------

LEGS_KEPT = "The other legs stay where they are: the joins either side of the leg are solved again"


def _unit_speed(knots: float, unit: str) -> float:
    return Quantity(knots, "[kn_i]").to(unit).value


def _aim(courses: list, speeds: list, speed_unit: str, i: int, a, b, seconds: float) -> None:
    """The fix at i given the course and speed that reach b from a in the seconds between."""
    if seconds <= 0:
        return
    distance, bearing = range_bearing(Position(*a), Position(*b))
    courses[i] = bearing.value % 360.0
    speeds[i] = _unit_speed(distance.value / seconds * 3600 / 1852, speed_unit)


def _with_series(track, positions, courses, speeds) -> models.TrackFeature:
    props = track.properties
    return track.model_copy(
        update={
            "geometry": track.geometry.model_copy(update={"coordinates": positions}),
            "properties": props.model_copy(
                update={
                    "courses": props.courses.model_copy(update={"values": courses}),
                    "speeds": props.speeds.model_copy(update={"values": speeds}),
                }
            ),
        }
    )


def legs_kept(
    before: models.TrackFeature, after: models.TrackFeature, indices: Sequence[int]
) -> models.TrackFeature | None:
    """A solution of legs as an edit of some of its fixes left it, with its other legs back
    where they were (product owner, 25 Oct 2026: each leg is independent, as in legacy
    Debrief): the legs holding any fix edited take the edit; every other leg keeps its
    fixes, courses and speeds; each join (a leg's last fix, its course and speed to the next
    leg's first fix) is solved again to reach. None when nothing is kept back: not a
    solution of legs, or every leg edited."""
    tag = before.properties.tma
    if tag is None or not tag.leg_starts or before.properties.courses is None:
        return None
    spans = legs(before)
    edited = {k for k, (a, b) in enumerate(spans) if any(a <= i <= b for i in indices)}
    if len(edited) == len(spans) or not edited:
        return None
    old = [list(p) for p in before.geometry.coordinates]
    new = [list(p) for p in after.geometry.coordinates]
    courses = list(after.properties.courses.values)
    speeds = list(after.properties.speeds.values)
    old_courses = before.properties.courses.values
    old_speeds = before.properties.speeds.values
    positions = list(new)
    for k, (a, b) in enumerate(spans):
        if k in edited:
            continue
        for i in range(a, b + 1):
            positions[i] = old[i]
            courses[i] = old_courses[i]
            speeds[i] = old_speeds[i]
    times = tracks.times_of(before)
    unit = str(before.properties.speeds.unit)
    # Only the joins next to a leg edited: into it, from the leg before, and out of it.
    for k, ((_, last), (first, _)) in enumerate(zip(spans, spans[1:], strict=False)):
        if k in edited or k + 1 in edited:
            seconds = (times[first] - times[last]) / 1000
            _aim(courses, speeds, unit, last, positions[last], positions[first], seconds)
    return _with_series(after, positions, courses, speeds)


def aimed_at_next(
    ordered: Sequence[models.TrackFeature],
) -> list[models.TrackFeature]:
    """Solutions about to be merged, each but the last with its last fix's course and speed
    solved to reach the next one's first fix, as a legacy plot's legs are joined
    (debrief_io.dpf_tma): merged by dead reckoning, none of them moves."""
    out = list(ordered)
    for k in range(len(out) - 1):
        track, nxt = out[k], out[k + 1]
        if track.properties.courses is None or track.properties.speeds is None:
            continue
        courses = list(track.properties.courses.values)
        speeds = list(track.properties.speeds.values)
        last = len(courses) - 1
        seconds = (tracks.times_of(nxt)[0] - tracks.times_of(track)[-1]) / 1000
        _aim(
            courses,
            speeds,
            str(track.properties.speeds.unit),
            last,
            track.geometry.coordinates[last],
            nxt.geometry.coordinates[0],
            seconds,
        )
        out[k] = _with_series(track, [list(p) for p in track.geometry.coordinates], courses, speeds)
    return out


def refused_merge(members: Sequence[models.TrackFeature]) -> str | None:
    """Why tracks cannot be merged as TMA solutions: a solution with a track that is not
    one (its fixes are not rooted in cuts, and it would become a leg of the solution)."""
    tagged = [t for t in members if t.properties.tma is not None]
    if not tagged or len(tagged) == len(members):
        return None
    plain = [t.properties.name for t in members if t.properties.tma is None]
    return (
        f"{', '.join(plain)} {'is' if len(plain) == 1 else 'are'} not a TMA solution: a "
        f"solution ({tagged[0].properties.name}) is merged only with other solutions, as each "
        "becomes a leg rooted in its own cuts. Make a solution of its cuts first, or merge "
        "the tracks that are not solutions on their own."
    )


def with_sensor_ids(
    plot: DebriefFeatureCollection, changed: Sequence
) -> dict[str, models.TrackFeature]:
    """Solutions whose sensors are no longer those of the cuts they are rooted in, once
    the features changed are in the plot (a sensor split with its track gives its later cuts
    a new sensor): each with its sensor_ids those of its cuts, by id."""
    now = {f.id: f for f in plot.features}
    now.update({f.id: f for f in changed})
    out = {}
    for feature in now.values():
        if not is_solution(feature):
            continue
        tag = feature.properties.tma
        ids = list(
            dict.fromkeys(
                now[c].properties.sensor_id
                for c in tag.cut_ids
                if c in now and now[c].properties.kind == "sensor_cut"
            )
        )
        if ids and ids != list(tag.sensor_ids):
            out[feature.id] = _with_tag(feature, sensor_ids=ids)
    return out


# --- Track operations on a solution ------------------------------------------------------


def split_parts(
    plot: DebriefFeatureCollection, first: models.TrackFeature, second: models.TrackFeature
) -> tuple[models.TrackFeature, models.TrackFeature, list[str]]:
    """A solution split by Split track (two tracks): each part is a solution of the same
    contact, rooted in the cuts within its own span (the later part those from its first
    fix on), its legs and the cuts left out its own."""
    tag = first.properties.tma
    if tag is None:
        return first, second, []
    by_id = {f.id: f for f in plot.features}
    split_ms = tracks.times_of(second)[0]
    time_of = {i: parse_utc(by_id[i].properties.time) for i in tag.cut_ids if i in by_id}
    parts = []
    counts = []
    for part, later in ((first, False), (second, True)):
        times = tracks.times_of(part)
        mine = [i for i in tag.cut_ids if i in time_of and ((time_of[i] >= split_ms) == later)]
        excluded_ids = [i for i in tag.excluded_cut_ids or [] if i in set(mine)]
        starts = [s for s in tag.leg_starts or [] if times[0] < parse_utc(s) <= times[-1]]
        if later:
            period = models.TimeRange(
                start=part.properties.times[0], end=max(tag.period.end, part.properties.times[-1])
            )
        else:
            period = models.TimeRange(
                start=min(tag.period.start, part.properties.times[0]), end=part.properties.times[-1]
            )
        parts.append(
            _with_tag(
                part,
                cut_ids=mine,
                excluded_cut_ids=excluded_ids or None,
                leg_starts=starts or None,
                period=period,
            )
        )
        counts.append(len(mine))
    note = (
        f"Both parts are TMA solutions of {tag.contact}, each rooted in its own cuts: "
        f"{_count(counts[0], 'cut')} and {_count(counts[1], 'cut')}"
    )
    return parts[0], parts[1], [note]


def merged_tag(
    ordered: Sequence[models.TrackFeature],
) -> tuple[models.TmaSolution | None, list[str]]:
    """What merged tracks keep of their TMA tags: the solutions' cuts, legs and cuts left
    out together, the contact the earliest's, and each later solution starting a leg."""
    tagged = [t for t in ordered if t.properties.tma is not None]
    if not tagged:
        return None, []
    base = tagged[0].properties.tma
    cut_ids = list(dict.fromkeys(i for t in tagged for i in t.properties.tma.cut_ids))
    left = list(dict.fromkeys(i for t in tagged for i in t.properties.tma.excluded_cut_ids or []))
    starts = {s for t in tagged for s in t.properties.tma.leg_starts or []}
    starts |= {t.properties.times[0] for t in tagged[1:]}
    sensor_ids = list(dict.fromkeys(i for t in tagged for i in t.properties.tma.sensor_ids))
    period = models.TimeRange(
        start=min(t.properties.tma.period.start for t in tagged),
        end=max(t.properties.tma.period.end for t in tagged),
    )
    tag = base.model_copy(
        update={
            "cut_ids": cut_ids,
            "excluded_cut_ids": left or None,
            "leg_starts": sorted(starts) or None,
            "sensor_ids": sensor_ids,
            "period": period,
        }
    )
    notes = []
    contacts = Counter(t.properties.tma.contact for t in tagged)
    if len(contacts) > 1:
        notes.append(
            f"The merged track is a TMA solution of {base.contact}, rooted in the cuts of each "
            f"solution merged ({', '.join(sorted(contacts))})"
        )
    if len(tagged) > 1:
        notes.append(
            f"Each solution merged is a leg of it: {_count(len(sorted(starts)) + 1, 'leg')}"
        )
    return tag, notes
