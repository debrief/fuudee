"""Importing a legacy plot file (.dpf) into a catalogue as a new plot (EXT-14, EXT-15).

As for REP files: the source is copied into the plot's item, read-only, and
hashed (SUB-10, SUB-11); the plot records one provenance entry naming that
source, the importer and its version, and everything the import did not
take (SUB-18). Nothing in the file is dropped silently. Each entity that is
not imported is named, both in the returned report (for the message the
analyst sees) and in the plot's provenance, so the list travels with the plot.

What becomes what:

- Tracks: every leg's fixes, joined into one track in time order, with
  courses, speeds, depths and the track's colour. When legs overlap in
  time, joining them would zig-zag between them, so each leg becomes a
  track of its own instead, named "<track> (<leg>)".
- Text labels: label annotations. Circles, rectangles, lines, polygons,
  ellipses and vectors: shape annotations. Circles and ellipses become
  polygons of 72 sides, since GeoJSON has no curves.
- Narrative entries: time-only note annotations, as the sample data holds
  its narrative.
- Layers: v4 has no layers yet. A layer's annotations, and the narrative's
  notes, are kept together as a named set with the layer's name; the
  layer's settings are listed as not imported.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from importlib.metadata import version
from pathlib import Path

from debrief_io.dpf import DpfError, DpfFile, DpfFix, DpfShape, DpfTrack, parse_dpf
from debrief_io.importer import Clock, ImportReport, store_import, wall_clock
from debrief_io.rep import DEFAULT_COLOUR
from debrief_kernel.geodesy import Position, destination
from debrief_kernel.time import format_utc
from debrief_kernel.units import angle, length
from debrief_schemas import SCHEMA_VERSION, DebriefFeatureCollection, models
from debrief_stac import Catalogue

IMPORTER = "debrief-io.dpf"
MEDIA_TYPE = "application/xml"

# Sides of the polygon that stands in for a circle or an ellipse.
CURVE_SIDES = 72

# The largest plot file imported. The whole file is read into memory, and its
# tree with it; legacy plot files are rarely more than a few megabytes.
MAX_FILE_BYTES = 200 * 1024 * 1024

# How many unreadable depths a note lists by line before summing up the rest.
LISTED = 5

TMA_LEGS = {
    "RelativeTMASegment": "a TMA solution relative to another track",
    "AbsoluteTMASegment": "a TMA solution",
    "DynamicInfillSegment": "a dynamic infill between legs",
}

CARRIED = {
    "sensor": ("sensor", "cut"),
    "tma": ("TMA solution set", "solution"),
    "DynamicShapeSet": ("set of dynamic shapes", "shape"),
}


def _plural(count: int, word: str, plural: str | None = None) -> str:
    return f"{count} {word if count == 1 else plural or word + 's'}"


def _are(count: int) -> str:
    return "is" if count == 1 else "are"


def _unique_id(prefix: str, name: str, taken: set[str]) -> str:
    base = f"{prefix}-" + (re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "unnamed")
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    taken.add(candidate)
    return candidate


def _entity(element: str, name: str | None, layer: str | None) -> str:
    text = f"{element} {name!r}" if name else f"An unnamed {element}"
    return text + (f" in layer {layer!r}" if layer else "")


# --- Tracks ------------------------------------------------------------------------


def _track_feature(
    feature_id: str, name: str, track: DpfTrack, fixes: list[DpfFix]
) -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[f.longitude, f.latitude] for f in fixes]
        ),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=[format_utc(f.time_ms) for f in fixes],
            speeds=models.SpeedSeries(unit="[kn_i]", values=[f.speed_kn for f in fixes]),
            courses=models.AngleSeries(unit="deg", values=[f.course_deg for f in fixes]),
            depths=models.LengthSeries(unit="m", values=[f.depth_m for f in fixes]),
            style=models.TrackStyle(colour=track.colour or DEFAULT_COLOUR),
        ),
    )


def _track_parts(track: DpfTrack) -> list[tuple[str, list[DpfFix]]] | None:
    """Each leg as a track of its own, named "<track> (<leg>)", when legs overlap in time.

    None when they do not, and the legs are joined into one track. Joining
    legs that overlap would zig-zag between them in time order.
    """
    spans = sorted(
        (min(f.time_ms for f in leg.fixes), max(f.time_ms for f in leg.fixes))
        for leg in track.legs
        if leg.fixes
    )
    latest_end = None
    overlap = False
    for start, end in spans:
        if latest_end is not None and start < latest_end:
            overlap = True
        latest_end = end if latest_end is None else max(latest_end, end)
    if not overlap:
        return None
    parts = []
    for index, leg in enumerate(track.legs, start=1):
        leg_name = leg.name or ("loose fixes" if leg.kind == "fix" else f"leg {index}")
        parts.append((f"{track.name} ({leg_name})", leg.fixes))
    return parts


def _in_time_order(fixes: list[DpfFix]) -> list[DpfFix]:
    return sorted(fixes, key=lambda f: f.time_ms)  # stable: equal times keep file order


def _duplicate_times_note(name: str, fixes: list[DpfFix]) -> str | None:
    """Fixes that share a time with the fix before them. A plot allows equal times, so they stay."""
    repeats = [b for a, b in zip(fixes, fixes[1:], strict=False) if a.time_ms == b.time_ms]
    if not repeats:
        return None
    return (
        f"Track {name!r}: {_plural(len(repeats), 'fix', 'fixes')} "
        f"{'has' if len(repeats) == 1 else 'have'} the same time as the fix before "
        f"(the first at {format_utc(repeats[0].time_ms)}); "
        f"{'it is' if len(repeats) == 1 else 'they are'} imported as saved."
    )


def _track_notes(track: DpfTrack, joined: bool) -> list[str]:
    notes = []
    name = track.name
    if joined and len(track.legs) > 1:
        notes.append(
            f"Track {name!r} has {len(track.legs)} legs; they are joined into one track "
            "in time order, and their names and line styles are not imported."
        )
    for leg in track.legs:
        if leg.kind in TMA_LEGS:
            notes.append(
                f"Track {name!r}: leg {leg.name or 'unnamed'!r} ({leg.kind}) is "
                f"{TMA_LEGS[leg.kind]}. Its {_plural(len(leg.fixes), 'fix', 'fixes')} "
                f"{_are(len(leg.fixes))} imported "
                "as they were saved; the solution behind them is not."
            )
    for item in track.carried:
        what, unit = CARRIED.get(item.kind, (item.kind, "item"))
        label = f"{what} {item.name!r}" if item.name else f"an unnamed {what}"
        reason = (
            "sensor data in plot files is not yet supported"
            if item.kind == "sensor"
            else "these are not yet supported"
        )
        notes.append(
            f"Track {name!r}: {label} ({item.kind}, {_plural(item.count, unit)}) "
            f"not imported: {reason}."
        )
    fixes = [f for leg in track.legs for f in leg.fixes]
    comments = sum(1 for f in fixes if f.comment)
    if comments:
        notes.append(f"Track {name!r}: {_plural(comments, 'fix comment')} not imported.")
    labels = sum(1 for f in fixes if f.label)
    if labels:
        notes.append(f"Track {name!r}: {_plural(labels, 'fix label')} not imported.")
    coloured = sum(1 for f in fixes if f.colour and f.colour != track.colour)
    if coloured:
        notes.append(
            f"Track {name!r}: {_plural(coloured, 'fix', 'fixes')} drawn in a colour of their own; "
            "a v4 track has one colour, so these take the track's."
        )
    hidden = sum(1 for f in fixes if not f.visible)
    if hidden:
        notes.append(
            f"Track {name!r}: {_plural(hidden, 'fix', 'fixes')} hidden in the legacy plot "
            f"{_are(hidden)} imported and will be shown."
        )
    bad = [f for f in fixes if f.bad_depth is not None]
    if bad:
        listed = ", ".join(f"{f.bad_depth!r} at line {f.line}" for f in bad[:LISTED])
        more = f", and {len(bad) - LISTED} more" if len(bad) > LISTED else ""
        notes.append(
            f"Track {name!r}: {_plural(len(bad), 'fix', 'fixes')} had a depth that could not "
            f"be read ({listed}{more}); a depth of zero is used."
        )
    return notes


# --- Annotations -------------------------------------------------------------------


def _ring(centre: tuple[float, float], radius_at) -> list[list[float]]:
    """A closed ring of CURVE_SIDES positions, at radius_at(bearing) metres from centre."""
    origin = Position(*centre)
    ring = []
    for i in range(CURVE_SIDES):
        bearing, distance = radius_at(360.0 * i / CURVE_SIDES)
        point = destination(origin, angle(bearing), length(distance))
        ring.append([point.longitude, point.latitude])
    ring.append(ring[0])
    return ring


def _ellipse_radius(shape: DpfShape):
    """Bearing and distance to the ellipse's edge at each step of the parametric angle."""
    major, minor = shape.radius_m, shape.minor_m

    def at(t_deg: float) -> tuple[float, float]:
        t = math.radians(t_deg)
        x, y = major * math.cos(t), minor * math.sin(t)
        return (shape.orientation_deg + math.degrees(math.atan2(y, x))) % 360, math.hypot(x, y)

    return at


