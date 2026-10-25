"""Walkthroughs on the sample data (CAP-25): a fresh copy of serial 1 for each one.

Every walkthrough works on a copy of the sample's serial 1, never on the sample
itself (decision, product owner, 17 Oct 2026): the copy is a plot of its own in
the catalogue, titled after the walkthrough, whose first step holds the sample's
whole history and one more record saying it is a copy. Its sources, payloads and
supporting files are copied with it, so it is complete on its own.

What a walkthrough needs beyond the copy is made here too, so VS Code and the
playground get the same: for *Tidy a track*, three GPS glitches in RED ONE as a
step of their own; for *Import and collate*, BLUE ONE's navigation log as a REP
file to import; for *Bearings and TMA*, one wild bearing in the towed array's cuts,
as a step of its own (the sample's bearings have none: their errors are 2° or so).
The playground runs this module under Pyodide, so it imports nothing it need not
(the package's builder is not imported).
"""

from __future__ import annotations

import time
from pathlib import Path

from debrief_kernel.geodesy import Position, TrackPath, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models
from debrief_schemas.island import plot_feature
from debrief_stac import Catalogue, Changes

#: The walkthroughs, in the order they are offered, and their titles (the same as the guide's).
TOURS: dict[str, str] = {
    "explore": "Open and explore a serial",
    "collate": "Import and collate",
    "tidy": "Tidy a track",
    "annotate": "Annotate and export a figure",
    "tma": "Bearings and TMA",
}
#: The serial every walkthrough copies.
PLOT = "serial-1"
#: The navigation log Import and collate brings in, beside the catalogue.
LOG_FILE = "blue-one-nav-log.rep"
#: Bearings and TMA's wild bearing: the towed array's cut at this time of day, both its
#: bearings turned this far (degrees), so it lies well off its neighbours whichever side is kept.
WILD_SENSOR = "Towed array"
WILD_AT = "11:12:00"
WILD_TURN = -40.0
#: What Bearings and TMA's steps ask, as walkthroughs/tours.json says it (held to it by the
#: tests): the towed array's cut whose side is kept first, the period the solution is rooted in,
#: the shear that fits it about its start, the cut it is split into legs at, and the shear of its
#: first leg. Checked against the sample in tests, so a step never promises a fit it cannot give.
TMA_SENSOR = "sensor-blue-one-towed-array"
TMA_FIRST_CUT = "09:46:00"
TMA_PERIOD = ("09:46:00", "12:00:00")
TMA_SHEAR = (215.0, 3.0)
TMA_SPLIT = "10:38:00"
TMA_LEG_SHEAR = (285.0, 4.0)
#: Who makes the copies and the glitches, as provenance names it.
WALKTHROUGH = models.AgentRef(kind="software_agent", name="Debrief walkthrough")


def _now() -> str:
    return format_utc(int(time.time() * 1000))


def _unique(catalogue: Catalogue, stem: str) -> str:
    taken, item_id, n = set(catalogue.item_ids()), stem, 2
    while item_id in taken:
        item_id, n = f"{stem}-{n}", n + 1
    return item_id


def catalogue_title(tour: str) -> str:
    """A walkthrough's own catalogue, in VS Code: named so the analyst knows it for what it is."""
    return f"Walkthrough: {TOURS[tour]}"


def copy_title(source_title: str, tour: str) -> str:
    """The copy's title: the serial's, then the walkthrough's, so the two are never confused."""
    return f"{source_title}: {TOURS[tour]}"


