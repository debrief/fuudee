"""Reading legacy Debrief plot files (.dpf): tracks, annotations and narrative (EXT-14).

A .dpf file is XML written by legacy Debrief's DebriefXMLReaderWriter. Its
root is a ``plot`` holding a ``session``; the session holds ``layers`` (the
content) and view settings (``gui``, ``projection``). This reader turns the
content into a small intermediate model, the same way the REP reader does,
and lists everything it does not read, so the import can report it (EXT-15).

Ported from the legacy SAX handlers, which this module cites:

- ``SessionHandler``, ``DebriefLayersHandler`` and ``DebriefLayerHandler``:
  the session and its layers.
- ``TrackHandler``, ``TrackSegmentHandler``, ``CoreTrackSegmentHandler``,
  ``RelativeTMASegmentHandler``, ``AbsoluteTMASegmentHandler``,
  ``DynamicInfillSegmentHandler`` and ``FixHandler``: tracks, their legs and
  fixes.
- ``SensorHandler``, ``TMAHandler`` and ``DynamicTrackShapeSetHandler``: what
  a track carries besides its fixes. These are counted, not read.
- ``NarrativeHandler``: narrative entries.
- ``ShapeHandler``, ``LabelHandler``, ``CircleHandler``, ``RectangleHandler``,
  ``LineHandler``, ``PolygonHandler``, ``EllipseHandler`` and
  ``VectorHandler``: annotations.
- ``LocationHandler`` and ``ShortLocationHandler``, ``LongLocationHandler``,
  ``ColourHandler`` with ``DebriefColors``, ``WorldDistanceHandler`` with
  ``WorldDistance``, ``TimeRangeHandler``, ``MWCXMLReader.readThisDouble``
  and ``MWCXMLReader.fromXML``, and ``DebriefFormatDateTime.parseThis``:
  the values inside them.

As in legacy Debrief, an element that cannot be read is skipped and the
problem reported with its line number; the rest of the file still reads.

The XML is read with expat directly, with document type declarations and
entities refused, so a hostile file cannot expand entities or reach outside
itself. Legacy Debrief never writes either.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from xml.parsers import expat

from debrief_io.rep import RepError, parse_time

# DebriefColors, by the names ColourHandler writes.
NAMED_COLOURS = {
    "RED": "#e01c3e",
    "BLUE": "#0064bd",
    "GREEN": "#00800b",
    "YELLOW": "#ffd700",
    "MAGENTA": "#ff00ff",
    "PURPLE": "#a100e6",
    "ORANGE": "#ff9600",
    "BROWN": "#996600",
    "CYAN": "#00ffff",
    "LIGHT_GREEN": "#58ff00",
    "GOLD": "#e6c814",
    "PINK": "#ff4dff",
    "LIGHT_GREY": "#ededed",
    "GREY": "#808080",
    "DARK_GREY": "#c0c0c0",
    "WHITE": "#fffffe",
    "BLACK": "#1a1a1a",
    "DARK_BLUE": "#6595cc",
    "MEDIUM_BLUE": "#a5bfdd",
}

# WorldDistance units to metres. Legacy Debrief takes a nautical mile as one
# minute of arc, so a degree is 60 nautical miles.
METRES_PER = {
    "m": 1.0,
    "yds": 1852.0 / 2025.371828,
    "kyds": 1852.0 / 2.025371828,
    "km": 1000.0,
    "nm": 1852.0,
    "minutes": 1852.0,
    "degs": 60 * 1852.0,
    "ft": 1852.0 / 6076.11548,
}

# DebriefFormatDateTime writes an unset time as this; it reads back as no time.
NULL_DATES = {"691231 235959.999", "691231 235959"}

# MWCXMLReader.readThisDouble: a decimal point or comma, but not "1,234",
# which could be a thousands separator.
_NUMBER = re.compile(r"[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?")
_AMBIGUOUS_COMMA = re.compile(r"[+-]?\d{1,3},\d{3}")


UNKNOWN = "not a part of a plot this importer knows"


class DpfError(ValueError):
    """A plot file, or an element in it, could not be read."""


# --- The XML tree -------------------------------------------------------------


@dataclass
class Node:
    """An element: its local name (namespace removed), attributes, children and line."""

    tag: str
    attrs: dict[str, str]
    line: int
    children: list[Node] = field(default_factory=list)

    def child(self, tag: str) -> Node | None:
        return next((c for c in self.children if c.tag == tag), None)

    def name(self) -> str | None:
        """What legacy Debrief calls this element, from whichever attribute holds it."""
        for key in ("Name", "NAME", "Label", "LayerName"):
            if self.attrs.get(key):
                return from_xml(self.attrs[key])
        return None


def _refuse(*_args: object) -> None:
    raise DpfError("the file declares a document type or entities, which plot files never do")


def parse_xml(data: bytes, shallow: frozenset[str] = frozenset()) -> Node:
    """Read XML into a tree of Nodes, refusing document types and entities.

    An element named in ``shallow`` keeps its children only as bare leaves (tag
    and line), and nothing below them: the importer only counts those, so a
    sensor's thousands of cuts cost one small node each, not a whole subtree.
    """
    parser = expat.ParserCreate(namespace_separator="}")
    stack: list[Node | None] = []  # None: inside a subtree that is not kept
    root: list[Node] = []

    def start(tag: str, attrs: dict[str, str]) -> None:
        parent = stack[-1] if stack else None
        if stack and parent is None:
            stack.append(None)
            return
        local = tag.rpartition("}")[2]
        if parent is not None and parent.tag in shallow:
            parent.children.append(Node(local, {}, parser.CurrentLineNumber))
            stack.append(None)
            return
        node = Node(local, attrs, parser.CurrentLineNumber)
        if parent is not None:
            parent.children.append(node)
        else:
            root.append(node)
        stack.append(node)

    def end(_tag: str) -> None:
        stack.pop()

    parser.StartElementHandler = start
    parser.EndElementHandler = end
    parser.StartDoctypeDeclHandler = _refuse
    parser.EntityDeclHandler = _refuse
    parser.UnparsedEntityDeclHandler = _refuse
    parser.ExternalEntityRefHandler = _refuse
    try:
        parser.Parse(data, True)
    except expat.ExpatError as error:
        raise DpfError(f"the file is not well-formed XML: {error}") from None
    if not root:
        raise DpfError("the file holds no XML elements")
    return root[0]


# --- Values ---------------------------------------------------------------------


def from_xml(text: str) -> str:
    """MWCXMLReader.fromXML: legacy writes a line break in a label as the two characters \\n."""
    return text.replace("\\n", "\n")


def read_number(text: str | None, what: str) -> float:
    """MWCXMLReader.readThisDouble: a decimal point or a decimal comma.

    NaN and infinities are refused, including a number too large for a
    double, such as ``1e999``, which Python would read as infinity.
    """
    if text is None:
        raise DpfError(f"missing {what}")
    trimmed = text.strip()
    if not _NUMBER.fullmatch(trimmed):
        raise DpfError(f"{text!r} is not a number ({what})")
    if _AMBIGUOUS_COMMA.fullmatch(trimmed):
        raise DpfError(f"{text!r} is ambiguous: a thousands separator or a decimal comma ({what})")
    return finite(float(trimmed.replace(",", ".")), what)


def finite(value: float, what: str) -> float:
    """The value, or DpfError if it is not a finite number."""
    if not math.isfinite(value):
        raise DpfError(f"{what} is too large to be a number")
    return value


def read_bool(text: str | None, default: bool) -> bool:
    """Java's Boolean.valueOf: "true" in any case is true; anything else is false."""
    return default if text is None else text.strip().lower() == "true"