def _geometry(shape: DpfShape):
    """The shape's GeoJSON geometry, or None with the reason it has none."""
    if shape.kind == "textlabel":
        return models.PointGeometry(type="Point", coordinates=list(shape.points[0])), None
    if shape.kind == "circle":
        ring = _ring(shape.centre, lambda b: (b, shape.radius_m))
        return models.PolygonGeometry(type="Polygon", coordinates=[ring]), None
    if shape.kind == "ellipse":
        ring = _ring(shape.centre, _ellipse_radius(shape))
        return models.PolygonGeometry(type="Polygon", coordinates=[ring]), None
    if shape.kind == "rectangle":
        (west, north), (east, south) = shape.points
        ring = [[west, north], [east, north], [east, south], [west, south], [west, north]]
        return models.PolygonGeometry(type="Polygon", coordinates=[ring]), None
    if shape.kind == "line":
        return models.LineStringGeometry(
            type="LineString", coordinates=[list(p) for p in shape.points]
        ), None
    if shape.kind == "vector":
        start = Position(*shape.points[0])
        end = destination(start, angle(shape.orientation_deg % 360), length(shape.radius_m))
        coordinates = [list(shape.points[0]), [end.longitude, end.latitude]]
        return models.LineStringGeometry(type="LineString", coordinates=coordinates), None
    if shape.kind == "polygon":
        points = [list(p) for p in shape.points]
        distinct = len(set(shape.points))
        if shape.closed and distinct >= 3:
            if points[0] != points[-1]:
                points.append(points[0])
            return models.PolygonGeometry(type="Polygon", coordinates=[points]), None
        if distinct >= 2:
            return models.LineStringGeometry(type="LineString", coordinates=points), None
        return None, f"it has {_plural(distinct, 'distinct point')}, too few to draw"
    return None, "this shape is not yet supported"


