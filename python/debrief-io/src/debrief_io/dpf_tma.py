"""Legacy TMA solutions in a .dpf plot, imported as v4 solutions (CAP-21, EXT-14; product
owner, 24 Oct 2026).

Legacy Debrief kept a TMA solution as a track of TMA legs (RelativeTMASegment,
AbsoluteTMASegment), each on one course at one speed, its positions worked out by dead
reckoning from where it starts:

- an **absolute** leg from its origin, saved in the plot: imported as it is;
- a **relative** leg from an offset (a range and a bearing) from where its host track's
  sensor was at the leg's start (legacy RelativeTMASegment.getTrackStart): converted to
  positions at import, from where the sensor was then in this plot (its array's position,
  astern, where it has one), and the note says so, with how far that puts any fix from
  where legacy Debrief drew it. Two things put it apart: a plot whose saved positions leave
  out its sensor's array offset (legacy's midflow2, 0.22 nmi with plain arrays 300 and
  400 m astern), which v4 applies, as current legacy Debrief does on load; and legacy's
  flat earth on a long leg or far north (2648_tx, 0.56 nmi over 16.6 h; Ambig_tracks3,
  0.15 nmi at 60N), where v4 works along geodesics. The
  solution is then no longer relative to its host: moving the host does not move it, as
  it did in legacy.

The legacy track becomes one v4 solution track, plotted by dead reckoning, a leg per
legacy leg (leg_starts), rooted in the cuts of the sensors its legs name, within each
leg's fixes; its contact is the legacy track's name. Between legs legacy drew a gap or a
dynamic infill; in v4 the legs are joined: each leg's last fix takes the course and speed
that reach the next leg's start, so the solution is dead reckoned from its first fix as a
v4 solution is, and the note says so. A dynamic infill's fixes are not imported, said.
"""

from __future__ import annotations

from collections.abc import Sequence

from debrief_io.dpf import DpfFile, DpfFix, DpfLeg, DpfTrack
from debrief_kernel.formatting import DEFAULT_SETTINGS, format_bearing, format_quantity, format_time
from debrief_kernel.geodesy import Position, TrackPath, destination, range_bearing
from debrief_kernel.sensors import cut_place
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models
from debrief_stac import sensors as plot_sensors

SOLUTION_LEGS = {"RelativeTMASegment", "AbsoluteTMASegment"}
INFILL = "DynamicInfillSegment"


def _plural(count: int, word: str, plural: str | None = None) -> str:
    return f"{count:,} {word if count == 1 else plural or word + 's'}"


def _when(ms: int) -> str:
    return format_time(ms, DEFAULT_SETTINGS)


def _distance(metres: float) -> str:
    return format_quantity(Quantity(metres, "m").to(DEFAULT_SETTINGS.length_unit))


def is_solution_track(track: DpfTrack) -> bool:
    return any(leg.kind in SOLUTION_LEGS for leg in track.legs)


class _Hosts:
    """The plot's tracks and sensors, found by their legacy names."""

    def __init__(self, imported_tracks, features: list) -> None:
        self.features = features
        self.by_id = {f.id: f for f in features}
        # A legacy track's name: the v4 tracks made from it (one, or one a leg).
        self.tracks: dict[str, list[str]] = {}
        for index, name, legacy_name, _ in imported_tracks:
            for key in {name, legacy_name}:
                self.tracks.setdefault(key, []).append(features[index].id)

    def host_ids(self, name: str | None) -> list[str]:
        return self.tracks.get(name or "", [])

    def path(self, track_id: str) -> TrackPath:
        return TrackPath.from_feature(self.by_id[track_id])

    def host_at(self, name: str | None, at_ms: int) -> str | None:
        ids = self.host_ids(name)
        for track_id in ids:
            times = self.by_id[track_id].properties.times
            if parse_utc(times[0]) <= at_ms <= parse_utc(times[-1]):
                return track_id
        return ids[0] if ids else None

    def sensors_named(self, host: str | None, sensor: str | None) -> list:
        """The sensors on the host's tracks with the name given (any name, if none)."""
        ids = set(self.host_ids(host))
        return [
            f
            for f in self.features
            if f.properties.kind == "sensor"
            and f.properties.host_track_id in ids
            and (sensor is None or f.properties.name == sensor)
        ]