def read_time(text: str) -> tuple[int, bool] | None:
    """DebriefFormatDateTime.parseThis: epoch milliseconds and whether finer digits were cut.

    "yyMMdd HHmmss[.ffffff]", or a four-digit year. Returns None for the
    legacy null date. Fractions finer than milliseconds are truncated (SUB-01).
    """
    stripped = text.strip()
    if stripped in NULL_DATES:
        return None
    parts = stripped.split()
    if len(parts) != 2:
        raise DpfError(f"{text!r} is not a date and time")
    try:
        return parse_time(parts[0], parts[1])
    except RepError as error:
        raise DpfError(str(error)) from None


def read_colour(node: Node | None) -> str | None:
    """ColourHandler: a DebriefColors name, or "custom" with red, green and blue values."""
    if node is None:
        return None
    named = NAMED_COLOURS.get(node.attrs.get("Value", ""))
    if named:
        return named
    try:
        rgb = [int(node.attrs.get(key, "0")) for key in ("CustomRed", "CustomGreen", "CustomBlue")]
    except ValueError:
        raise DpfError("colour values must be whole numbers") from None
    if any(not 0 <= v <= 255 for v in rgb):
        raise DpfError("colour values must be 0 to 255")
    return "#{:02x}{:02x}{:02x}".format(*rgb)