def copy_for_tour(
    target: Catalogue,
    source_root: Path,
    tour: str,
    *,
    agent: models.AgentRef = WALKTHROUGH,
) -> str:
    """Copy serial 1 from the catalogue at source_root into target for a walkthrough,
    as a new plot titled after it; for *Tidy a track*, put GPS glitches into RED ONE.
    The source is only read. Returns the copy's item id."""
    if tour not in TOURS:
        raise ValueError(f"There is no walkthrough {tour!r}: choose one of {', '.join(TOURS)}.")
    source = Catalogue.open(source_root)
    plot = source.read_plot(PLOT)
    details = plot_feature(plot)
    serial_title = (details.properties.title if details is not None else None) or "Serial 1"
    title = copy_title(serial_title, tour)
    now = _now()
    record = models.ProvRecord(
        id=f"walkthrough-copy-{tour}-{int(time.time() * 1000)}",
        kind="edit",
        started_at=now,
        ended_at=now,
        agent=agent,
        notes=[
            f"Copied from {serial_title} of the sample for the walkthrough {TOURS[tour]}",
            "The sample itself is unchanged",
        ],
    )
    features = [
        f.model_copy(update={"properties": f.properties.model_copy(update={"title": title})})
        if f is details
        else f
        for f in plot.features
    ]
    content = plot.model_copy(
        update={"features": features, "provenance": [*(plot.provenance or []), record]}
    )
    item_id = _unique(target, f"{PLOT}-{tour}")
    target.create_plot(item_id, title, plot=content)
    try:
        # Sources, payloads and supporting files come too: the copy is complete on its own.
        for key, asset in source.assets(PLOT).items():
            path = source_root / PLOT / asset.href
            kind = asset.debrief_asset_kind
            media_type = asset.type or "application/octet-stream"
            if kind == "source":
                target.add_source(item_id, path, key=key, media_type=media_type)
            elif kind == "payload":
                target.add_payload(item_id, path, key=key, media_type=media_type)
            elif kind == "supporting_file":
                target.add_supporting_file(item_id, path, key=key, media_type=media_type)
        if tour == "tidy":
            red = next(
                f
                for f in target.read_plot(item_id).features
                if f.properties.kind == "track" and f.properties.name == "RED ONE"
            )
            put_glitches(target, item_id, red.id, agent, reason="for the walkthrough")
        if tour == "tma":
            put_wild_bearing(target, item_id, agent)
    except BaseException:
        target.discard_plot(item_id)
        raise
    return item_id


