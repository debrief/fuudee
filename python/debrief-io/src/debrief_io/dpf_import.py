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
  track of its own instead, named "<track> (<leg>)". A fix's own colour,
  label and comment become the track's marked fixes (fix_marks); a label
  that only gives the fix's time, as legacy Debrief labels every fix, is
  listed rather than kept, since Debrief shows fixes' times itself. A leg
  legacy Debrief plotted by dead reckoning (DR, PlotRelative) comes with the
  positions legacy worked out and saved, and the import says so: v4 does not
  work them out again when the track changes.
- Text labels: label annotations. Rectangles and closed polygons: areas.
  Lines, open polygons and vectors: lines. Circles and ellipses: circles and
  ellipses, with their exact centre and size, and a polygon of 72 sides as
  their geometry so other GeoJSON tools see the area (GeoJSON has no curves).
  How each was drawn comes too: its colour, line style and width, fill, label
  size and label position. What v4 cannot draw (label symbols, fonts other
  than plain Arial, label colours of their own, arrowheads, and dash patterns
  v4 does not have) is listed.
- How often tracks are labelled, marked with a symbol and given a direction arrow
  (CAP-32): each active display rule (CoreFormatter) becomes the label, symbol or
  arrow interval of the tracks it names, or of every track; legacy Debrief's "All"
  (an interval of 0, or its show-all value) becomes "all" for labels and symbols. A
  track no rule sets an interval for, whose fixes legacy Debrief showed with their
  label, symbol or arrow, gets the interval those fixes fall at, where they fall as
  legacy Debrief would have shown them at one of the intervals the forms offer (or at
  every fix); otherwise they are listed. Legacy Debrief keeps no frequency on a track
  in the file (TrackHandler writes none), only these.
- Sensors (CAP-22): each track's sensors, with their cuts, on the track that
  carries them: bearings, ambiguous bearings and whether the analyst resolved
  them (legacy kept the discarded bearing as the ambiguous one), ranges, the
  sensor's own position where a cut has one, labels, comments, colours and
  hiding. Frequencies, base frequencies, array offsets and modes, and how cuts
  were drawn (labels shown, line styles, thickness) are listed, not imported.
- Narrative entries: narrative entries, each with its time, its source (the
  track the legacy entry names), its type and its text, belonging to the
  track of that name where there is one (CAP-20, schema 0.0.19).
- Layers: v4 has no layers yet. A layer's annotations, and the narrative's
  entries, are kept together as a named set with the layer's name; the
  layer's settings are listed as not imported.
"""

from __future__ import annotations

import re
from collections import Counter
from importlib.metadata import version
from pathlib import Path

from debrief_io.dpf import (
    DpfError,
    DpfFile,
    DpfFix,
    DpfFormatter,
    DpfShape,
    DpfTrack,
    parse_dpf,
)
from debrief_io.importer import Clock, ImportReport, store_import, wall_clock
from debrief_io.rep import DEFAULT_COLOUR
from debrief_io.sensor_import import sensors_note
from debrief_kernel.geodesy import Position, circle_ring, destination, ellipse_ring
from debrief_kernel.time import format_utc
from debrief_kernel.units import angle, length
from debrief_schemas import SCHEMA_VERSION, DebriefFeatureCollection, models
from debrief_stac import Catalogue, frequencies, narrative
from debrief_stac import sensors as plot_sensors
from debrief_stac.sensors import ReadCut, ReadSensor

IMPORTER = "debrief-io.dpf"
MEDIA_TYPE = "application/xml"

# The colour v4 gives an annotation with none of its own (vscode/webview/palette.ts),
# used for a legacy fill whose shape has the default colour.
ANNOTATION_COLOUR = "#c7820a"

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


def _time_label(fix: DpfFix) -> bool:
    """Whether a fix's label only gives its time, as legacy Debrief labels every fix
    unless told otherwise ("0504", "120500", "05:04"): its figures appear, in order,
    in the fix's year, month, day, hour, minute and second."""
    label = (fix.label or "").strip()
    figures = re.sub(r"[\s.:/Z]", "", label)
    if len(figures) < 4 or not figures.isdigit():
        return False
    stamp = format_utc(fix.time_ms)  # 2023-06-15T09:31:00.000Z
    return figures in re.sub(r"\D", "", stamp[2:19])