@dataclass(frozen=True)
class Location:
    latitude: float
    longitude: float
    depth_m: float
    # The depth as written, when it could not be read and zero was used instead.
    bad_depth: str | None = None


def read_location(node: Node | None) -> Location | None:
    """LocationHandler: a wrapper element holding a shortLocation or longLocation."""
    if node is None:
        return None
    short = node.child("shortLocation")
    if short is not None:
        a = short.attrs
        latitude = read_number(a.get("Lat"), "latitude")
        longitude = read_number(a.get("Long"), "longitude")
    else:
        long_ = node.child("longLocation")
        if long_ is None:
            raise DpfError(f"{node.tag} holds no location")
        a = long_.attrs
        latitude, longitude = _long_location(a)
    bad_depth = None
    try:
        depth = read_number(a.get("Depth", "0"), "depth")
    except DpfError:
        # As ShortLocationHandler: an unreadable depth reads as zero, and is reported.
        depth, bad_depth = 0.0, a.get("Depth", "")
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise DpfError(f"position {latitude:.4f}, {longitude:.4f} is out of range")
    return Location(latitude, longitude, depth, bad_depth)


def _long_location(a: dict[str, str]) -> tuple[float, float]:
    """LongLocationHandler: degrees, minutes, seconds and hemisphere for each axis."""

    def axis(prefix: str, negative: str) -> float:
        degrees = read_number(a.get(f"{prefix}Deg", "0"), "degrees")
        minutes = read_number(a.get(f"{prefix}Min", "0"), "minutes")
        seconds = read_number(a.get(f"{prefix}Sec", "0"), "seconds")
        if seconds == 0:  # as legacy: decimal minutes carry the seconds
            seconds = (minutes - int(minutes)) * 60.0
        value = degrees + int(minutes) / 60.0 + seconds / 3600.0
        return -value if a.get(f"{prefix}Hem", "").upper().startswith(negative) else value

    return axis("Lat", "S"), axis("Long", "W")


def read_distance_m(node: Node | None) -> float | None:
    """WorldDistanceHandler: a value and its units, in metres. Units default to nautical miles."""
    if node is None:
        return None
    units = node.attrs.get("Units", "nm")
    if units not in METRES_PER:
        raise DpfError(f"{units!r} is not a distance unit")
    return finite(read_number(node.attrs.get("Value"), node.tag) * METRES_PER[units], node.tag)


def read_time_range(node: Node | None) -> tuple[int | None, int | None, int]:
    """TimeRangeHandler: start and end in epoch milliseconds, and how many were truncated."""
    if node is None:
        return None, None, 0
    start = read_time(node.attrs["Start"]) if "Start" in node.attrs else None
    end = read_time(node.attrs["End"]) if "End" in node.attrs else None
    truncated = sum(1 for t in (start, end) if t and t[1])
    return (start[0] if start else None), (end[0] if end else None), truncated


# --- The intermediate model ----------------------------------------------------


@dataclass(frozen=True)
class DpfFix:
    time_ms: int
    latitude: float
    longitude: float
    depth_m: float
    course_deg: float
    speed_kn: float
    label: str | None = None
    comment: str | None = None
    colour: str | None = None
    visible: bool = True
    label_showing: bool = False
    line: int = 0
    # The depth as written, when it could not be read and zero was used instead.
    bad_depth: str | None = None