def glitch_indices(n: int) -> list[int]:
    """Which of a track's n fixes the glitches move."""
    return [n // 3, n // 3 + 1, 2 * n // 3]


def glitched_positions(coordinates: list) -> list[list[float]]:
    """A track's positions with three GPS glitches: two fixes in a row three miles off to
    the north, and one four miles off to the south."""
    positions = [list(p) for p in coordinates]
    moves = ((0, 3 * 1852), (0, 3 * 1852), (180, 4 * 1852))
    for index, (bearing, metres) in zip(glitch_indices(len(positions)), moves, strict=True):
        lon, lat = positions[index][:2]
        to = destination(Position(lon, lat), Quantity(bearing, "deg"), Quantity(metres, "m"))
        positions[index] = [to.longitude, to.latitude]
    return positions


def put_glitches(
    catalogue: Catalogue,
    item: str,
    feature: str,
    agent: models.AgentRef,
    *,
    reason: str = "to try jump removal on",
) -> None:
    """Put three GPS glitches into a track: two fixes in a row three miles off to the
    north, and one four miles off to the south. Recorded as a step of its own, by the
    agent given, so it is never mistaken for real data and Undo takes it out."""
    plot = catalogue.read_plot(item)
    track = next((f for f in plot.features if f.id == feature), None)
    if track is None or track.properties.kind != "track" or len(track.properties.times) < 12:
        raise ValueError("Select a track of at least 12 fixes to put glitches in.")
    positions = glitched_positions(track.geometry.coordinates)
    glitched = track.model_copy(
        update={"geometry": track.geometry.model_copy(update={"coordinates": positions})}
    )
    at = _now()
    record = models.ProvRecord(
        id=f"edit-glitches-{at}",
        kind="edit",
        started_at=at,
        agent=agent,
        notes=[
            f"GPS glitches put into {track.properties.name}",
            f"Three fixes moved off the track, {reason}",
        ],
    )
    catalogue.commit(item, [record], Changes(modified=[glitched]))


def wild_cut(plot: models.DebriefFeatureCollection) -> models.SensorCutFeature:
    """The towed array's cut Bearings and TMA makes wild: the one at WILD_AT, or the
    nearest to it on the serial's day."""
    by_id = {f.id: f for f in plot.features}
    cuts = [
        f
        for f in plot.features
        if f.properties.kind == "sensor_cut"
        and getattr(by_id.get(f.properties.sensor_id), "properties", None) is not None
        and by_id[f.properties.sensor_id].properties.name == WILD_SENSOR
    ]
    if not cuts:
        raise ValueError(f"The plot has no {WILD_SENSOR} cuts to make a wild bearing of.")
    day = cuts[0].properties.time[:10]
    wanted = parse_utc(f"{day}T{WILD_AT}.000Z")
    return min(cuts, key=lambda c: abs(parse_utc(c.properties.time) - wanted))


def _turned(angle: models.Angle | None) -> models.Angle | None:
    if angle is None:
        return None
    return models.Angle(value=round((angle.value + WILD_TURN) % 360.0, 2), unit="deg")


def put_wild_bearing(catalogue: Catalogue, item: str, agent: models.AgentRef) -> str:
    """Make one of the towed array's cuts a wild bearing, as a sonar sometimes gives: both its
    bearings turned 40° (WILD_TURN), so it lies well off its neighbours whichever side is
    kept. Recorded as a step of its own, by the agent given, so it is never mistaken for real
    data and Undo takes it out. Returns the cut's id."""
    cut = wild_cut(catalogue.read_plot(item))
    props = cut.properties
    wild = cut.model_copy(
        update={
            "properties": props.model_copy(
                update={
                    "bearing": _turned(props.bearing),
                    "ambiguous_bearing": _turned(props.ambiguous_bearing),
                }
            )
        }
    )
    at = _now()
    when = props.time[11:19] + "Z"
    record = models.ProvRecord(
        id=f"edit-wild-bearing-{at}",
        kind="edit",
        started_at=at,
        agent=agent,
        notes=[
            f"A wild bearing put into {WILD_SENSOR} cut at {when}",
            f"Its bearings turned {abs(WILD_TURN):g}° off, for the walkthrough to leave out",
        ],
    )
    catalogue.commit(item, [record], Changes(modified=[wild]))
    return cut.id


def _cut_at(plot: models.DebriefFeatureCollection, sensor_id: str, clock: str):
    cuts = [
        f
        for f in plot.features
        if f.properties.kind == "sensor_cut" and f.properties.sensor_id == sensor_id
    ]
    return next((c for c in cuts if c.properties.time[11:19] == clock), None)


def play_tma(
    catalogue: Catalogue, item: str, *, agent: models.AgentRef = WALKTHROUGH
) -> dict[str, dict]:
    """Bearings and TMA's steps on its copy, done as the walkthrough asks them: the towed
    array's first cut resolved to the side the Bow sonar agrees with, a solution made by
    Debrief's first guess, sheared about its start, the wild bearing left out, split into
    legs and its first leg sheared. For the pictures and the tests, so that what the steps
    promise is what the sample gives. Returns each stage's solution (its fixes) and residuals."""
    from debrief_stac import tma

    plot = catalogue.read_plot(item)
    first = _cut_at(plot, TMA_SENSOR, TMA_FIRST_CUT)
    bow = _cut_at(plot, "sensor-blue-one-bow-sonar", TMA_FIRST_CUT)
    if first is None or bow is None or first.properties.ambiguous_bearing is None:
        raise ValueError(
            f"The towed array has no ambiguous cut at {TMA_FIRST_CUT}Z beside the Bow sonar's."
        )

    def off(angle: models.Angle) -> float:
        return abs((angle.value - bow.properties.bearing.value + 180.0) % 360.0 - 180.0)

    props = first.properties
    keep = "bearing" if off(props.bearing) <= off(props.ambiguous_bearing) else "ambiguous_bearing"
    catalogue.resolve_ambiguity(item, {"keep": keep, "cut_ids": [first.id]}, agent)
    day = props.time[:10]

    def at(clock: str) -> str:
        return f"{day}T{clock}.000Z"

    period = {"start": at(TMA_PERIOD[0]), "end": at(TMA_PERIOD[1])}
    _, solution = catalogue.create_tma(item, {"sensor_ids": [TMA_SENSOR], "period": period}, agent)
    stages: dict[str, dict] = {}

    def stage(name: str) -> None:
        now = catalogue.read_plot(item)
        track = next(f for f in now.features if f.id == solution)
        stages[name] = {
            "solution": solution,
            "kept": keep,
            "first_cut": first.id,
            "times": list(track.properties.times),
            "leg_starts": list(track.properties.tma.leg_starts or []),
            "coordinates": [list(p[:2]) for p in track.geometry.coordinates],
            "residuals": tma.residual_report(now, solution),
        }

    def shear(course_speed: tuple[float, float], extent: dict | None = None) -> None:
        course, speed = course_speed
        edit = {
            "action": "shear",
            "anchor": "start",
            "course": {"value": course, "unit": "deg"},
            "speed": {"value": speed, "unit": "[kn_i]"},
            **({"period": extent} if extent else {}),
        }
        catalogue.edit_track(item, solution, edit, agent)

    stage("first")
    shear(TMA_SHEAR)
    stage("drag")
    wild = wild_cut(catalogue.read_plot(item))
    catalogue.tma_exclude(item, solution, [wild.id], True, agent)
    stage("wild")
    catalogue.tma_split_leg(item, solution, at(TMA_SPLIT), agent)
    stage("split")
    before = [t for t in stages["split"]["times"] if t < at(TMA_SPLIT)]
    shear(TMA_LEG_SHEAR, {"start": before[0], "end": before[-1]})
    stage("legs")
    return stages


# --- A navigation log, as new data arrives (CAP-10) ---------------------------------------


def _dms(value: float, positive: str, negative: str, width: int) -> str:
    hemisphere = positive if value >= 0 else negative
    hundredths = round(abs(value) * 360_000)
    degrees, rest = divmod(hundredths, 360_000)
    minutes, rest = divmod(rest, 6_000)
    return f"{degrees:0{width}d} {minutes:02d} {rest / 100:05.2f} {hemisphere}"


def _rep(name: str, ms: int, position: Position, course: float, knots: float) -> str:
    when = format_utc(ms)
    stamp = f"{when[2:4]}{when[5:7]}{when[8:10]} {when[11:13]}{when[14:16]}{when[17:19]}.000"
    quoted = f'"{name}"' if " " in name else name
    lat = _dms(position.latitude, "N", "S", 2)
    lon = _dms(position.longitude, "E", "W", 3)
    return f"{stamp} {quoted} @A {lat} {lon} {course:05.1f} {knots:.1f} 0"


def _leg(track_path: TrackPath, ms: int) -> tuple[Position, Position, float]:
    leg = track_path.leg_at(ms)
    i = min(leg[0] if leg else 0, len(track_path.positions) - 2)
    seconds = max((track_path.times_ms[i + 1] - track_path.times_ms[i]) / 1000, 1)
    return track_path.positions[i], track_path.positions[i + 1], seconds


def _course(track_path: TrackPath, ms: int) -> float:
    a, b, _ = _leg(track_path, ms)
    return range_bearing(a, b)[1].value


def _knots(track_path: TrackPath, ms: int) -> float:
    a, b, seconds = _leg(track_path, ms)
    return range_bearing(a, b)[0].value / seconds * 3600 / 1852


#: How long the log runs on after the track ends, and how often it has a fix.
LOG_TAIL_MS = 20 * 60_000
LOG_STEP_MS = 10_000


def log_period(start: int, end: int) -> tuple[int, int]:
    """The part of a track's period its navigation log overlaps: from a third of the way in,
    for a quarter of it, on whole minutes."""
    first = start + (end - start) // 3 // 60_000 * 60_000
    return first, first + (end - start) // 4 // 60_000 * 60_000


def navigation_log(track: models.TrackFeature) -> str:
    """A track's own navigation log as a REP file, as new data would arrive: a fix every
    10 s over part of its period (from a third of the way in, for a quarter of it) and on
    for 20 minutes after it ends, 120 m from where the plot has it, under its name in
    other letters (*Blue One*); and a contact the plot has never seen, WATCHER. Fiction,
    like the sample; the same track always gives the same file."""
    path_of = TrackPath.from_feature(track)
    start, end = path_of.start_ms, path_of.end_ms
    name = track.properties.name.title()
    lines = [
        ";; A navigation log, made up for Debrief's sample: not a record of any real platform."
    ]
    first, last = log_period(start, end)
    north = Quantity(120, "m")
    for ms in range(first, last + 1, LOG_STEP_MS):
        at = destination(path_of.position_at(ms), Quantity(0, "deg"), north)
        lines.append(_rep(name, ms, at, _course(path_of, ms), _knots(path_of, ms)))
    course, knots = _course(path_of, end), _knots(path_of, end)
    tail = path_of.position_at(end)
    for i in range(1, LOG_TAIL_MS // LOG_STEP_MS + 1):
        metres = knots * 1852 / 3600 * i * LOG_STEP_MS / 1000
        at = destination(tail, Quantity(course, "deg"), Quantity(metres, "m"))
        lines.append(_rep(name, end + i * LOG_STEP_MS, at, course, knots))
    origin = destination(path_of.position_at(first), Quantity(225, "deg"), Quantity(6000, "m"))
    for i in range(31):
        at = destination(origin, Quantity(80, "deg"), Quantity(i * 300, "m"))
        lines.append(_rep("WATCHER", first + i * 60_000, at, 80.0, 9.7))
    return "\n".join(lines) + "\n"


def log_track(catalogue: Catalogue, item: str) -> models.TrackFeature:
    """The track a navigation log is made for: the plot's first track of more than two fixes."""
    plot = catalogue.read_plot(item)
    tracks = [
        f for f in plot.features if f.properties.kind == "track" and len(f.properties.times) > 2
    ]
    if not tracks:
        raise ValueError("The open plot has no track to bring new data for.")
    return tracks[0]


# --- VS Code: a catalogue of its own for each walkthrough ---------------------------------


def prepare(folder: Path, tour: str) -> dict[str, str]:
    """Build the sample catalogue into folder/catalogue and copy serial 1 for the
    walkthrough there; for *Import and collate*, write the navigation log beside the
    catalogue (folder/blue-one-nav-log.rep), outside it, as a file waiting to be
    imported. Returns where things are, for the host to open."""
    from debrief_sample.builder import build  # never imported in the browser

    if tour not in TOURS:
        raise ValueError(f"There is no walkthrough {tour!r}: choose one of {', '.join(TOURS)}.")
    root = Path(folder) / "catalogue"
    build(root, catalogue_id=f"debrief-walkthrough-{tour}", title=catalogue_title(tour))
    catalogue = Catalogue.open(root)
    item = copy_for_tour(catalogue, root, tour)
    out = {
        "catalogue": str(root),
        "catalogue_title": catalogue_title(tour),
        "item": item,
        "title": catalogue.read_item(item).properties.title or item,
    }
    if tour == "collate":
        log = Path(folder) / LOG_FILE
        log.write_text(navigation_log(log_track(catalogue, item)), encoding="utf-8")
        out["log"] = str(log)
    return out