def _fix_marks(
    name: str, track: DpfTrack, fixes: list[DpfFix]
) -> tuple[list[models.FixMark] | None, list[str]]:
    """Each fix's own colour, label and comment, as the track's marked fixes, and notes
    on what was not kept as it was. Fixes in time order; a mark is found by its time, so
    of fixes sharing a time only the first's is kept."""
    colour = track.colour or DEFAULT_COLOUR
    marks: dict[str, models.FixMark] = {}
    time_labels = hidden_labels = clashes = 0
    for fix in fixes:
        own = {}
        if fix.colour and fix.colour != colour:
            own["colour"] = fix.colour
        if fix.label and fix.label.strip():
            if _time_label(fix):
                time_labels += 1
            else:
                own["label"] = fix.label.strip()
                hidden_labels += not fix.label_showing
        if fix.comment and fix.comment.strip():
            own["comment"] = fix.comment.strip()
        if not own:
            continue
        at = format_utc(fix.time_ms)
        if at in marks:
            clashes += 1
            continue
        marks[at] = models.FixMark(time=at, **own)
    notes = []
    if time_labels:
        notes.append(
            f"Track {name!r}: {_plural(time_labels, 'fix label')} that only "
            f"{'gives' if time_labels == 1 else 'give'} the fix's time "
            f"{_are(time_labels)} not imported; Debrief shows fixes' times itself."
        )
    if hidden_labels:
        notes.append(
            f"Track {name!r}: {_plural(hidden_labels, 'fix label')} hidden in the legacy plot "
            f"{_are(hidden_labels)} imported and will be shown."
        )
    if clashes:
        notes.append(
            f"Track {name!r}: {_plural(clashes, 'fix', 'fixes')} with a colour, label or "
            "comment of their own share a time with the fix before; only the first fix's "
            "is imported."
        )
    return [marks[t] for t in sorted(marks)] or None, notes