@dataclass
class DpfLeg:
    """A track segment: an ordinary leg, a TMA solution leg or a dynamic infill."""

    kind: str  # the element name, such as "TrackSegment"
    name: str | None
    fixes: list[DpfFix] = field(default_factory=list)


@dataclass
class DpfCarried:
    """Something a track carries that is not imported: a sensor, TMA solutions, dynamic shapes."""

    kind: str
    name: str | None
    count: int  # its items: bearing cuts, solutions or shapes


@dataclass
class DpfTrack:
    name: str
    colour: str | None
    visible: bool
    legs: list[DpfLeg] = field(default_factory=list)
    carried: list[DpfCarried] = field(default_factory=list)


@dataclass
class DpfShape:
    """An annotation: a label, or a shape with its legacy geometry.

    ``points`` holds the corners or nodes, longitude first, for rectangles,
    lines, polygons and vectors; ``centre`` and the distances hold circles
    and ellipses.
    """

    kind: str  # the element name, such as "circle"
    layer: str
    label: str
    colour: str | None
    visible: bool
    time_ms: int | None = None
    end_ms: int | None = None
    points: list[tuple[float, float]] = field(default_factory=list)
    closed: bool = False
    centre: tuple[float, float] | None = None
    radius_m: float | None = None
    minor_m: float | None = None
    orientation_deg: float = 0.0
    # How it is drawn (ShapeHandler, LabelHandler, CanvasType's line styles).
    line_style: int | None = None  # CanvasType: 0 solid, 1 long dashes, 2 dotted,
    #                                3 dot-dash, 4 short dashes, 5 unconnected
    line_thickness: int | None = None
    filled: bool = False
    semi_transparent: bool = False
    label_location: str | None = None  # Left, Right, Top, Bottom or Centre
    label_visible: bool = True
    font_size: float | None = None
    font_styled: bool = False  # a family other than Arial, or bold or italic
    font_colour: str | None = None
    symbol: str | None = None  # a text label's symbol, such as "Carrier"
    arrow_at_end: bool = False


@dataclass(frozen=True)
class DpfNarrativeEntry:
    time_ms: int
    track: str
    entry_type: str | None
    text: str
    narrative: str


@dataclass
class DpfLayer:
    """A legacy layer: its name and settings. Its content is read into the lists of DpfFile."""

    kind: str
    name: str
    visible: bool


@dataclass(frozen=True)
class DpfSkipped:
    """Something the reader understood but does not import, named for the analyst."""

    element: str
    name: str | None
    layer: str | None
    reason: str


@dataclass
class DpfFile:
    tracks: list[DpfTrack] = field(default_factory=list)
    shapes: list[DpfShape] = field(default_factory=list)
    narrative: list[DpfNarrativeEntry] = field(default_factory=list)
    layers: list[DpfLayer] = field(default_factory=list)
    skipped: list[DpfSkipped] = field(default_factory=list)
    # (line number, problem) for elements that could not be read.
    errors: list[tuple[int, str]] = field(default_factory=list)
    # (line number, problem) for elements read in part, saying what was used instead.
    warnings: list[tuple[int, str]] = field(default_factory=list)
    # Times with more than millisecond precision, truncated (SUB-01).
    truncated_times: int = 0
    # Settings of the legacy view: gui (tote, stepper, background) and projection.
    view_settings: list[str] = field(default_factory=list)
    # The application version that saved the file, from the details element.
    saved_by: str | None = None


# --- Reading ------------------------------------------------------------------

# Chart furniture that belongs to the legacy view, not the analysis.
CHART_FEATURES = {
    "grid": "grid",
    "Grid4W": "4W grid",
    "LocalGrid": "local grid",
    "scale": "scale",
    "coastline": "coastline",
    "vpf_database": "VPF chart",
    "ChartFolio": "chart library",
    "timeDisplay": "time display",
    "ETOPO": "bathymetry",
    "S57": "S-57 chart",
}

SHAPES = {"textlabel", "circle", "rectangle", "line", "polygon", "ellipse", "vector"}

SHAPE_REASONS = {
    "Arc": "arcs are not yet supported",
    "wheel": "wheels (range rings with spokes) are not yet supported",
    "range_rings": "range rings are not yet supported",
    "furthest_on_circle": "furthest-on circles are not yet supported",
}