def _annotation(feature_id: str, shape: DpfShape, geometry) -> models.AnnotationFeature:
    label = shape.label.strip()
    name = " ".join(label.split()) or f"{shape.kind} in {shape.layer}"
    time = time_range = None
    if shape.time_ms is not None and shape.end_ms is not None and shape.end_ms >= shape.time_ms:
        time_range = models.TimeRange(start=format_utc(shape.time_ms), end=format_utc(shape.end_ms))
    elif shape.time_ms is not None:
        time = format_utc(shape.time_ms)
    elif shape.end_ms is not None:
        time = format_utc(shape.end_ms)
    return models.AnnotationFeature(
        type="Feature",
        id=feature_id,
        geometry=geometry,
        properties=models.AnnotationProperties(
            kind="annotation",
            style="label" if shape.kind == "textlabel" else "shape",
            name=name,
            text=label if "\n" in label else None,
            time=time,
            time_range=time_range,
        ),
    )


# --- The plot ----------------------------------------------------------------------


def build_plot_from_dpf(
    data: bytes | DpfFile,
    source: models.SourceRef,
    agent: models.AgentRef,
    *,
    clock: Clock = wall_clock,
) -> tuple[DebriefFeatureCollection, ImportReport]:
    """Read a plot file into a v4 plot and a report of what was and was not imported.

    Takes the file's bytes, or a file already read with parse_dpf. The clock
    times the provenance record; pass a fixed one for a repeatable plot.
    """
    started = format_utc(clock())
    parsed = data if isinstance(data, DpfFile) else parse_dpf(data)
    report = ImportReport(item_id="")
    notes: list[str] = []
    features: list = []
    taken: set[str] = set()

    if parsed.truncated_times:
        notes.append(
            f"{_plural(parsed.truncated_times, 'time')} had more than millisecond precision "
            f"and {'was' if parsed.truncated_times == 1 else 'were'} truncated to milliseconds."
        )
    if parsed.saved_by:
        notes.append(f"The plot file was saved by legacy Debrief: {parsed.saved_by!r}.")
    for line, problem in parsed.errors:
        notes.append(f"Line {line} could not be read: {problem}.")
    for line, problem in parsed.warnings:
        notes.append(f"Line {line}: {problem}.")

    # Tracks.
    hidden = 0
    for track in parsed.tracks:
        parts = _track_parts(track)
        if parts is not None:
            names = ", ".join(repr(name) for name, _ in parts)
            notes.append(
                f"Track {track.name!r} has legs that overlap in time, so each leg is "
                f"imported as a track of its own: {names}."
            )
        else:
            parts = [(track.name, [f for leg in track.legs for f in leg.fixes])]
        imported = False
        for name, fixes in parts:
            if len(fixes) < 2:
                notes.append(
                    f"Track {name!r} has {_plural(len(fixes), 'fix', 'fixes')}, "
                    "so it was not imported as a track."
                )
                continue
            fixes = _in_time_order(fixes)
            features.append(_track_feature(_unique_id("track", name, taken), name, track, fixes))
            report.tracks.append(name)
            report.fixes += len(fixes)
            hidden += not track.visible
            imported = True
            duplicates = _duplicate_times_note(name, fixes)
            if duplicates:
                notes.append(duplicates)
        notes += _track_notes(track, joined=imported and len(parts) == 1)

    # Annotations, grouped by layer.
    members: dict[str, list[str]] = {}
    drawn_as_polygons: Counter[str] = Counter()
    for shape in parsed.shapes:
        geometry, reason = _geometry(shape)
        if geometry is None:
            entity = _entity(shape.kind, shape.label.strip() or None, shape.layer)
            notes.append(f"{entity} not imported: {reason}.")
            continue
        feature_id = _unique_id("annotation", shape.label or shape.kind, taken)
        features.append(_annotation(feature_id, shape, geometry))
        members.setdefault(shape.layer, []).append(feature_id)
        report.annotations += 1
        hidden += not shape.visible
        if shape.kind in ("circle", "ellipse"):
            drawn_as_polygons[shape.kind] += 1
    for kind, count in sorted(drawn_as_polygons.items()):
        notes.append(
            f"{_plural(count, kind)} drawn as {'a polygon' if count == 1 else 'polygons'} "
            f"of {CURVE_SIDES} sides, since a plot holds no curves."
        )

    # Narrative.
    types: Counter[str] = Counter()
    for index, entry in enumerate(parsed.narrative, start=1):
        feature_id = _unique_id("narrative", f"{index:03d}", taken)
        features.append(
            models.AnnotationFeature(
                type="Feature",
                id=feature_id,
                geometry=None,
                properties=models.AnnotationProperties(
                    kind="annotation",
                    style="note",
                    name=entry.track or entry.narrative,
                    text=entry.text,
                    time=format_utc(entry.time_ms),
                ),
            )
        )
        members.setdefault(entry.narrative, []).append(feature_id)
        report.narrative_entries += 1
        if entry.entry_type:
            types[entry.entry_type] += 1
    if types:
        listed = ", ".join(f"{t!r} ({n})" for t, n in types.most_common())
        notes.append(f"Narrative entry types not imported: {listed}.")

    # Everything understood but not imported, each entity named; repeats counted.
    skipped = Counter(parsed.skipped)
    for item, count in skipped.items():
        entity = _entity(item.element, item.name, item.layer)
        times = f" ({count} of them)" if count > 1 else ""
        notes.append(f"{entity}{times} not imported: {item.reason}.")

    # Layers: kept as named sets; their settings are not imported.
    named_sets = []
    set_ids: set[str] = set()
    for layer in parsed.layers:
        ids = members.pop(layer.name, [])
        shown = "shown" if layer.visible else "hidden"
        if ids:
            named_sets.append(
                models.NamedSet(
                    id=_unique_id("layer", layer.name, set_ids), name=layer.name, feature_ids=ids
                )
            )
            kept = (
                f"its {_plural(len(ids), 'item')} {_are(len(ids))} kept "
                f"as the named set {layer.name!r}"
            )
        else:
            kept = "it holds nothing that was imported"
        notes.append(
            f"Layer {layer.name!r} ({layer.kind}, {shown}): its settings are not imported, "
            f"since v4 has no layers yet; {kept}."
        )

    # Display settings, which v4 does not yet hold.
    display = [
        "fix labels, symbols and arrows",
        "track symbols, fonts and line styles",
        "colours, fonts, fills and line styles of annotations",
    ]
    notes.append(
        "Display settings not imported: "
        + "; ".join(display)
        + "."
        + (
            f" {_plural(hidden, 'item')} hidden in the legacy plot "
            f"{_are(hidden)} imported and will be shown."
            if hidden
            else ""
        )
    )
    if parsed.view_settings:
        notes.append("View settings not imported: " + ", ".join(parsed.view_settings) + ".")

    report.omitted = notes
    record = models.ProvRecord(
        id=f"import-{started}",
        kind="import",
        started_at=started,
        ended_at=format_utc(clock()),
        tool=models.ToolRef(name=IMPORTER, version=version("debrief-io")),
        agent=agent,
        used=[source],
        notes=notes or None,
    )
    plot = DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version=SCHEMA_VERSION,
        features=features,
        named_sets=named_sets or None,
        provenance=[record],
    )
    return plot, report


def import_dpf(
    catalogue: Catalogue,
    path: Path,
    *,
    item_id: str | None = None,
    title: str | None = None,
    agent: models.AgentRef | None = None,
    allow_newer_schema: bool = False,
    clock: Clock = wall_clock,
) -> ImportReport:
    """Import a legacy plot file as a new plot in the catalogue.

    The file is read, and the plot built and validated, before anything is
    written: a file that cannot be read at all raises DpfError, a plot that
    is not valid raises DocumentValidationError, and either leaves the
    catalogue unchanged. A file larger than MAX_FILE_BYTES is refused.
    """
    path = Path(path)
    with path.open("rb") as stream:
        data = stream.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise DpfError(
            f"{path.name} is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB, "
            "the largest plot file this importer reads"
        )
    parsed = parse_dpf(data)
    item_id = item_id or re.sub(r"[^A-Za-z0-9._-]+", "-", path.stem).strip("-.") or "plot"
    agent = agent or models.AgentRef(kind="person", name="analyst")
    return store_import(
        catalogue,
        path,
        data,
        item_id,
        title or path.stem,
        MEDIA_TYPE,
        lambda source: build_plot_from_dpf(parsed, source, agent, clock=clock),
        allow_newer_schema=allow_newer_schema,
    )