def _leg_start(leg: DpfLeg, fixes: list[DpfFix], hosts: _Hosts) -> tuple[Position, str]:
    """Where a legacy leg starts, and what the note says of it."""
    tma = leg.tma
    label = f"leg {leg.name!r}" if leg.name else "a leg"
    first = fixes[0]
    saved = Position(first.longitude, first.latitude)
    if leg.kind == "AbsoluteTMASegment":
        if tma is not None and tma.origin is not None:
            return Position(*tma.origin), f"Its absolute {label} starts at its origin, as saved."
        return saved, f"Its absolute {label} starts at its first fix, as saved."
    if tma is None or tma.offset_m is None or tma.offset_bearing_deg is None:
        return saved, (
            f"Its relative {label} gives no offset from its host, so its positions are those "
            "legacy Debrief saved."
        )
    host_id = hosts.host_at(tma.host_track, first.time_ms)
    if host_id is None:
        return saved, (
            f"Its relative {label} is relative to {tma.host_track!r}, which is not in the plot, "
            "so its positions are those legacy Debrief saved."
        )
    path = hosts.path(host_id)
    named = [
        s
        for s in hosts.sensors_named(tma.host_track, tma.host_sensor)
        if tma.host_sensor and s.properties.host_track_id == host_id
    ]
    offset, mode = plot_sensors.array_of(named[0]) if named else (0.0, "worm_in_hole")
    place = cut_place(path, first.time_ms, None, offset, mode)  # type: ignore[arg-type]
    if place is None:
        return saved, (
            f"Its relative {label} starts outside {tma.host_track}'s fixes, so its positions "
            "are those legacy Debrief saved."
        )
    start = destination(
        place.position,
        Quantity(tma.offset_bearing_deg % 360.0, "deg"),
        Quantity(tma.offset_m, "m"),
    )
    if not tma.host_sensor:
        whose = f"{tma.host_track}"  # legacy took the host track's own position
    elif named:
        whose = f"{tma.host_track}'s {tma.host_sensor}"
    else:
        whose = f"{tma.host_track} (its sensor {tma.host_sensor!r} is not in the plot)"
    return start, (
        f"Its relative {label}, {_distance(tma.offset_m)} on "
        f"{format_bearing(Quantity(tma.offset_bearing_deg % 360.0, 'deg'))} from {whose} at "
        f"{_when(first.time_ms)}, is converted to positions at import: by dead reckoning from "
        "there, along geodesics. It no longer moves with its host."
    )


def _rooted(
    legs: Sequence[tuple[DpfLeg, list[DpfFix]]], hosts: _Hosts, primary: str | None = None
) -> tuple[list[str], list]:
    """The cuts the solution is rooted in: for each leg, those of the sensors it names (a
    relative leg's host sensor; an absolute leg, those its track's relative legs name)
    within its fixes. A solution of absolute legs alone names no sensor: it is rooted in
    the cuts of the tote's primary track's sensors, as legacy Stacked Dots measured it."""
    named: list = []
    for leg, _ in legs:
        if leg.tma is not None and leg.kind == "RelativeTMASegment":
            named += hosts.sensors_named(leg.tma.host_track, leg.tma.host_sensor)
    if not named and primary:
        named = hosts.sensors_named(primary, None)
    named = list({s.id: s for s in named}.values())
    cut_ids: list[tuple[str, str]] = []
    for leg, fixes in legs:
        if leg.kind == "RelativeTMASegment" and leg.tma is not None:
            mine = hosts.sensors_named(leg.tma.host_track, leg.tma.host_sensor)
        else:
            mine = named
        lo, hi = fixes[0].time_ms, fixes[-1].time_ms
        for sensor in mine:
            for cut in hosts.features:
                props = cut.properties
                if props.kind == "sensor_cut" and props.sensor_id == sensor.id:
                    t = parse_utc(props.time)
                    if lo <= t <= hi:
                        cut_ids.append((props.time, cut.id))
    ordered = [i for _, i in sorted(dict.fromkeys(cut_ids))]
    return ordered, named


def solutions(
    parsed: DpfFile, imported_tracks: list[tuple[int, str, str, list[DpfFix]]], features: list
) -> list[str]:
    """Each legacy track of TMA legs made a v4 solution, in place in features; the notes."""
    hosts = _Hosts(imported_tracks, features)
    notes: list[str] = []
    by_legacy: dict[str, DpfTrack] = {t.name: t for t in parsed.tracks}
    for index, name, legacy_name, fixes in imported_tracks:
        track = by_legacy.get(legacy_name)
        if track is None or not is_solution_track(track):
            continue
        mine = {id(f) for f in fixes}
        legs = [
            (leg, sorted(leg.fixes, key=lambda f: f.time_ms))
            for leg in track.legs
            if leg.kind in SOLUTION_LEGS and leg.fixes and id(leg.fixes[0]) in mine
        ]
        if not legs:
            continue
        legs.sort(key=lambda lf: lf[1][0].time_ms)
        made, said = _solution(
            features[index], name, legacy_name, legs, track, hosts, fixes, parsed.primary
        )
        features[index] = made
        hosts.by_id[made.id] = made
        notes += said
    return notes