# A track's display settings: its colour is read, the rest reported together.
TRACK_DISPLAY = {
    "colour",
    "SymbolColor",
    "font",
    "SYMBOL_LENGTH",
    "SYMBOL_WIDTH",
    "CustomTrailLength",
}

TRACK_LEGS = {"TrackSegment", "RelativeTMASegment", "AbsoluteTMASegment", "DynamicInfillSegment"}

# What a TMA leg holds besides its fixes: the solution (CoreTMASegmentHandler,
# RelativeTMASegmentHandler, AbsoluteTMASegmentHandler), reported with the leg.
TMA_SOLUTION = {"Speed", "Offset", "Origin"}
TMA_LEGS = {"RelativeTMASegment", "AbsoluteTMASegment"}

# Elements the importer only names or counts the children of, never reads
# inside: their subtrees are not kept in memory (see parse_xml).
SHALLOW = frozenset(
    {"sensor", "tma", "DynamicShapeSet", "composite_track", "satc_solution", "CoreFormatter"}
    | set(CHART_FEATURES)
    | set(SHAPE_REASONS)
)


def parse_dpf(data: bytes) -> DpfFile:
    """Read a plot file. Raises DpfError only when the file as a whole cannot be read."""
    root = parse_xml(data, SHALLOW)
    if root.tag != "plot":
        raise DpfError(f"the file's top element is {root.tag!r}, not a Debrief plot")
    result = DpfFile()
    details = root.child("details")
    if details is not None:
        result.saved_by = details.attrs.get("Text")
    session = root.child("session")
    if session is None:
        raise DpfError("the plot holds no session")
    for node in session.children:
        if node.tag == "layers":
            for layer in node.children:
                _read_top_layer(layer, result)
        elif node.tag == "gui":
            result.view_settings += _gui_settings(node)
        elif node.tag == "projection":
            result.view_settings.append("the map projection and area shown")
        else:
            result.skipped.append(DpfSkipped(node.tag, node.name(), None, UNKNOWN))
    for other in root.children:
        if other.tag not in ("details", "session"):
            result.skipped.append(DpfSkipped(other.tag, other.name(), None, UNKNOWN))
    return result


def _gui_settings(gui: Node) -> list[str]:
    """GUIHandler: the tote's primary and secondary tracks, the time stepper, the background."""
    settings = []
    for node in gui.children:
        if node.tag == "tote":
            names = [c.name() for c in node.children if c.name()]
            settings.append(
                "the primary and secondary tracks" + (f" ({', '.join(names)})" if names else "")
            )
        elif node.tag == "component":
            settings.append(f"the {node.attrs.get('Type', 'view').lower()} settings")
        elif node.tag == "Background":
            settings.append("the background colour")
        else:
            settings.append(f"the {node.tag} settings")
    return settings


def _read_top_layer(node: Node, result: DpfFile) -> None:
    """DebriefLayersHandler: each child of layers is a layer, a track or a narrative."""
    try:
        if node.tag == "track":
            _read_track(node, result)
        elif node.tag == "narrative":
            _read_narrative(node, result)
        elif node.tag in ("layer", "dynamicShapeLayer", "dynamicLayer"):
            _read_layer(node, result)
        elif node.tag == "composite_track":
            legs = sum(1 for c in node.children if c.tag == "planning_segment")
            result.skipped.append(
                DpfSkipped(
                    node.tag,
                    node.name(),
                    None,
                    f"a planned track of {legs} leg{'s' if legs != 1 else ''}; "
                    "planned tracks are not yet supported",
                )
            )
        elif node.tag == "externalDatafile":
            kind = node.attrs.get("DataType", "external")
            result.skipped.append(
                DpfSkipped(
                    node.tag,
                    node.name(),
                    None,
                    f"a {kind} file outside the plot; background imagery is not yet supported",
                )
            )
        elif node.tag == "satc_solution":
            result.skipped.append(
                DpfSkipped(
                    node.tag, node.name(), None, "a SATC solution; SATC is not yet supported"
                )
            )
        elif node.tag in CHART_FEATURES:
            result.skipped.append(_chart_feature(node, None))
        else:
            result.skipped.append(DpfSkipped(node.tag, node.name(), None, UNKNOWN))
    except DpfError as error:
        result.errors.append((node.line, f"{node.tag} {node.name() or ''}: {error}".strip()))