def _track_feature(
    feature_id: str,
    name: str,
    track: DpfTrack,
    fixes: list[DpfFix],
    marks: list[models.FixMark] | None = None,
    mode: str = "otg",
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
            fix_marks=marks,
            plotting_mode=mode,
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
        if leg.dead_reckoned and leg.kind not in TMA_LEGS:
            # Legacy Debrief plotted this leg by dead reckoning (DR) and saved the positions
            # it worked out; v4 keeps them, but does not work them out again when the track
            # changes, as legacy did. "Plot as dead reckoning" does that, as a step.
            leg_name = f"leg {leg.name!r}" if leg.name else "a leg"
            notes.append(
                f"Track {name!r}: {leg_name} is plotted by dead reckoning (DR) in the legacy "
                f"plot. Its {_plural(len(leg.fixes), 'fix', 'fixes')} {_are(len(leg.fixes))} "
                "imported where legacy Debrief plotted them, from the leg's first fix by each "
                "fix's course and speed; the legacy plot does not hold its positions as "
                "logged, so it cannot be plotted over the ground."
            )
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
        notes.append(
            f"Track {name!r}: {label} ({item.kind}, {_plural(item.count, unit)}) "
            "not imported: these are not yet supported."
        )
    # Each fix's own colour, label and comment are imported as marked fixes (_fix_marks).
    fixes = [f for leg in track.legs for f in leg.fixes]
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


# --- How often tracks are labelled, marked and arrowed (CAP-32) --------------------

# A display rule's A_Style (AttributeTypePropertyEditor) and the interval it sets.
FORMATTER_FIELDS = {
    "Label": "label_interval",
    "Symbol": "symbol_interval",
    "Arrow": "arrow_interval",
}
NOUNS = {"label_interval": "label", "symbol_interval": "symbol", "arrow_interval": "arrow"}
FLAGS = {
    "label_interval": "label_showing",
    "symbol_interval": "symbol_showing",
    "arrow_interval": "arrow_showing",
}
# Legacy Debrief's "All": an interval of 0 applies the rule to every fix, and its
# show-all value (TimeFrequencyPropertyEditor.SHOW_ALL_FREQUENCY, TimePeriod.INVALID_TIME)
# shows every fix's on the track.
SHOW_ALL = (0, -1)


def _interval_for(field: str, interval_ms: int | None) -> tuple[object | None, str | None]:
    """A legacy interval in ms as a track's interval for the field, or why it cannot be."""
    if interval_ms is None:
        return None, "its interval cannot be read"
    if interval_ms in SHOW_ALL:
        if field == "arrow_interval":
            return None, "it shows arrows at every fix, which Debrief v4 does not offer"
        return models.FixIntervalAllEnum.all, None
    if interval_ms % 1000 or not 1 <= interval_ms // 1000 <= 86_400:
        return None, (
            f"its interval of {interval_ms} ms is not a whole number of seconds from 1 s to 24 h"
        )
    return frequencies.duration_of(interval_ms // 1000), None


def _said(value: object) -> str:
    if isinstance(value, models.Duration):
        return f"every {frequencies.describe_interval(round(frequencies.seconds_of(value)))}"
    return "at every fix"


def _legacy_shown(times: list[int], freq_ms: int) -> list[bool]:
    """Which fixes legacy Debrief shows at a frequency (LightweightTrackWrapper.setFixes):
    from the track's start rounded up to a multiple of it (its start, where the track is
    no longer than one), the first fix at or after each multiple, unless it comes more
    than one interval after it."""
    start, end = times[0], times[-1]
    marker = -(-start // freq_ms) * freq_ms if start + freq_ms < end else start
    shown = []
    for t in times:
        show = False
        if t >= marker:
            show = t - marker <= freq_ms
            while marker <= t:
                marker += freq_ms
        shown.append(show)
    return shown


def _inferred(fixes: list[DpfFix], field: str) -> object | None | str:
    """The interval a track's fixes showing their label, symbol or arrow fall at, as legacy
    Debrief would have shown them: at every fix, or at the smallest interval the forms offer
    that shows exactly those. None where no fix shows one; "irregular" where they fall at
    none. Fixes with a label of their own are left out of it for labels: their labels are
    the fix's marks."""
    flag = FLAGS[field]
    kept = [
        f
        for f in fixes
        if field != "label_interval" or not (f.label and f.label.strip()) or _time_label(f)
    ]
    shown = [getattr(f, flag) for f in kept]
    if not any(shown):
        return None
    if all(shown) and len(kept) > 1:
        return "all" if field != "arrow_interval" else "irregular"
    times = [f.time_ms for f in fixes]
    every = [getattr(f, flag) for f in fixes]
    for seconds in frequencies.PRESETS:
        legacy = _legacy_shown(times, seconds * 1000)
        if all(a == b for a, b, f in zip(legacy, every, fixes, strict=True) if f in kept):
            return frequencies.duration_of(seconds)
    return "irregular"


def _force_shown(feature, fixes: list[DpfFix], field: str) -> tuple[object, int]:
    """Mark each fix that showed its label or symbol in the legacy plot as always showing
    it (show_label, show_symbol), joining any mark the fix already has: the feature so
    marked, and how many fixes were. Fixes with a label of their own are left out for
    labels, as in _inferred."""
    attr = "show_label" if field == "label_interval" else "show_symbol"
    flag = FLAGS[field]
    marks = {m.time: m for m in feature.properties.fix_marks or []}
    count = 0
    for fix in fixes:
        if not getattr(fix, flag):
            continue
        if field == "label_interval" and fix.label and fix.label.strip() and not _time_label(fix):
            continue
        at = format_utc(fix.time_ms)
        mark = marks.get(at)
        marks[at] = (
            mark.model_copy(update={attr: True})
            if mark
            else models.FixMark(time=at, **{attr: True})
        )
        count += 1
    props = feature.properties.model_copy(update={"fix_marks": [marks[t] for t in sorted(marks)]})
    return feature.model_copy(update={"properties": props}), count


def _track_frequencies(
    tracks: list[tuple[int, str, str, list[DpfFix]]],
    features: list,
    formatters: list[DpfFormatter],
) -> list[str]:
    """Set each imported track's label, symbol and arrow intervals from the plot's display
    rules, or from what its fixes showed; the notes saying what was and was not taken.
    tracks: (index in features, track name, the legacy track it came from, its fixes)."""
    notes: list[str] = []
    set_by: dict[tuple[int, str], str] = {}  # (feature index, field): the rule that set it
    for rule in formatters:
        label = f"Display rule {rule.name!r}" if rule.name else "An unnamed display rule"
        where = f" in layer {rule.layer!r}"
        field = FORMATTER_FIELDS.get(rule.style)
        if not rule.active:
            notes.append(f"{label}{where} not imported: it is not active.")
            continue
        if field is None:
            notes.append(
                f"{label}{where} not imported: it sets {rule.style!r}, not labels, "
                "symbols or arrows."
            )
            continue
        value, problem = _interval_for(field, rule.interval_ms)
        if problem:
            notes.append(f"{label}{where} not imported: {problem}.")
            continue
        targets = [
            t for t in tracks if not rule.track or rule.track in (t[1], t[2])
        ]  # by the legacy track's name, so each leg imported as a track of its own
        if not targets:
            notes.append(
                f"{label}{where} not imported: it applies to {rule.track!r}, "
                "and no track of that name was imported."
            )
            continue
        for index, name, _, _ in targets:
            earlier = set_by.get((index, field))
            if earlier:
                notes.append(
                    f"Track {name!r}: display rules {earlier!r} and {rule.name!r} both set "
                    f"its {NOUNS[field]}s; the later, {rule.name!r}, is used, as in legacy "
                    "Debrief."
                )
            set_by[(index, field)] = rule.name or "unnamed"
            props = features[index].properties.model_copy(update={field: value})
            features[index] = features[index].model_copy(update={"properties": props})
        who = (
            "every track" if not rule.track else ", ".join(repr(name) for _, name, _, _ in targets)
        )
        said = f"{NOUNS[field]}s {_said(value)} on {who}"
        notes.append(f"{label}{where} imported: {said}.")
        if not rule.regular:
            notes.append(
                f"{label}: legacy Debrief applied it from each track's first fix; Debrief "
                "v4 puts them on whole multiples of the interval (every 30 min is on the "
                "hour and half hour), as legacy Debrief's own track frequencies did."
            )
        if rule.symbology:
            notes.append(
                f"{label}: its symbology match {rule.symbology!r} is not imported "
                "(legacy Debrief did not apply it either); it applies to the tracks above."
            )
    # Fixes shown in the legacy plot, where no display rule says how often.
    for index, name, _, fixes in tracks:
        for field in frequencies.FIELDS:
            if (index, field) in set_by:
                continue
            found = _inferred(fixes, field)
            noun = NOUNS[field]
            if found is None:
                continue
            if found == "irregular":
                flag = FLAGS[field]
                count = sum(1 for f in fixes if getattr(f, flag))
                said = (
                    f"Track {name!r}: {count} of {_plural(len(fixes), 'fix', 'fixes')} "
                    f"showed {'its' if count == 1 else 'their'} {noun} in the legacy plot, "
                    "at no interval Debrief v4 offers; "
                )
                if field == "arrow_interval":
                    notes.append(f"{said}which {noun}s were shown is not imported.")
                    continue
                # Labels and symbols: those fixes always show theirs (product owner, 16 Oct 2026).
                features[index], forced = _force_shown(features[index], fixes, field)
                which = (
                    "that fix always shows its" if forced == 1 else "those fixes always show their"
                )
                notes.append(f"{said}{which} {noun}.")
                continue
            value = models.FixIntervalAllEnum.all if found == "all" else found
            props = features[index].properties.model_copy(update={field: value})
            features[index] = features[index].model_copy(update={"properties": props})
            notes.append(
                f"Track {name!r}: its fixes' {noun}s shown in the legacy plot fall "
                f"{_said(value)}, so its {noun}s are {_said(value)}."
            )
    return notes


# --- Annotations -------------------------------------------------------------------

# Legacy line styles (CanvasType) as v4 draws them; the dash patterns v4 does not
# have are drawn as the nearest it does, and said so.
LINE_STYLES = {0: "solid", 1: "dashed", 2: "dotted", 3: "dashed", 4: "dashed", 5: "dotted"}
LINE_STYLE_NAMES = {1: "long dashes", 3: "dot-dash", 4: "short dashes", 5: "unconnected points"}
LABEL_POSITIONS = {
    "Left": "left",
    "Right": "right",
    "Top": "above",
    "Bottom": "below",
    "Centre": "centre",
    "Center": "centre",
}
# Opacity of a legacy fill: semi-transparent, or solid. Legacy Debrief drew a
# semi-transparent fill with alpha 160 of 255 (PlainShape.TRANSPARENCY_SHADE).
SEMI_TRANSPARENT = round(160 / 255, 2)


def _line(coordinates: list[list[float]]) -> models.LineStringGeometry:
    return models.LineStringGeometry(type="LineString", coordinates=coordinates)


def _area(ring: list[list[float]]) -> models.PolygonGeometry:
    return models.PolygonGeometry(type="Polygon", coordinates=[ring])


def _curve(shape: DpfShape) -> tuple[models.PolygonGeometry, dict]:
    """A circle or an ellipse: its exact centre and size, and the polygon other tools see."""
    centre = Position(*shape.centre)
    extra: dict = {"centre": list(shape.centre)}
    if shape.kind == "circle":
        radius = round(shape.radius_m, 3)  # to the millimetre
        extra["radius"] = models.Length(value=radius, unit="m")
        ring = circle_ring(centre, length(radius))
    else:
        major, minor = sorted((round(shape.radius_m, 3), round(shape.minor_m, 3)), reverse=True)
        orientation = shape.orientation_deg % 360.0
        if shape.minor_m > shape.radius_m:  # legacy allowed it: the longer axis is the other way
            orientation = (orientation + 90.0) % 360.0
        extra["semi_major"] = models.Length(value=major, unit="m")
        extra["semi_minor"] = models.Length(value=minor, unit="m")
        extra["orientation"] = models.Angle(value=orientation, unit="deg")
        ring = ellipse_ring(centre, length(major), length(minor), angle(orientation))
    return _area([[p.longitude, p.latitude] for p in ring]), extra


def _geometry(shape: DpfShape):
    """The shape as v4 has it (its shape, GeoJSON geometry and own properties), or
    None with the reason it has none."""
    if shape.kind == "textlabel":
        point = models.PointGeometry(type="Point", coordinates=list(shape.points[0]))
        return ("label", point, {}), None
    if shape.kind in ("circle", "ellipse"):
        if not (shape.radius_m and shape.radius_m > 0) or (
            shape.kind == "ellipse" and not (shape.minor_m and shape.minor_m > 0)
        ):
            return None, "it has no size"
        geometry, extra = _curve(shape)
        return (shape.kind, geometry, extra), None
    if shape.kind == "rectangle":
        (west, north), (east, south) = shape.points
        ring = [[west, north], [east, north], [east, south], [west, south], [west, north]]
        return ("area", _area(ring), {}), None
    if shape.kind == "line":
        return ("line", _line([list(p) for p in shape.points]), {}), None
    if shape.kind == "vector":
        start = Position(*shape.points[0])
        end = destination(start, angle(shape.orientation_deg % 360), length(shape.radius_m))
        return ("line", _line([list(shape.points[0]), [end.longitude, end.latitude]]), {}), None
    if shape.kind == "polygon":
        points = [list(p) for p in shape.points]
        distinct = len(set(shape.points))
        if shape.closed and distinct >= 3:
            if points[0] != points[-1]:
                points.append(points[0])
            return ("area", _area(points), {}), None
        if distinct >= 2:
            return ("line", _line(points), {}), None
        return None, f"it has {_plural(distinct, 'distinct point')}, too few to draw"
    return None, "this shape is not yet supported"


def _appearance(shape: DpfShape, v4_shape: str) -> models.AnnotationAppearance | None:
    """How legacy Debrief drew it, as far as v4 can: colour, line, fill and label."""
    look: dict = {}
    if shape.colour:
        look["colour"] = shape.colour
    if v4_shape != "label":
        look["line_style"] = LINE_STYLES.get(shape.line_style or 0, "solid")
        if shape.line_thickness is not None:
            look["line_width"] = min(10, max(1, shape.line_thickness))
    if shape.filled and v4_shape in ("area", "circle", "ellipse"):
        look["fill_colour"] = shape.colour or ANNOTATION_COLOUR
        look["fill_opacity"] = SEMI_TRANSPARENT if shape.semi_transparent else 1.0
    if shape.font_size is not None:
        look["label_size"] = min(32, max(8, round(shape.font_size)))
    if not shape.label_visible:
        look["label_position"] = "none"
    elif shape.label_location in LABEL_POSITIONS:
        look["label_position"] = LABEL_POSITIONS[shape.label_location]
    return models.AnnotationAppearance(**look) if look else None


def _annotation(feature_id: str, shape: DpfShape, made) -> models.AnnotationFeature:
    v4_shape, geometry, extra = made
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
            shape=v4_shape,
            name=name,
            text=label if "\n" in label else None,
            time=time,
            time_range=time_range,
            appearance=_appearance(shape, v4_shape),
            **extra,
        ),
    )


def _look_notes(shapes: list[DpfShape]) -> list[str]:
    """What of the way annotations were drawn v4 does not keep: counted, with examples."""
    notes = []

    def named(items: list[DpfShape]) -> str:
        names = [repr(s.label.strip()) for s in items if s.label.strip()][:3]
        return f" (such as {', '.join(names)})" if names else ""

    symbols = [s for s in shapes if s.kind == "textlabel" and s.symbol]
    if symbols:
        kinds = ", ".join(repr(k) for k, _ in Counter(s.symbol for s in symbols).most_common(5))
        notes.append(
            f"{_plural(len(symbols), 'text label')} drawn with a symbol ({kinds}): "
            "v4 marks a label's position with a dot, so the symbols are not imported."
        )
    for style, words in sorted(LINE_STYLE_NAMES.items()):
        drawn = [s for s in shapes if s.line_style == style and s.kind != "textlabel"]
        if drawn:
            notes.append(
                f"{_plural(len(drawn), 'annotation')} drawn with {words}{named(drawn)}: "
                f"drawn {LINE_STYLES[style]}, the nearest line style v4 has."
            )
    fonts = [s for s in shapes if s.font_styled]
    if fonts:
        notes.append(
            f"{_plural(len(fonts), 'annotation')} with a font other than plain Arial"
            f"{named(fonts)}: the size is kept; the family, bold and italic are not."
        )
    coloured = [s for s in shapes if s.font_colour and s.font_colour != s.colour]
    if coloured:
        notes.append(
            f"{_plural(len(coloured), 'annotation')} with a label colour of its own"
            f"{named(coloured)}: v4 draws every label in the theme's text colour, so it "
            "stays readable on any map."
        )
    arrows = [s for s in shapes if s.arrow_at_end]
    if arrows:
        notes.append(
            f"{_plural(len(arrows), 'line')} with an arrowhead{named(arrows)}: "
            "drawn without it, since v4 lines have none yet."
        )
    return notes


# --- The plot ----------------------------------------------------------------------


def _sensors(
    parsed: DpfFile,
    imported_tracks: list[tuple[int, str, str, list[DpfFix]]],
    features: list,
    taken: set[str],
) -> tuple[list, list[str], int]:
    """Each track's sensors as sensor features with their cuts (CAP-22), and what the
    import says of them: what legacy kept that v4 does not draw, listed. A cut legacy's
    analyst resolved (HasAmbiguousBearing false, its discarded bearing kept as the
    ambiguous one, as ditchBearing left it) comes resolved, keeping its bearing."""
    parts: dict[str, list[tuple[str, list[DpfFix]]]] = {}
    for index, _, legacy_name, fixes in imported_tracks:
        parts.setdefault(legacy_name, []).append((features[index].id, fixes))
    names = {features[i].id: name for i, name, _, _ in imported_tracks}
    colours = {f.id: f.properties.style.colour for f in features if f.properties.kind == "track"}
    read: list[ReadSensor] = []
    notes: list[str] = []
    for track in parsed.tracks:
        for sensor in track.sensors:
            label = f"Track {track.name!r}: sensor {sensor.name!r}"
            usable = [c for c in sensor.contacts if c.bearing is not None]
            if not parts.get(track.name):
                if sensor.contacts:
                    notes.append(
                        f"{label} ({_plural(len(sensor.contacts), 'cut')}) not imported: "
                        "the track itself was not."
                    )
                continue
            if not usable:
                notes.append(f"{label} not imported: none of its cuts gives a bearing.")
                continue
            # A track whose legs overlap is imported a track a leg: the sensor goes with the
            # part its first cut falls in.
            first = usable[0].time_ms
            host = next(
                (i for i, fx in parts[track.name] if fx[0].time_ms <= first <= fx[-1].time_ms),
                parts[track.name][0][0],
            )
            colour = sensor.colour or colours.get(host) or DEFAULT_COLOUR
            span = next(fixes for i, fixes in parts[track.name] if i == host)
            outside = sum(1 for c in usable if not span[0].time_ms <= c.time_ms <= span[-1].time_ms)
            if outside:
                notes.append(
                    f"{label}: {_plural(outside, 'cut')} outside the track's fixes: kept, but "
                    "not drawn, as legacy Debrief drew none there."
                )
            read.append(
                ReadSensor(
                    name=sensor.name,
                    host_track_id=host,
                    colour=colour,
                    hidden=not sensor.visible,
                    cuts=[
                        ReadCut(
                            time_ms=c.time_ms,
                            bearing=c.bearing,
                            ambiguous=c.ambiguous,
                            resolved=None if c.has_ambiguous or c.ambiguous is None else "bearing",
                            range_m=c.range_m,
                            origin=c.origin,
                            label=c.label,
                            comment=c.comment,
                            colour=c.colour,
                            hidden=not c.visible,
                        )
                        for c in usable
                    ],
                )
            )
            notes += _sensor_notes(label, sensor, usable)
    if not read:
        return [], notes, 0
    built = plot_sensors.build(read, taken, names)
    taken.update(f.id for f in built)
    notes.insert(0, sensors_note(read, names))
    return built, notes, sum(len(s.cuts) for s in read)


def _sensor_notes(label: str, sensor, usable: list) -> list[str]:
    """What a sensor in a legacy plot had that v4 does not hold or draw, said."""
    notes = []
    dropped = len(sensor.contacts) - len(usable)
    if dropped:
        notes.append(f"{label}: {_plural(dropped, 'cut')} giving no bearing not imported.")
    frequencies = sum(1 for c in sensor.contacts if c.frequency is not None)
    if frequencies or sensor.base_frequency:
        said = f"{_plural(frequencies, 'cut')} gave a frequency" if frequencies else ""
        base = f"its base frequency {sensor.base_frequency:g} Hz" if sensor.base_frequency else ""
        notes.append(
            f"{label}: {' and '.join(s for s in (said, base) if s)}: not imported. Frequency "
            "and acoustic analysis stay in the acoustic replay application (CAP-22, EXT-03)."
        )
    measured = sensor.array_mode not in (None, "Plain", "Worm in hole")
    if sensor.offset_m or measured:
        parts = []
        if sensor.offset_m:
            parts.append(f"its array offset of {sensor.offset_m:,.0f} m")
        if measured:
            parts.append(f"its array centre from the measured data {sensor.array_mode!r}")
        notes.append(
            f"{label}: {' and '.join(parts)} not imported: its cuts are drawn from the track's "
            "position."
        )
    shown = sum(1 for c in usable if c.label_showing)
    styled = Counter(
        c.line_style.replace("_", " ").lower()
        for c in usable
        if c.line_style and c.line_style.upper() != "SOLID"
    )
    looks = []
    if shown:
        looks.append(f"{_plural(shown, 'label')} shown on the map")
    if styled:
        looks.append("line styles " + ", ".join(f"{s} ({n})" for s, n in styled.most_common()))
    if sensor.line_thickness and sensor.line_thickness > 1:
        looks.append(f"line thickness {sensor.line_thickness}")
    if looks:
        notes.append(
            f"{label}: how its cuts were drawn not imported ({'; '.join(looks)}): drawn solid, "
            "with labels and comments when pointed at."
        )
    hidden = sum(1 for c in usable if not c.visible)
    if hidden:
        notes.append(f"{label}: {_plural(hidden, 'cut')} hidden in the legacy plot, hidden here.")
    placeholders = sum(1 for c in usable if c.zero_twin)
    if placeholders:
        notes.append(
            f"{label}: {_plural(placeholders, 'cut')} gave an ambiguous bearing of 0.000 and "
            f"{'was' if placeholders == 1 else 'were'} not ambiguous: older legacy Debrief's "
            "placeholder, read as no ambiguous bearing."
        )
    resolved = sum(1 for c in usable if c.ambiguous is not None and not c.has_ambiguous)
    if resolved:
        notes.append(
            f"{label}: {_plural(resolved, 'cut')} resolved in the legacy plot "
            f"come{'s' if resolved == 1 else ''} resolved, "
            "keeping the bearing legacy Debrief kept; Ambiguous again brings the other back."
        )
    return notes


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
    imported_tracks: list[tuple[int, str, str, list[DpfFix]]] = []
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
        # How each is plotted, as the legacy plot says (no need to ask): by dead reckoning
        # where every leg of it is (PlotRelative), else over the ground.
        legs_dr = [leg.dead_reckoned and leg.kind not in TMA_LEGS for leg in track.legs]
        modes = (
            ["dr" if dr else "otg" for dr in legs_dr]
            if len(parts) == len(track.legs) and len(parts) > 1
            else ["dr" if legs_dr and all(legs_dr) else "otg"]
        )
        if len(modes) == 1 and any(legs_dr) and not all(legs_dr):
            notes.append(
                f"Track {track.name!r} has legs plotted by dead reckoning and legs plotted over "
                "the ground; it is imported as legacy Debrief plotted each, as one track plotted "
                "over the ground."
            )
        imported = False
        for (name, fixes), mode in zip(parts, modes, strict=True):
            if len(fixes) < 2:
                notes.append(
                    f"Track {name!r} has {_plural(len(fixes), 'fix', 'fixes')}, "
                    "so it was not imported as a track."
                )
                continue
            fixes = _in_time_order(fixes)
            marks, mark_notes = _fix_marks(name, track, fixes)
            notes += mark_notes
            feature_id = _unique_id("track", name, taken)
            imported_tracks.append((len(features), name, track.name, fixes))
            features.append(_track_feature(feature_id, name, track, fixes, marks, mode))
            report.tracks.append(name)
            report.fixes += len(fixes)
            hidden += not track.visible
            imported = True
            duplicates = _duplicate_times_note(name, fixes)
            if duplicates:
                notes.append(duplicates)
        notes += _track_notes(track, joined=imported and len(parts) == 1)
    # How often each is labelled, marked and arrowed: the plot's display rules, or its fixes.
    notes += _track_frequencies(imported_tracks, features, parsed.formatters)
    # Sensors and their cuts, on the tracks that carry them (CAP-22).
    added, sensor_notes, report.sensor_cuts = _sensors(parsed, imported_tracks, features, taken)
    features += added
    notes += sensor_notes

    # Annotations, grouped by layer.
    members: dict[str, list[str]] = {}
    imported: list[DpfShape] = []
    for shape in parsed.shapes:
        made, reason = _geometry(shape)
        if made is None:
            entity = _entity(shape.kind, shape.label.strip() or None, shape.layer)
            notes.append(f"{entity} not imported: {reason}.")
            continue
        feature_id = _unique_id("annotation", shape.label or shape.kind, taken)
        features.append(_annotation(feature_id, shape, made))
        members.setdefault(shape.layer, []).append(feature_id)
        report.annotations += 1
        hidden += not shape.visible
        imported.append(shape)
    notes += _look_notes(imported)

    # Narrative: entries with their source (the track named), type and text (CAP-20).
    by_name = narrative.track_names(
        models.DebriefFeatureCollection(
            type="FeatureCollection",
            schema_version=SCHEMA_VERSION,
            features=features,
            provenance=[],
        )
    )
    empty = 0
    ids = iter(narrative.new_ids(taken, len(parsed.narrative)))
    for entry in parsed.narrative:
        text = entry.text.strip()
        if not text:
            empty += 1
            continue
        feature_id = next(ids)
        taken.add(feature_id)
        who = " ".join((entry.track or entry.narrative).split()) or entry.narrative
        features.append(
            models.NarrativeFeature(
                type="Feature",
                id=feature_id,
                geometry=None,
                properties=models.NarrativeProperties(
                    kind="narrative",
                    time=format_utc(entry.time_ms),
                    source=who,
                    entry_type=" ".join((entry.entry_type or "").split()) or None,
                    text=text,
                    track_id=narrative.track_for(who, by_name),
                ),
            )
        )
        members.setdefault(entry.narrative, []).append(feature_id)
        report.narrative_entries += 1
    if empty:
        notes.append(
            f"{_plural(empty, 'narrative entry', 'narrative entries')} with no text not imported."
        )

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
        elif any(rule.layer == layer.name for rule in parsed.formatters):
            kept = "its display rules are said above"
        else:
            kept = "it holds nothing that was imported"
        notes.append(
            f"Layer {layer.name!r} ({layer.kind}, {shown}): its settings are not imported, "
            f"since v4 has no layers yet; {kept}."
        )

    # Display settings, which v4 does not yet hold.
    display = [
        "where fix labels go",
        "track symbols, fonts and line styles",
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