def _solution(
    feature, name, legacy_name, legs, track: DpfTrack, hosts: _Hosts, fixes, primary=None
):
    kept = [f for _, leg_fixes in legs for f in leg_fixes]
    mine = {id(f) for f in fixes}
    infill = sum(
        len(leg.fixes)
        for leg in track.legs
        if leg.kind == INFILL and leg.fixes and id(leg.fixes[0]) in mine
    )
    other = len(fixes) - len(kept) - infill
    starts: list[Position] = []
    said: list[str] = []
    for leg, leg_fixes in legs:
        start, note = _leg_start(leg, leg_fixes, hosts)
        starts.append(start)
        said.append(f"Track {name!r}: {note[0].lower()}{note[1:]}")
    times = [f.time_ms for f in kept]
    courses = [f.course_deg for f in kept]
    speeds = [f.speed_kn for f in kept]
    # Each leg from its start by its fixes' courses and speeds; the join, from a leg's last
    # fix to the next leg's start, by the course and speed that reach it.
    positions: list[Position] = []
    first_index = 0
    for k, ((_, leg_fixes), start) in enumerate(zip(legs, starts, strict=True)):
        here = start
        for j, fix in enumerate(leg_fixes):
            i = first_index + j
            if j > 0:
                seconds = (fix.time_ms - times[i - 1]) / 1000
                here = destination(
                    positions[-1],
                    Quantity(courses[i - 1], "deg"),
                    Quantity(speeds[i - 1] * 1852 / 3600 * seconds, "m"),
                )
            positions.append(here)
        first_index += len(leg_fixes)
        if k + 1 < len(legs):
            last = first_index - 1
            seconds = (times[first_index] - times[last]) / 1000
            if seconds > 0:
                distance, bearing = range_bearing(positions[last], starts[k + 1])
                courses[last] = bearing.value
                speeds[last] = distance.value / seconds * 3600 / 1852
    # The most any fix is from where legacy Debrief drew it.
    worst = max(
        range_bearing(p, Position(f.longitude, f.latitude))[0].value
        for p, f in zip(positions, kept, strict=True)
    )
    leg_starts = [format_utc(leg_fixes[0].time_ms) for _, leg_fixes in legs[1:]]
    cut_ids, sensors_used = _rooted(legs, hosts, primary)
    by_primary = primary is not None and not any(
        leg.kind == "RelativeTMASegment" for leg, _ in legs
    )
    props = feature.properties
    kept_times = {format_utc(t) for t in times}
    tag = models.TmaSolution(
        contact=legacy_name,
        sensor_ids=[s.id for s in sensors_used],
        cut_ids=cut_ids,
        period=models.TimeRange(start=format_utc(times[0]), end=format_utc(times[-1])),
        leg_starts=leg_starts or None,
    )
    made = feature.model_copy(
        update={
            "geometry": feature.geometry.model_copy(
                update={"coordinates": [[p.longitude, p.latitude] for p in positions]}
            ),
            "properties": props.model_copy(
                update={
                    "times": [format_utc(t) for t in times],
                    "courses": models.AngleSeries(unit="deg", values=courses),
                    "speeds": models.SpeedSeries(unit="[kn_i]", values=speeds),
                    "depths": models.LengthSeries(unit="m", values=[f.depth_m for f in kept]),
                    "fix_marks": [m for m in props.fix_marks or [] if m.time in kept_times] or None,
                    "plotting_mode": "dr",
                    "logged_positions": None,
                    "tma": tag,
                }
            ),
        }
    )
    names = ", ".join(dict.fromkeys(s.properties.name for s in sensors_used)) or "no sensor"
    notes = [
        f"Track {name!r} is a TMA solution from legacy Debrief: imported as a solution of "
        f"contact {legacy_name!r}, plotted by dead reckoning, "
        f"{_plural(len(legs), 'leg')}, rooted in {_plural(len(cut_ids), 'cut')} of {names}.",
        *said,
        f"Track {name!r}: the most any fix is from where legacy Debrief drew it: "
        f"{_distance(worst)}."
        + (
            " Legacy Debrief worked its positions out on a flat earth, and a plot may have "
            "saved them without its sensor's array offset, which v4 applies as legacy does on "
            "load; v4 works along geodesics."
            if worst >= 1852 * 0.01
            else ""
        ),
    ]
    if by_primary and cut_ids:
        notes.append(
            f"Track {name!r}: its legs are all absolute and name no sensor, so it is rooted in "
            f"the cuts of {primary}'s sensors, the tote's primary track, as legacy Stacked Dots "
            "measured it."
        )
    if len(legs) > 1:
        notes.append(
            f"Track {name!r}: its legs are joined, as a v4 solution's are: each leg's last fix "
            "takes the course and speed that reach the next leg's start (legacy Debrief drew a "
            "gap or a dynamic infill there)."
        )
    if infill:
        notes.append(
            f"Track {name!r}: {_plural(infill, 'fix', 'fixes')} of a dynamic infill between its "
            "legs not imported: the join between the legs takes their place."
        )
    if other:
        notes.append(
            f"Track {name!r}: {_plural(other, 'fix', 'fixes')} not in a TMA leg not imported: "
            "a solution is its TMA legs."
        )
    if not cut_ids:
        notes.append(
            f"Track {name!r}: none of the cuts its legs were worked out from is in the plot, so "
            "it has no bearing residuals."
        )
    return made, notes