def _chart_feature(node: Node, layer: str | None) -> DpfSkipped:
    return DpfSkipped(
        node.tag,
        node.name(),
        layer,
        f"a {CHART_FEATURES[node.tag]}, part of the legacy view; "
        "chart features are not yet supported",
    )


def _read_layer(node: Node, result: DpfFile) -> None:
    """DebriefLayerHandler: a named layer of annotations and chart features."""
    name = node.name() or "Unnamed layer"
    result.layers.append(DpfLayer(node.tag, name, read_bool(node.attrs.get("Visible"), True)))
    for item in node.children:
        try:
            if item.tag in SHAPES:
                result.shapes.append(_read_shape(item, name, result))
            elif item.tag in CHART_FEATURES:
                result.skipped.append(_chart_feature(item, name))
            elif item.tag in SHAPE_REASONS:
                result.skipped.append(
                    DpfSkipped(item.tag, item.name(), name, SHAPE_REASONS[item.tag])
                )
            elif item.tag == "CoreFormatter":
                result.skipped.append(
                    DpfSkipped(
                        item.tag,
                        item.name(),
                        name,
                        "a display rule for tracks; display rules are not yet supported",
                    )
                )
            else:
                result.skipped.append(DpfSkipped(item.tag, item.name(), name, UNKNOWN))
        except DpfError as error:
            result.errors.append((item.line, f"{item.tag} {item.name() or ''}: {error}".strip()))


def _read_track(node: Node, result: DpfFile) -> None:
    """TrackHandler: a track's name, colour, legs and fixes, and what it carries."""
    name = node.name() or "Unnamed track"
    track = DpfTrack(
        name=name,
        colour=_colour_or_default(node.child("colour"), f"track {name!r}", result),
        visible=read_bool(node.attrs.get("Visible"), True),
    )
    loose = DpfLeg("fix", None)  # fixes held directly by the track
    for child in node.children:
        if child.tag in TRACK_LEGS:
            leg = DpfLeg(child.tag, child.attrs.get("Name"))
            leg.fixes = _read_fixes(child, track.name, result)
            track.legs.append(leg)
        elif child.tag == "SegmentList":
            for inner in child.children:
                if inner.tag in TRACK_LEGS:
                    leg = DpfLeg(inner.tag, inner.attrs.get("Name"))
                    leg.fixes = _read_fixes(inner, track.name, result)
                    track.legs.append(leg)
                else:
                    result.skipped.append(
                        DpfSkipped(inner.tag, inner.name(), None, f"in track {name!r}: {UNKNOWN}")
                    )
        elif child.tag == "fix":
            fix = _read_fix_or_report(child, track.name, result)
            if fix:
                loose.fixes.append(fix)
        elif child.tag == "sensor":
            contacts = sum(1 for c in child.children if c.tag == "sensor_contact")
            track.carried.append(DpfCarried(child.tag, child.name(), contacts))
        elif child.tag == "tma":
            solutions = sum(1 for c in child.children if c.tag == "tma_solution")
            track.carried.append(DpfCarried(child.tag, child.name(), solutions))
        elif child.tag == "DynamicShapeSet":
            shapes = len(child.children)
            track.carried.append(DpfCarried(child.tag, child.name(), shapes))
        elif child.tag in TRACK_DISPLAY:
            continue  # display settings, reported with the others
        else:
            track.carried.append(DpfCarried(child.tag, child.name(), len(child.children)))
    if loose.fixes:
        track.legs.insert(0, loose)
    result.tracks.append(track)


def _colour_or_default(node: Node | None, what: str, result: DpfFile) -> str | None:
    """A colour, or None (the default colour) with a warning when it cannot be read."""
    try:
        return read_colour(node)
    except DpfError as error:
        result.warnings.append((node.line, f"the colour of {what}: {error}; the default is used"))
        return None


def _read_fixes(leg: Node, track: str, result: DpfFile) -> list[DpfFix]:
    """CoreTrackSegmentHandler: the fixes of one leg; anything else is reported."""
    fixes = []
    for node in leg.children:
        if node.tag == "fix":
            fix = _read_fix_or_report(node, track, result)
            if fix:
                fixes.append(fix)
        elif not (leg.tag in TMA_LEGS and node.tag in TMA_SOLUTION):
            leg_name = leg.attrs.get("Name")
            where = f"in track {track!r}" + (f", leg {leg_name!r}" if leg_name else "")
            result.skipped.append(DpfSkipped(node.tag, node.name(), None, f"{where}: {UNKNOWN}"))
    return fixes


def _read_fix_or_report(node: Node, track: str, result: DpfFile) -> DpfFix | None:
    try:
        fix, truncated = read_fix(node)
    except DpfError as error:
        result.errors.append((node.line, f"a fix of track {track!r}: {error}"))
        return None
    result.truncated_times += truncated
    return fix


def read_fix(node: Node) -> tuple[DpfFix, bool]:
    """FixHandler: time, position, course and speed; and whether the time was truncated.

    Course is true degrees, a negative course brought into 0 to 360 as legacy
    does; speed is knots. A fix without a time or position is an error, as in
    legacy, which skips it.
    """
    a = node.attrs
    dtg = a.get("Dtg")
    if dtg is None:
        raise DpfError("no time")
    when = read_time(dtg)
    if when is None:
        raise DpfError("the time is the legacy null date")
    location = read_location(node.child("centre"))
    if location is None:
        raise DpfError("no position")
    course = read_number(a.get("Course", "0"), "course")
    if course < 0:
        course += 360
    speed = read_number(a.get("Speed", "0"), "speed")
    try:
        colour = read_colour(node.child("colour"))
    except DpfError:
        colour = None  # a fix's own colour that cannot be read: the track's is used
    fix = DpfFix(
        time_ms=when[0],
        latitude=location.latitude,
        longitude=location.longitude,
        depth_m=location.depth_m,
        course_deg=course,
        speed_kn=speed,
        label=from_xml(a["Label"]) if a.get("Label") else None,
        comment=from_xml(a["Comment"]) if a.get("Comment") else None,
        colour=colour,
        visible=read_bool(a.get("Visible"), True),
        label_showing=read_bool(a.get("LabelShowing"), False),
        line=node.line,
        bad_depth=location.bad_depth,
    )
    return fix, when[1]


def _read_narrative(node: Node, result: DpfFile) -> None:
    """NarrativeHandler: entries with a time, the track they concern, a type and text."""
    name = node.name() or "Narrative"
    result.layers.append(DpfLayer(node.tag, name, True))
    for entry in node.children:
        if entry.tag != "narrative_entry":
            result.skipped.append(DpfSkipped(entry.tag, entry.name(), name, UNKNOWN))
            continue
        try:
            when = read_time(entry.attrs.get("Dtg", ""))
            if when is None:
                raise DpfError("the time is the legacy null date")
        except DpfError as error:
            result.errors.append((entry.line, f"a narrative entry: {error}"))
            continue
        result.truncated_times += when[1]
        result.narrative.append(
            DpfNarrativeEntry(
                time_ms=when[0],
                track=entry.attrs.get("Track", ""),
                entry_type=entry.attrs.get("Type") or None,
                text=entry.attrs.get("Entry", ""),
                narrative=name,
            )
        )


def _kiloyards(text: str | None, what: str) -> float:
    """A distance in kiloyards, as older files give a circle's radius or an ellipse's axes."""
    return finite(read_number(text, what) * METRES_PER["kyds"], what)


def _corner(node: Node, tag: str) -> tuple[float, float]:
    location = read_location(node.child(tag))
    if location is None:
        raise DpfError(f"no {tag} position")
    return (location.longitude, location.latitude)


def _whole(text: str | None, what: str) -> int | None:
    return None if text is None else int(read_number(text, what))


def _read_look(node: Node, shape: DpfShape, result: DpfFile) -> None:
    """How a shape or label is drawn: its line, fill, label and font. Values that
    cannot be read are left at the default, with a warning."""
    a = node.attrs
    what = f"{node.tag} {shape.label!r}"
    try:
        shape.line_style = _whole(a.get("LineStyle"), "line style")
        shape.line_thickness = _whole(a.get("LineThickness"), "line thickness")
    except DpfError as error:
        result.warnings.append((node.line, f"the line of {what}: {error}; the default is used"))
    shape.filled = read_bool(a.get("Filled"), False)
    shape.semi_transparent = read_bool(a.get("SemiTransparent"), False)
    shape.label_location = a.get("LabelLocation")
    shape.label_visible = read_bool(a.get("LabelVisible"), True)
    shape.arrow_at_end = read_bool(a.get("ArrowAtEnd"), False)
    if read_bool(a.get("SymbolVisible"), True):
        shape.symbol = a.get("Symbol")
    font = node.child("font")
    if font is not None:
        try:
            shape.font_size = read_number(font.attrs.get("Size"), "font size")
        except DpfError:
            shape.font_size = None
        shape.font_styled = (
            font.attrs.get("Family", "Arial") != "Arial"
            or read_bool(font.attrs.get("Bold"), False)
            or read_bool(font.attrs.get("Italic"), False)
        )
    if node.child("fontcolour") is not None:
        shape.font_colour = _colour_or_default(
            node.child("fontcolour"), f"the label of {what}", result
        )


def _read_shape(node: Node, layer: str, result: DpfFile) -> DpfShape:
    """ShapeHandler and LabelHandler, with each shape's own handler for its geometry."""
    a = node.attrs
    start, end, truncated = read_time_range(node.child("timeRange"))
    result.truncated_times += truncated
    label = from_xml(a.get("Label", ""))
    if start is not None and end == start:
        end = None  # as ShapeHandler: an end equal to the start is no end
    elif start is not None and end is not None and end < start:
        result.warnings.append(
            (
                node.line,
                f"{node.tag} {label!r}: its time range ends before it starts; "
                "only its start time is imported",
            )
        )
        end = None
    shape = DpfShape(
        kind=node.tag,
        layer=layer,
        label=label,
        colour=_colour_or_default(node.child("colour"), f"{node.tag} {label!r}", result),
        visible=read_bool(a.get("Visible"), True),
        time_ms=start,
        end_ms=end,
    )
    _read_look(node, shape, result)
    if node.tag == "textlabel":
        shape.points = [_corner(node, "centre")]
    elif node.tag == "circle":
        shape.centre = _corner(node, "centre")
        radius = read_distance_m(node.child("Radius"))
        if radius is None:  # older files: a Radius attribute in kiloyards
            radius = _kiloyards(a.get("Radius"), "radius")
        shape.radius_m = radius
    elif node.tag in ("rectangle", "line"):
        shape.points = [_corner(node, "tl"), _corner(node, "br")]
    elif node.tag == "polygon":
        path = node.child("WorldPath")
        points = []
        for point in path.children if path is not None else []:
            location = read_location(point)
            if location is not None:
                points.append((location.longitude, location.latitude))
        shape.points = points
        shape.closed = read_bool(a.get("Closed"), True)
    elif node.tag == "ellipse":
        shape.centre = _corner(node, "centre")
        # EllipseHandler: Maxima and Minima elements, or in older files
        # attributes in kiloyards, as for a circle's radius.
        for axis, attribute in (("radius_m", "Maxima"), ("minor_m", "Minima")):
            distance = read_distance_m(node.child(attribute))
            if distance is None:
                if attribute not in a:
                    raise DpfError("an ellipse needs its maxima and minima")
                distance = _kiloyards(a[attribute], attribute.lower())
            setattr(shape, axis, distance)
        shape.orientation_deg = read_number(a.get("Orient", "0"), "orientation")
    elif node.tag == "vector":
        # VectorHandler: a start, a bearing in degrees and a distance.
        shape.points = [_corner(node, "tl")]
        shape.orientation_deg = read_number(a.get("Bearing", "0"), "bearing")
        shape.radius_m = read_distance_m(node.child("Distance"))
        if shape.radius_m is None:
            raise DpfError("a vector needs its distance")
    return shape
