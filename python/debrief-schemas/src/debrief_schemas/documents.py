"""Read and write Debrief documents against the data-file schema.

Validation runs in three layers, in order:

1. Schema version (SUB-14), for file kinds: a file written against another
   schema version is refused before anything else is read.
2. JSON Schema generated from LinkML: the same check the TypeScript side runs.
3. Rules LinkML cannot express, such as parallel arrays matching the
   geometry. These live here only, in Python (PRN-03).

Text that has passed layers 2 and 3 once is remembered by its hash, so the
same text read again, or a document written out just as it was read, is not
checked against them a second time: the answer could only be the same. So is
each feature that has passed layer 2, in a plot or in a step of its history:
a feature's check depends on nothing but the feature, so a plot changed by one
note has only that note checked against JSON Schema. Layer 3 always runs on
the whole document, since its rules span features.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from collections import Counter
from collections.abc import Callable, Iterable
from enum import StrEnum
from functools import cache
from importlib.resources import files
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft201909Validator
from pydantic import BaseModel

from debrief_schemas.chain import (
    HISTORY_MEMBER,
    chain_problem,
    content_text_of,
    pointer_problems,
    text_hash,
)
from debrief_schemas.generated import debrief as g
from debrief_schemas.generated.schema_version import SCHEMA_VERSION
from debrief_schemas.island import dump_json


class DocumentKind(StrEnum):
    PLOT = "plot"
    STAC_ITEM = "stac_item"
    STAC_CATALOG = "stac_catalog"
    TOOL_DECLARATION = "tool_declaration"
    TOOL_RESULT = "tool_result"
    SHARED_STATE = "shared_state"
    FORMAT_SETTINGS = "format_settings"
    USER_CONFIG = "user_config"
    WEBVIEW_MESSAGE = "webview_message"
    DELTA = "delta"
    HISTORY_HEAD = "history_head"


_MODELS: dict[DocumentKind, type[BaseModel]] = {
    DocumentKind.PLOT: g.DebriefFeatureCollection,
    DocumentKind.STAC_ITEM: g.StacItem,
    DocumentKind.STAC_CATALOG: g.StacCatalog,
    DocumentKind.TOOL_DECLARATION: g.ToolDeclaration,
    DocumentKind.TOOL_RESULT: g.ToolResult,
    DocumentKind.SHARED_STATE: g.SharedState,
    DocumentKind.FORMAT_SETTINGS: g.FormatSettings,
    DocumentKind.USER_CONFIG: g.UserConfig,
    DocumentKind.WEBVIEW_MESSAGE: g.WebviewMessage,
    DocumentKind.DELTA: g.Delta,
    DocumentKind.HISTORY_HEAD: g.HistoryHead,
}

# Members that GeoJSON and STAC require to be present even when null.
_NULLABLE_REQUIRED_FEATURE_MEMBERS = ("geometry",)

_UTC_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z")

UNITS_BY_KIND: dict[str, set[str]] = {
    "length": {u.value for u in g.LengthUnitEnum},
    "speed": {u.value for u in g.SpeedUnitEnum},
    "angle": {u.value for u in g.AngleUnitEnum},
    "duration": {u.value for u in g.DurationUnitEnum},
    "angular_rate": {u.value for u in g.AngularRateUnitEnum},
}


class SchemaVersionError(ValueError):
    """The file was written against a schema version this build cannot open."""

    def __init__(self, found: str | None, supported: str = SCHEMA_VERSION):
        self.found = found
        self.supported = supported
        if found is None:
            message = "The file does not record a data-file schema version."
        elif _parse_version(found) > _parse_version(supported):
            message = (
                f"This file needs data-file schema {found}; this version of Debrief "
                f"supports up to {supported}. Update Debrief to open it."
            )
        else:
            message = (
                f"This file uses data-file schema {found}, which this version of Debrief "
                f"cannot migrate. It supports {supported}."
            )
        super().__init__(message)


class DocumentValidationError(ValueError):
    """The document does not conform to the data-file schema."""

    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("; ".join(problems))


def _parse_version(version: str) -> tuple[int, int, int]:
    major, minor, patch = (int(part) for part in version.split("."))
    return major, minor, patch


@cache
def _json_schema() -> dict[str, Any]:
    text = files("debrief_schemas.generated").joinpath("debrief.schema.json").read_text()
    return json.loads(text)


@cache
def _class_validator(name: str) -> Draft201909Validator:
    schema = _json_schema()
    root = {"$schema": schema["$schema"], "$defs": schema["$defs"], "$ref": f"#/$defs/{name}"}
    return Draft201909Validator(root)


def _validator(kind: DocumentKind) -> Draft201909Validator:
    return _class_validator(_MODELS[kind].__name__)


# Classes whose feature lists are checked one feature at a time, and those lists.
# A feature's validity against JSON Schema depends on that feature alone (the
# lists have no constraints across items), so a feature that passed once, in a
# plot or in a step, passes again: a plot of tens of megabytes changed by one
# note has only that note checked, not every fix of every track (decision 13 Oct).
_FEATURE_LISTS = {
    "DebriefFeatureCollection": ("features",),
    "HistoryStep": ("added", "modified"),
    "Delta": ("added", "modified"),
}

# Hashes of features (as JSON) that passed JSON Schema. Bounded: when full it is
# emptied, so a long session only ever checks some features again.
_FEATURES_PASSED: set[bytes] = set()
_FEATURES_PASSED_MAX = 200_000


@cache
def _item_validator(name: str, member: str) -> Draft201909Validator:
    schema = _json_schema()
    items = schema["$defs"][name]["properties"][member]["items"]
    return Draft201909Validator({"$schema": schema["$schema"], "$defs": schema["$defs"], **items})


# Each feature kind's own class. A feature that is valid against its kind's class is
# valid against the list's anyOf of every feature class, so it is checked against that
# class alone: much quicker where a plot holds tens of thousands of small features, such
# as narrative entries (NFR-06), since each class the feature is not costs a failed check.
# A feature that fails is checked against the whole anyOf, so the problems reported are
# the same as before.
_FEATURE_CLASSES = {
    "track": "TrackFeature",
    "annotation": "AnnotationFeature",
    "sensor_observations": "SensorObservationsFeature",
    "sensor": "SensorFeature",
    "sensor_cut": "SensorCutFeature",
    "narrative": "NarrativeFeature",
    "plot": "PlotFeature",
}


def _feature_errors(check: Draft201909Validator, item: Any) -> list[Any]:
    props = item.get("properties") if isinstance(item, dict) else None
    kind = props.get("kind") if isinstance(props, dict) else None
    if kind == "narrative" and _plain_narrative(item):
        return []
    if kind == "sensor_cut" and _plain_cut(item):
        return []
    own = _FEATURE_CLASSES.get(kind) if isinstance(kind, str) else None
    if own is not None and _class_validator(own).is_valid(item):
        return []
    return list(check.iter_errors(item))


_NARRATIVE_REQUIRED = frozenset(("kind", "time", "source", "text"))
_NARRATIVE_MEMBERS = _NARRATIVE_REQUIRED | {"entry_type", "track_id"}


@cache
def _utc_pattern() -> re.Pattern[str]:
    pattern = _json_schema()["$defs"]["NarrativeProperties"]["properties"]["time"]["pattern"]
    return re.compile(pattern)


def _plain_narrative(item: Any) -> bool:
    """A narrative entry as importers and forms write it, checked by hand: exactly what
    NarrativeFeature's JSON Schema allows, less its provenance (an entry carrying any is
    left to the schema). True only where the schema would pass it too; anything else is
    left to the schema, so this can only make checking quicker, never more lenient.
    A plot may hold sixty thousand entries (NFR-06), each checked once."""
    if not isinstance(item, dict):
        return False
    props = item.get("properties")
    if not isinstance(props, dict) or props.get("kind") != "narrative":
        return False
    if not item.keys() <= {"type", "id", "geometry", "properties"}:
        return False
    if item.get("type") != "Feature" or not isinstance(item.get("id"), str):
        return False
    if item.get("geometry") is not None:
        return False
    if not (_NARRATIVE_REQUIRED <= props.keys() <= _NARRATIVE_MEMBERS):
        return False
    time, source, text = props["time"], props["source"], props["text"]
    if not (type(time) is str and type(source) is str and type(text) is str):
        return False
    entry_type, track_id = props.get("entry_type"), props.get("track_id")
    if not (entry_type is None or type(entry_type) is str):
        return False
    if not (track_id is None or type(track_id) is str):
        return False
    return _utc_pattern().search(time) is not None


_CUT_REQUIRED = frozenset(("kind", "sensor_id", "time", "bearing"))
_CUT_MEMBERS = _CUT_REQUIRED | {"ambiguous_bearing", "resolved", "label", "colour", "hidden"}
_ANGLE_UNITS = frozenset(("deg", "rad"))


def _plain_angle(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.keys() == {"value", "unit"}
        and type(value["value"]) in (int, float)
        and value["unit"] in _ANGLE_UNITS
    )


def _plain_cut(item: Any) -> bool:
    """A sensor cut as importers write it, checked by hand: exactly what
    SensorCutFeature's JSON Schema allows, less a range, an origin and a comment (a cut
    carrying any is left to the schema). True only where the schema would pass it too, so
    this can only make checking quicker, never more lenient. A dense sensor holds tens
    of thousands of cuts (NFR-06), each checked once, as a narrative entry is."""
    if not isinstance(item, dict) or not item.keys() <= {"type", "id", "geometry", "properties"}:
        return False
    props = item.get("properties")
    if not isinstance(props, dict) or props.get("kind") != "sensor_cut":
        return False
    if item.get("type") != "Feature" or not isinstance(item.get("id"), str):
        return False
    if item.get("geometry") is not None:
        return False
    if not (_CUT_REQUIRED <= props.keys() <= _CUT_MEMBERS):
        return False
    if type(props["sensor_id"]) is not str or type(props["time"]) is not str:
        return False
    if not _plain_angle(props["bearing"]):
        return False
    if "ambiguous_bearing" in props and not _plain_angle(props["ambiguous_bearing"]):
        return False
    if props.get("resolved", "bearing") not in ("bearing", "ambiguous_bearing"):
        return False
    if not (props.get("label") is None or type(props["label"]) is str):
        return False
    if "label" in props and props["label"] is None:
        return False
    if "hidden" in props and type(props["hidden"]) is not bool:
        return False
    colour = props.get("colour")
    if "colour" in props and not (type(colour) is str and _COLOUR.fullmatch(colour)):
        return False
    return _utc_pattern().search(props["time"]) is not None


_COLOUR = re.compile(r"#[0-9a-f]{6}")


def _schema_errors(
    name: str, document: Any, validator: Draft201909Validator | None = None
) -> list[str]:
    """JSON Schema problems with a document of a class, as 'path: message', in path order.

    The same problems as checking the document whole, but a class's feature lists
    are checked one feature at a time, and a feature that has passed before is not
    checked again.
    """
    lists = _FEATURE_LISTS.get(name, ())
    found: list[tuple[list[Any], str]] = []
    if lists and isinstance(document, dict):
        rest = {k: v for k, v in document.items() if not (k in lists and isinstance(v, list))}
        for member in lists:
            items = document.get(member)
            if not isinstance(items, list):
                continue
            # An empty list stands in for the features, so the list itself is still checked.
            rest[member] = []
            check = _item_validator(name, member)
            for index, item in enumerate(items):
                if _plain_narrative(item) or _plain_cut(item):
                    continue  # checked by hand, quicker than looking it up
                key = hashlib.sha256(json.dumps(item, separators=(",", ":")).encode()).digest()
                if key in _FEATURES_PASSED:
                    continue
                errors = _feature_errors(check, item)
                found += [([member, index, *e.path], e.message) for e in errors]
                if not errors:
                    if len(_FEATURES_PASSED) >= _FEATURES_PASSED_MAX:
                        _FEATURES_PASSED.clear()
                    _FEATURES_PASSED.add(key)
        document = rest
    validator = validator or _class_validator(name)
    found += [(list(e.path), e.message) for e in validator.iter_errors(document)]
    found.sort(key=lambda error: error[0])
    return [f"{'/'.join(map(str, path)) or '<root>'}: {message}" for path, message in found]


# --- Layer 1: schema version ---------------------------------------------------


_FILE_KINDS = (
    DocumentKind.PLOT,
    DocumentKind.STAC_ITEM,
    DocumentKind.STAC_CATALOG,
    DocumentKind.DELTA,
    DocumentKind.HISTORY_HEAD,
)


def _recorded_version(kind: DocumentKind, document: dict[str, Any]) -> object:
    if kind in (
        DocumentKind.PLOT,
        DocumentKind.DELTA,
        DocumentKind.HISTORY_HEAD,
    ):
        return document.get("schema_version")
    if kind is DocumentKind.STAC_ITEM:
        properties = document.get("properties")
        return properties.get("debrief:schema_version") if isinstance(properties, dict) else None
    if kind is DocumentKind.STAC_CATALOG:
        return document.get("debrief:schema_version")
    raise AssertionError(kind)


def _check_version(kind: DocumentKind, document: Any) -> None:
    if kind not in _FILE_KINDS:
        return  # messages, not files
    found = _recorded_version(kind, document) if isinstance(document, dict) else None
    if not isinstance(found, str):
        raise SchemaVersionError(None)
    try:
        parsed = _parse_version(found)
    except ValueError:
        raise DocumentValidationError(
            [f"schema version {found!r} is not a semantic version"]
        ) from None
    # Before 1.0.0 there is no migration guarantee (SUB-13), so only an exact match opens.
    if parsed != _parse_version(SCHEMA_VERSION):
        raise SchemaVersionError(found)


# --- Layer 3: rules LinkML cannot express --------------------------------------


def _positions(geometry: Any) -> Iterable[tuple[float, float]]:
    if geometry is None:
        return []
    coordinates = geometry.coordinates
    if geometry.type == "Point":
        return [tuple(coordinates)]
    if geometry.type == "LineString":
        return [tuple(p) for p in coordinates]
    return [tuple(p) for ring in coordinates for p in ring]


def _geometry_problems(where: str, geometry: Any) -> list[str]:
    problems = []
    for index, (longitude, latitude) in enumerate(_positions(geometry)):
        if not -180 <= longitude <= 180:
            problems.append(f"{where}: longitude {longitude} at position {index}")
        if not -90 <= latitude <= 90:
            problems.append(f"{where}: latitude {latitude} at position {index}")
    if geometry is not None and geometry.type == "Polygon":
        for index, ring in enumerate(geometry.coordinates):
            if list(ring[0]) != list(ring[-1]):
                problems.append(f"{where}: polygon ring {index} is not closed")
    return problems


def _time_range_problems(where: str, time_range: Any) -> list[str]:
    if time_range is not None and time_range.start > time_range.end:
        return [f"{where}: time range starts after it ends"]
    return []


def _bbox_problems(where: str, bbox: list[float] | None) -> list[str]:
    if bbox is None:
        return []
    west, south, east, north = bbox
    problems = []
    if not (-180 <= west <= 180 and -180 <= east <= 180):
        problems.append(f"{where}: bbox longitude out of range")
    if not (-90 <= south <= north <= 90):
        problems.append(f"{where}: bbox latitudes out of range or south above north")
    return problems


def _unit_problems(where: str, quantity_kind: Any, unit: str | None) -> list[str]:
    if quantity_kind is None:
        return [] if unit is None else [f"{where}: unit given without a quantity kind"]
    if unit is None:
        return [f"{where}: {quantity_kind} needs a unit"]
    if unit not in UNITS_BY_KIND[str(quantity_kind)]:
        return [f"{where}: {unit!r} is not a {quantity_kind} unit"]
    return []


# The geometry each annotation shape has (CAP-03); a note has none (CAP-04).
SHAPE_GEOMETRY = {
    "line": "LineString",
    "area": "Polygon",
    "circle": "Polygon",
    "ellipse": "Polygon",
    "label": "Point",
    "marker": "Point",
    "note": None,
}
CURVE_MEMBERS = ("centre", "radius", "semi_major", "semi_minor", "orientation")
_CURVE_NEEDS = {
    "circle": ("centre", "radius"),
    "ellipse": ("centre", "semi_major", "semi_minor", "orientation"),
}
_METRES = {"m": 1.0, "km": 1000.0, "[nmi_i]": 1852.0, "[yd_i]": 0.9144, "[ft_i]": 0.3048}
_EARTH_MEAN_RADIUS_M = 6_371_008.8
# How far a circle's or an ellipse's polygon may stray from its own size. Checked on
# a sphere, cheaply and without the kernel, so as to catch a polygon left behind
# when its size changed, not to measure it: the kernel draws it on WGS84.
_RING_TOLERANCE = 0.01


def _metres(length: Any) -> float:
    return length.value * _METRES[str(length.unit)]


def _sphere_range_m(a: Iterable[float], b: Iterable[float]) -> float:
    (lon1, lat1), (lon2, lat2) = ((math.radians(x) for x in p) for p in (a, b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * _EARTH_MEAN_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def _a(noun: str) -> str:
    return f"{'an' if noun[0] in 'aeiou' else 'a'} {noun}"


def _annotation_problems(where: str, feature: Any) -> list[str]:
    """Rules for annotations: chart furniture, each shape's geometry, and curves (CAP-03)."""
    props = feature.properties
    geometry = feature.geometry
    problems = []
    if props.furniture is not None:
        if geometry is not None:
            problems.append(f"{where}: chart furniture has null geometry")
        if str(props.style) != "chart_furniture":
            problems.append(f"{where}: chart furniture has the style chart_furniture")
    elif geometry is None and props.time is None and props.time_range is None:
        problems.append(f"{where}: an annotation without geometry needs a time or time range")

    shape = str(props.shape) if props.shape is not None else None
    if shape is not None and (geometry.type if geometry else None) != SHAPE_GEOMETRY[shape]:
        wanted = SHAPE_GEOMETRY[shape]
        problems.append(
            f"{where}: {_a(shape)} has {wanted + ' geometry' if wanted else 'no geometry'}"
        )
    given = [m for m in CURVE_MEMBERS if getattr(props, m) is not None]
    if shape not in _CURVE_NEEDS:
        if given:
            problems.append(f"{where}: only circles and ellipses have {', '.join(given)}")
    else:
        needs = _CURVE_NEEDS[shape]
        missing = [m for m in needs if getattr(props, m) is None]
        extra = [m for m in given if m not in needs]
        if missing:
            problems.append(f"{where}: {_a(shape)} needs {', '.join(missing)}")
        if extra:
            problems.append(f"{where}: {_a(shape)} has no {', '.join(extra)}")
        if not missing:
            problems += _curve_problems(where, shape, props, geometry)

    appearance = props.appearance
    if appearance is not None and (geometry is None or geometry.type != "Polygon"):
        filled = [m for m in ("fill_colour", "fill_opacity") if getattr(appearance, m) is not None]
        if filled:
            problems.append(f"{where}: only areas, circles and ellipses have {' or '.join(filled)}")
    return problems


def _curve_problems(where: str, shape: str, props: Any, geometry: Any) -> list[str]:
    """A circle's or an ellipse's size, and its polygon agreeing with it."""
    problems = []
    longitude, latitude = props.centre
    if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
        problems.append(f"{where}: its centre is not a position")
        return problems
    if shape == "circle":
        smallest = largest = _metres(props.radius)
        if smallest <= 0:
            problems.append(f"{where}: a circle's radius must be more than zero")
    else:
        smallest, largest = _metres(props.semi_minor), _metres(props.semi_major)
        if smallest <= 0:
            problems.append(f"{where}: an ellipse's semi-minor axis must be more than zero")
        if smallest > largest:
            problems.append(f"{where}: an ellipse's semi-minor axis is longer than its semi-major")
    if problems or geometry is None or geometry.type != "Polygon":
        return problems
    if len(geometry.coordinates) != 1:
        problems.append(f"{where}: a {shape}'s polygon has one ring")
        return problems
    low = smallest * (1 - _RING_TOLERANCE) - 1
    high = largest * (1 + _RING_TOLERANCE) + 1
    if any(not low <= _sphere_range_m(props.centre, p) <= high for p in geometry.coordinates[0]):
        problems.append(f"{where}: its polygon does not match its centre and size")
    return problems


def _feature_problems(
    feature: Any, track_ids: set[str] | None, sensor_ids: set[str] | None = None
) -> list[str]:
    """track_ids and sensor_ids are None where the containing plot is not known, as in a
    tool result."""
    where = feature.id
    props = feature.properties
    problems = _geometry_problems(where, feature.geometry)

    if props.kind == "track":
        count = len(feature.geometry.coordinates)
        series = {
            "times": props.times,
            "speeds": props.speeds.values if props.speeds else None,
            "courses": props.courses.values if props.courses else None,
            "depths": props.depths.values if props.depths else None,
        }
        for name, values in series.items():
            if values is not None and len(values) != count:
                problems.append(f"{where}: {name} has {len(values)} entries for {count} positions")
        if any(a > b for a, b in zip(props.times, props.times[1:], strict=False)):
            problems.append(f"{where}: times are not in order")
        logged = props.logged_positions
        if logged is not None:
            if str(props.plotting_mode) != "dr":
                problems.append(
                    f"{where}: only a track plotted by dead reckoning keeps its positions as logged"
                )
            if len(logged.coordinates) != count:
                problems.append(
                    f"{where}: logged_positions has {len(logged.coordinates)} positions "
                    f"for {count} fixes"
                )
        for name in ("logged_courses", "logged_speeds"):
            series_logged = getattr(props, name)
            if series_logged is None:
                continue
            if str(props.plotting_mode) != "dr":
                problems.append(
                    f"{where}: only a track plotted by dead reckoning keeps its {name[7:]} "
                    "as logged"
                )
            if len(series_logged.values) != count:
                problems.append(
                    f"{where}: {name} has {len(series_logged.values)} entries for {count} fixes"
                )
        problems += _fix_mark_problems(where, props)
        problems += _interval_problems(where, props)
        problems += _collation_problems(where, props)
        problems += tma_solution_problems(where, props)

    elif props.kind == "annotation":
        problems += _annotation_problems(where, feature)
        problems += _time_range_problems(where, props.time_range)

    elif props.kind == "plot":
        if feature.geometry is not None:
            problems.append(f"{where}: the whole-plot feature has null geometry")
        problems += view_problems(props.view, where)

    elif props.kind == "narrative":
        problems += narrative_problems(where, feature)

    elif props.kind == "sensor":
        if feature.geometry is not None:
            problems.append(f"{where}: a sensor has null geometry")
        if not props.name.strip():
            problems.append(f"{where}: a sensor has a name")
        offset = props.array_offset
        if offset is not None and not (math.isfinite(offset.value) and offset.value >= 0):
            problems.append(f"{where}: an array offset is a distance astern, 0 or more")
        if props.array_mode is not None and offset is None:
            problems.append(f"{where}: an array mode goes with an array offset")
        if track_ids is not None and props.host_track_id not in track_ids:
            problems.append(f"{where}: host track {props.host_track_id!r} is not in the plot")

    elif props.kind == "sensor_cut":
        problems += cut_problems(where, feature)
        if sensor_ids is not None and props.sensor_id not in sensor_ids:
            problems.append(f"{where}: sensor {props.sensor_id!r} is not in the plot")

    elif props.kind == "sensor_observations":
        if feature.geometry is not None:
            problems.append(f"{where}: sensor observations have null geometry")
        if track_ids is not None and props.host_track_id not in track_ids:
            problems.append(f"{where}: host track {props.host_track_id!r} is not in the plot")
        problems += _time_range_problems(where, props.time_range)
        for column in props.payload.columns:
            problems += _unit_problems(
                f"{where} column {column.name}", column.quantity_kind, column.unit
            )

    return problems


def _degrees(angle: Any) -> float:
    return angle.value if str(angle.unit) == "deg" else math.degrees(angle.value)


def cut_problems(where: str, feature: Any) -> list[str]:
    """Rules for a sensor cut (CAP-22): no geometry of its own; bearings from 0 up to
    360 degrees; resolved only where there is an ambiguous bearing to resolve; a range,
    when given, 0 (a point) or more; an origin, when given, on the globe, and a pinned
    course and origin_derived only with one."""
    props = feature.properties
    problems = []
    if feature.geometry is not None:
        problems.append(f"{where}: a sensor cut has null geometry")
    for name in ("bearing", "ambiguous_bearing", "course"):
        angle = getattr(props, name)
        if angle is not None:
            degrees = _degrees(angle)
            if not (math.isfinite(degrees) and 0 <= degrees < 360):
                problems.append(f"{where}: {name} {degrees:g}° is not from 0 up to 360°")
    if props.resolved is not None and props.ambiguous_bearing is None:
        problems.append(f"{where}: only a cut with an ambiguous bearing can be resolved")
    reach = props.range
    if reach is not None and not (math.isfinite(reach.value) and reach.value >= 0):
        problems.append(f"{where}: a cut's range, when given, is 0 (a point) or more")
    if props.origin is not None:
        longitude, latitude = props.origin
        if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            problems.append(f"{where}: origin {list(props.origin)} is not on the globe")
    elif props.origin_derived is not None or props.course is not None:
        problems.append(f"{where}: origin_derived and course are only with an origin")
    if props.label is not None and not props.label.strip():
        problems.append(f"{where}: a cut's label, when given, is not empty")
    if props.bearing_accuracy is not None and not props.bearing_accuracy.strip():
        problems.append(f"{where}: a cut's bearing accuracy, when given, is not empty")
    return problems


def narrative_problems(where: str, feature: Any) -> list[str]:
    """Rules for a narrative entry (CAP-20): no position, and something said by someone.
    A link to a track the plot no longer has is allowed, and ignored."""
    props = feature.properties
    problems = []
    if feature.geometry is not None:
        problems.append(f"{where}: a narrative entry has null geometry")
    if not props.source.strip():
        problems.append(f"{where}: a narrative entry says who wrote it (its source)")
    if not props.text.strip():
        problems.append(f"{where}: a narrative entry has text")
    if props.entry_type is not None and not props.entry_type.strip():
        problems.append(f"{where}: a narrative entry's type, when given, is not empty")
    return problems


def _fix_mark_problems(where: str, props: Any) -> list[str]:
    """Rules for marked fixes JSON Schema cannot express: each is one of the track's
    fixes, found by its time; they are in time order, one per time; and each says
    something (a colour, a label or a comment, or always shows its time label or symbol),
    with no empty text; show_label and show_symbol are true or left out (force on only)."""
    marks = props.fix_marks or []
    problems = []
    times = set(props.times)
    for mark in marks:
        if mark.time not in times:
            problems.append(f"{where}: a fix mark at {mark.time} is not at one of its fixes")
        forced = (mark.show_label, mark.show_symbol)
        if mark.colour is None and mark.label is None and mark.comment is None and not any(forced):
            problems.append(
                f"{where}: the fix mark at {mark.time} has no colour, label or comment, "
                "and shows no time label or symbol"
            )
        if False in forced:
            # Force on only (decision, product owner, 15 Oct 2026): left out, never false.
            problems.append(
                f"{where}: the fix mark at {mark.time} says show_label or show_symbol false; "
                "leave it out instead"
            )
        if (mark.label is not None and not mark.label.strip()) or (
            mark.comment is not None and not mark.comment.strip()
        ):
            problems.append(f"{where}: the fix mark at {mark.time} has an empty label or comment")
    if any(a.time >= b.time for a, b in zip(marks, marks[1:], strict=False)):
        problems.append(f"{where}: fix marks are not in time order, one per time")
    return problems


_SECONDS = {"ms": 0.001, "s": 1.0, "min": 60.0, "h": 3600.0}


def _interval_problems(where: str, props: Any) -> list[str]:
    """Rules for how often a track's fixes are labelled, marked and arrowed (CAP-32) that
    JSON Schema cannot express: each interval given is a whole number of seconds from
    1 s to 24 h."""
    problems = []
    for name in ("label_interval", "symbol_interval", "arrow_interval"):
        value = getattr(props, name, None)
        if not isinstance(value, g.Duration):
            continue
        seconds = value.value * _SECONDS[str(getattr(value.unit, "value", value.unit))]
        if abs(seconds - round(seconds)) > 1e-6 or not 1 <= round(seconds) <= 86_400:
            problems.append(
                f"{where}: {name} is {value.value:g} {getattr(value.unit, 'value', value.unit)}; "
                "an interval is a whole number of seconds from 1 s to 24 h"
            )
    return problems


def _collation_problems(where: str, props: Any) -> list[str]:
    """Rules for a track's collation (CAP-09) that JSON Schema cannot express: the
    periods items supply are each from start to end, in time order and not
    overlapping; a track in another item is linked once, and is not both linked and
    unlinked."""
    problems = []
    supplies = props.supplies or []
    for supply in supplies:
        if supply.start > supply.end:
            problems.append(
                f"{where}: the period {supply.item!r} supplies ends ({supply.end}) "
                f"before it starts ({supply.start})"
            )
    if any(a.end >= b.start for a, b in zip(supplies, supplies[1:], strict=False)):
        problems.append(f"{where}: the periods items supply are not in time order, apart")
    links = [(r.catalogue, r.item, r.track) for r in props.platform_links or []]
    unlinks = [(r.catalogue, r.item, r.track) for r in props.platform_unlinks or []]
    for name, refs in (("platform_links", links), ("platform_unlinks", unlinks)):
        if len(set(refs)) != len(refs):
            problems.append(f"{where}: {name} names a track more than once")
    both = set(links) & set(unlinks)
    if both:
        problems.append(
            f"{where}: the track {sorted(both)[0][2]!r} of {sorted(both)[0][1]!r} is both "
            "linked and unlinked"
        )
    return problems


def tma_solution_problems(where: str, props: Any) -> list[str]:
    """Rules for a track that is a TMA solution (CAP-21) that JSON Schema cannot express:
    a contact named; its period from start to end; each rooted cut named once; the cuts
    left out of its RMS among them, each once; its legs starting in time order, each
    once (a leg left with no fixes, by fixes removed, is no leg). Cuts no longer in the
    plot are allowed: its residuals count them as giving none, as a narrative entry may
    name a track gone."""
    tma = props.tma
    if tma is None:
        return []
    problems = []
    if not tma.contact.strip():
        problems.append(f"{where}: a TMA solution names its contact")
    problems += _time_range_problems(f"{where} TMA period", tma.period)
    for name, ids in (("cut_ids", tma.cut_ids), ("excluded_cut_ids", tma.excluded_cut_ids or [])):
        twice = sorted(i for i, n in Counter(ids).items() if n > 1)
        if twice:
            problems.append(f"{where}: the TMA solution's {name} names {twice[0]!r} more than once")
    stray = sorted(set(tma.excluded_cut_ids or []) - set(tma.cut_ids))
    if stray:
        problems.append(f"{where}: cut {stray[0]!r} is left out of the RMS but is not rooted")
    starts = tma.leg_starts or []
    if any(a >= b for a, b in zip(starts, starts[1:], strict=False)):
        problems.append(f"{where}: the TMA solution's legs do not start in time order")
    return problems


def tma_request_problems(request: Any, where: str = "tma_request") -> list[str]:
    """Rules for a TMA solution asked for (CAP-21): the cuts, as sensors and perhaps a
    period, or cuts named, not both; and a first guess either by form (a range, a
    course and a speed) or by two positions, not both. A request with no guess yet
    names only the cuts, as the host asks the map for two clicks."""
    problems = []
    if request.cut_ids and (request.sensor_ids or request.period):
        problems.append(f"{where}: name the cuts, or the sensors and a period, not both")
    problems += _time_range_problems(f"{where} period", request.period)
    form = [request.range, request.course, request.speed]
    clicks = [request.first_position, request.last_position]
    if any(v is not None for v in form) and any(v is not None for v in clicks):
        problems.append(f"{where}: a first guess is by form or by two positions, not both")
    if any(v is not None for v in form) and not all(v is not None for v in form):
        problems.append(f"{where}: a first guess by form gives a range, a course and a speed")
    if any(v is not None for v in clicks) and not all(v is not None for v in clicks):
        problems.append(f"{where}: a first guess by two clicks gives both positions")
    for name, position in (
        ("first_position", request.first_position),
        ("last_position", request.last_position),
    ):
        if position is not None and not (-180 <= position[0] <= 180 and -90 <= position[1] <= 90):
            problems.append(f"{where}: {name} is not on the globe")
    if request.range is not None and not (
        math.isfinite(request.range.value) and request.range.value > 0
    ):
        problems.append(f"{where}: the range is more than nothing")
    if request.speed is not None and not (
        math.isfinite(request.speed.value) and request.speed.value >= 0
    ):
        problems.append(f"{where}: the speed is 0 or more")
    return problems


def _raw_feature_problems(raw_features: Any, label: str) -> list[str]:
    if not isinstance(raw_features, list):
        return []
    return [
        f"{label} {index}: GeoJSON requires a geometry member, which may be null"
        for index, raw in enumerate(raw_features)
        if isinstance(raw, dict) and "geometry" not in raw
    ]


def _plot_problems(plot: g.DebriefFeatureCollection, raw: dict[str, Any]) -> list[str]:
    problems = _raw_feature_problems(raw.get("features"), "feature")
    ids = [f.id for f in plot.features]
    duplicates = sorted(i for i, n in Counter(ids).items() if n > 1)
    problems += [f"feature id {i!r} is used more than once" for i in duplicates]
    track_ids = {f.id for f in plot.features if f.properties.kind == "track"}
    sensor_ids = {f.id for f in plot.features if f.properties.kind == "sensor"}
    if sum(f.properties.kind == "plot" for f in plot.features) > 1:
        problems.append("a plot has at most one whole-plot feature (kind plot)")
    for feature in plot.features:
        problems += _feature_problems(feature, track_ids, sensor_ids)
    known = set(ids)
    for named_set in plot.named_sets or []:
        missing = [i for i in named_set.feature_ids if i not in known]
        if missing:
            problems.append(f"named set {named_set.id}: unknown features {missing}")
    if plot.history is not None:
        problems += history_problems(plot.history, raw)
    return problems


def history_problems(history: g.PlotHistory, raw: dict[str, Any]) -> list[str]:
    """Rules for a plot file's history (decision 13 Oct): each step's own rules, the
    numbering and pointers, the hash chain, and the current step's result_hash
    matching the file's content (island and history left out)."""
    raw_steps = raw[HISTORY_MEMBER]["steps"]
    problems = []
    for step, raw_step in zip(history.steps, raw_steps, strict=True):
        problems += [f"history step {step.seq}: {p}" for p in step_problems(step, raw_step)]
    pointers, _ = pointer_problems(
        [(s.seq, s.after, str(s.state)) for s in history.steps], history.current
    )
    problems += [f"history: {p}" for p in pointers]
    broken = chain_problem(raw_steps, history.head_hash)
    if broken:
        problems.append(f"history: {broken}")
    if not pointers:
        content = text_hash(content_text_of(raw))
        if history.current and history.steps[history.current - 1].result_hash != content:
            problems.append("history: the current step's result_hash is not the content's hash")
        if not history.current and (raw.get("features") or raw.get("provenance")):
            problems.append("history: a plot with content has no current step")
    return problems


def _stac_item_problems(item: g.StacItem, raw: dict[str, Any]) -> list[str]:
    problems = []
    if "geometry" not in raw:
        problems.append("a STAC item requires a geometry member, which may be null")
    props = item.properties
    if props.datetime is None and (props.start_datetime is None or props.end_datetime is None):
        problems.append("a STAC item needs a datetime, or both start_datetime and end_datetime")
    if props.start_datetime and props.end_datetime and props.start_datetime > props.end_datetime:
        problems.append("start_datetime is after end_datetime")
    problems += _geometry_problems(item.id, item.geometry)
    problems += _bbox_problems(item.id, item.bbox)
    for key, asset in item.assets.items():
        if asset.debrief_asset_kind == "source" and asset.debrief_content_hash is None:
            problems.append(f"asset {key}: a source needs debrief:content_hash (SUB-11)")
    for coverage in props.debrief_coverage or []:
        for span in coverage.spans:
            problems += _time_range_problems(f"debrief:coverage {coverage.track}", span)
    return problems


def _value_matches(kind: str, quantity_kind: Any, value: Any) -> bool:
    quantity_types = {
        "length": g.Length,
        "speed": g.Speed,
        "angle": g.Angle,
        "duration": g.Duration,
        "angular_rate": g.AngularRate,
    }
    if kind == "quantity":
        return quantity_kind is not None and isinstance(value, quantity_types[str(quantity_kind)])
    if kind == "boolean":
        return isinstance(value, bool)
    if kind in ("number", "integer"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        return kind == "number" or float(value).is_integer()
    if kind == "time":
        return isinstance(value, str) and _UTC_TIMESTAMP.fullmatch(value) is not None
    return isinstance(value, str)  # string, choice


def _tool_declaration_problems(tool: g.ToolDeclaration, raw: dict[str, Any]) -> list[str]:
    problems = []
    if tool.max_selected is not None and tool.max_selected < (tool.min_selected or 0):
        problems.append("max_selected is below min_selected")
    names = Counter(p.name for p in tool.parameters or [])
    problems += [
        f"parameter {n!r} is declared more than once" for n in sorted(names) if names[n] > 1
    ]
    for param in tool.parameters or []:
        where = f"parameter {param.name}"
        if param.kind == "quantity" and param.quantity_kind is None:
            problems.append(f"{where}: a quantity needs a quantity_kind")
        if param.kind != "quantity" and param.quantity_kind is not None:
            problems.append(f"{where}: quantity_kind is only for quantities")
        if param.kind == "choice" and not param.choices:
            problems.append(f"{where}: a choice needs choices")
        if (
            param.minimum is not None
            and param.maximum is not None
            and param.minimum > param.maximum
        ):
            problems.append(f"{where}: minimum is above maximum")
        default = param.default
        if default is None:
            continue
        if not _value_matches(str(param.kind), param.quantity_kind, default):
            problems.append(f"{where}: default does not match kind {param.kind}")
            continue
        if param.kind == "choice" and default not in (param.choices or []):
            problems.append(f"{where}: default is not one of the choices")
        number = default.value if param.kind == "quantity" else default
        if param.kind in ("number", "integer", "quantity"):
            if param.minimum is not None and number < param.minimum:
                problems.append(f"{where}: default is below minimum")
            if param.maximum is not None and number > param.maximum:
                problems.append(f"{where}: default is above maximum")
    return problems


def _tool_result_problems(result: g.ToolResult, raw: dict[str, Any]) -> list[str]:
    problems = _raw_feature_problems(raw.get("new_features"), "new feature")
    problems += _raw_feature_problems(raw.get("modified_features"), "modified feature")
    for feature in (result.new_features or []) + (result.modified_features or []):
        problems += _feature_problems(feature, None)
    for table in result.non_spatial or []:
        where = f"result {table.title!r}"
        lengths = set()
        for column in table.columns:
            given = [x for x in (column.numbers, column.strings) if x is not None]
            if len(given) != 1:
                problems.append(
                    f"{where} column {column.name}: give exactly one of numbers or strings"
                )
                continue
            lengths.add(len(given[0]))
            problems += _unit_problems(
                f"{where} column {column.name}", column.quantity_kind, column.unit
            )
        if len(lengths) > 1:
            problems.append(f"{where}: columns differ in length")
        if table.presentation == "number" and (len(table.columns) != 1 or lengths != {1}):
            problems.append(f"{where}: a number is one column with one value")
    if result.state_change is not None:
        problems += _state_problems(result.state_change)
        if result.state_change.save_window and result.state_change.time is None:
            problems.append("state_change: save_window needs a time, whose range is the window")
    return problems


def _state_problems(state: g.SharedState | g.SharedStateChange | g.WebviewMessage) -> list[str]:
    problems = []
    if state.time is not None:
        problems += _time_range_problems("time", state.time.range)
        if not state.time.range.start <= state.time.current <= state.time.range.end:
            problems.append("time: current time is outside the range")
    if state.viewport is not None:
        problems += _bbox_problems("viewport", state.viewport.bbox)
    return problems


def _format_settings_problems(settings: g.FormatSettings, raw: dict[str, Any]) -> list[str]:
    problems = []
    if settings.time_zone != "UTC":
        try:
            ZoneInfo(settings.time_zone)
        except (ZoneInfoNotFoundError, ValueError):
            problems.append(f"time_zone: {settings.time_zone!r} is not a known time zone")
        if settings.time_style == "dtg":
            problems.append(
                "time_style: a date-time group is always in Zulu time; set time_zone to UTC"
            )
    return problems


# The newest per-user configuration layout this build understands: 1, the stores; 2, also
# the choice of how tracks imported are plotted (track_import_mode), which an earlier
# Debrief cannot read, so a file holding it says 2 and an earlier Debrief says to update;
# 3, also the answers to a narrative import's questions (narrative_import); 4, also the
# Bearings view's error cut-off (tma_error_cut_off).
CONFIG_VERSION = 4


def _user_config_problems(config: g.UserConfig, raw: dict[str, Any]) -> list[str]:
    problems = []
    if config.config_version > CONFIG_VERSION:
        problems.append(
            f"config_version: {config.config_version} is newer than this version of "
            f"Debrief understands ({CONFIG_VERSION})"
        )
    seen: set[str] = set()
    for index, store in enumerate(config.stores):
        if store.id in seen:
            problems.append(f"stores[{index}]: id {store.id!r} is used by another store")
        seen.add(store.id)
    return problems


# Members each webview message kind carries (CON-08); a trailing "?" marks one it
# may leave out. Shared with TypeScript
# through schemas/vectors/webview-messages.json, which a test checks matches.
MESSAGE_MEMBERS: dict[str, tuple[str, ...]] = {
    "ready": (),
    "show_plot": (
        "plot",
        "plot_title",
        "selection",
        "time?",
        "viewport?",
        "hidden_count?",
        "context_tracks?",
        "revision_shown?",
    ),
    "set_selection": ("selection",),
    "selection_changed": ("selection",),
    "set_time": ("time",),
    "time_changed": ("time",),
    "set_viewport": ("viewport",),
    "viewport_changed": ("viewport",),
    "show_hidden": (),
    "show_form": ("tool", "selected_names", "time_range?", "current_time?"),
    "run_tool": ("tool_name", "parameters"),
    "cancel": (),
    "form_busy": ("message",),
    "form_error": ("message",),
    "show_results": ("tool", "result_title", "result"),
    "show_time": (
        "time?",
        "time_range?",
        "saved_window?",
        "context_tracks?",
        "minimum_context_contrast?",
    ),
    "window_changed": ("time_range",),
    "context_changed": ("context_tracks",),
    "set_context": ("context_tracks",),
    "show_annotation_form": ("annotation?", "feature_id?", "time_range?", "current_time?"),
    "save_annotation": ("annotation", "feature_id?"),
    "delete_annotation": ("feature_id",),
    "edit_annotation": ("feature_id", "annotation?"),
    "annotation_drawn": ("annotation",),
    "edit_track": ("feature_id", "track_edit"),
    "show_fixes": ("feature_id?", "fix_times?", "preview?", "message?"),
    "fix_chosen": ("feature_id", "fix_time"),
    "show_tote": ("tote_tracks?", "tote_view?", "tote?"),
    "tote_changed": ("tote_view",),
    "set_tote": ("tote_view?",),
    "show_timeline": (
        "timeline_entries?",
        "timeline_tracks?",
        "time?",
        "plot_id?",
        "narrative_on_map?",
    ),
    "narrative_on_map_changed": ("narrative_on_map",),
    "playing_changed": ("playing",),
    "timeline_chosen": ("feature_id",),
    "save_narrative": ("narrative", "feature_id?"),
    "delete_narrative": ("feature_id",),
    "open_narrative_form": ("feature_id?",),
    "narrative_saved": ("feature_id?", "message?"),
    "set_narrative": ("timeline_entry?",),
    "undo_asked": (),
    "redo_asked": (),
    "show_coverage": ("coverage?", "time?", "message?"),
    "source_chosen": ("feature_id", "time_range", "source"),
    "link_changed": ("feature_id", "source", "linked"),
    "take_asked": ("item_revision",),
    "dismiss_asked": ("item_revision",),
    "review_cleared": (),
    "export_image": ("image_request",),
    "image_rendered": ("image?", "message?"),
    "latest_asked": (),
    "resolve_asked": ("feature_id", "keep"),
    "cut_chosen": ("feature_id",),
    "show_tma": ("tma?",),
    "tma_chosen": ("feature_id",),
    "tma_create": ("tma_request",),
    "tma_guess": ("tma_request?",),
    "tma_guessed": ("tma_request?",),
    "tma_preview": ("feature_id", "preview?"),
    "tma_exclude": ("feature_id", "cut_ids", "excluded"),
    "tma_split": ("feature_id", "current_time"),
    "tma_time_asked": ("current_time",),
    "tma_select": ("feature_id", "current_time"),
    "tma_cut_off": ("error_cut_off",),
    "tma_made": ("feature_id?", "message?"),
}


def _webview_message_problems(message: g.WebviewMessage, raw: dict[str, Any]) -> list[str]:
    kind = str(message.kind)
    members = MESSAGE_MEMBERS[kind]
    needed = [m for m in members if not m.endswith("?")]
    allowed = {m.rstrip("?") for m in members}
    problems = [f"{kind} needs {member}" for member in needed if member not in raw]
    problems += [
        f"{kind} does not carry {member}" for member in sorted(set(raw) - {"kind", *allowed})
    ]
    problems += _state_problems(message)  # time and viewport, where carried
    problems += _time_range_problems("time_range", message.time_range)
    problems += _time_range_problems("saved_window", message.saved_window)
    if message.plot is not None:
        problems += _plot_problems(message.plot, raw["plot"])
    if message.result is not None:
        problems += _tool_result_problems(message.result, raw["result"])
    if message.track_edit is not None:
        problems += track_edit_problems(message.track_edit)
    problems += tote_view_problems(message.tote_view)
    if kind == "resolve_asked" and str(message.keep) not in ("bearing", "ambiguous_bearing"):
        problems.append("resolve_asked keeps the bearing clicked: bearing or ambiguous_bearing")
    if message.tma_request is not None:
        problems += tma_request_problems(message.tma_request)
    if kind == "tma_exclude" and not message.cut_ids:
        problems.append("tma_exclude names the cuts to leave out or count again")
    if (
        kind == "tma_guessed"
        and message.tma_request is not None
        and (
            message.tma_request.first_position is None or message.tma_request.last_position is None
        )
    ):
        problems.append("tma_guessed carries both positions clicked")
    if kind == "image_rendered" and (message.image is None) == (message.message is None):
        problems.append("image_rendered carries either the image or why there is none (message)")
    if message.image is not None and message.image.viewport is not None:
        problems += _bbox_problems("image viewport", message.image.viewport.bbox)
    return problems


def tote_view_problems(tote: g.ToteView | None, where: str = "tote_view") -> list[str]:
    """Rules for the Tote's choice of tracks (CAP-06): the primary is not also a
    secondary, and no secondary is chosen twice. Tracks no longer in the plot are
    allowed: the island is view state, which a change to content never changes."""
    if tote is None:
        return []
    problems = []
    secondaries = tote.secondaries or []
    if tote.primary is not None and tote.primary in secondaries:
        problems.append(f"{where}: the primary, {tote.primary}, is also a secondary")
    twice = sorted(i for i, n in Counter(secondaries).items() if n > 1)
    problems += [f"{where}: secondary {i} is chosen more than once" for i in twice]
    return problems


def track_edit_problems(edit: g.TrackEdit, where: str = "track_edit") -> list[str]:
    """Rules for a track changed by hand that JSON Schema cannot express: a move gives
    a distance and a bearing; a rotation an angle, and perhaps a pivot; a shear the
    end it holds (anchor) and either a distance and a bearing for the dragged end or
    a course and a speed for the period; a stretch the end it holds and a speed; a
    single fix moved its time and either a distance and a bearing or a position; a
    change of plotting mode the mode, and nothing else. None gives what belongs to
    another."""
    problems = _time_range_problems(f"{where} period", edit.period)
    action = str(edit.action)
    given = {
        name
        for name in (
            "distance",
            "bearing",
            "angle",
            "pivot",
            "anchor",
            "course",
            "speed",
            "fix_time",
            "position",
            "plotting_mode",
        )
        if getattr(edit, name) is not None
    }
    if action != "set_plotting_mode" and "plotting_mode" in given:
        problems.append(f"{where}: only a change of plotting mode has a plotting mode")
    if action != "move_fix" and given & {"fix_time", "position"}:
        problems.append(f"{where}: only a single fix moved has a fix time or a position")
    if edit.discard_dr_changes is not None and not (
        action == "set_plotting_mode" and str(edit.plotting_mode) == "otg"
    ):
        problems.append(
            f"{where}: only plotting a track over the ground discards changes made while it "
            "was plotted by dead reckoning"
        )
    if action == "move_fix":
        if edit.fix_time is None:
            problems.append(f"{where}: moving a fix needs the fix's time")
        by_drag = given >= {"distance", "bearing"} and "position" not in given
        by_place = "position" in given and not given & {"distance", "bearing"}
        if not (by_drag or by_place):
            problems.append(
                f"{where}: moving a fix needs either a distance and a bearing, or a position"
            )
        if given & {"angle", "pivot", "anchor", "course", "speed"} or edit.period is not None:
            problems.append(f"{where}: moving a fix has no period, angle, pivot, anchor or speed")
        if edit.position is not None and not (
            -180 <= edit.position[0] <= 180 and -90 <= edit.position[1] <= 90
        ):
            problems.append(f"{where}: the position is not on the globe")
    elif action == "set_plotting_mode":
        if edit.plotting_mode is None:
            problems.append(f"{where}: a change of plotting mode needs the mode: otg or dr")
        if given - {"plotting_mode"} or edit.period is not None:
            problems.append(f"{where}: a change of plotting mode has only the mode")
    elif action == "move":
        if edit.distance is None or edit.bearing is None:
            problems.append(f"{where}: a move needs a distance and a bearing")
        if given & {"angle", "pivot"}:
            problems.append(f"{where}: a move has no angle or pivot")
        if given & {"anchor", "course", "speed"}:
            problems.append(f"{where}: a move has no anchor, course or speed")
    elif action == "rotate":
        if edit.angle is None:
            problems.append(f"{where}: a rotation needs an angle")
        if given & {"distance", "bearing"}:
            problems.append(f"{where}: a rotation has no distance or bearing")
        if given & {"anchor", "course", "speed"}:
            problems.append(f"{where}: a rotation has no anchor, course or speed")
        if edit.pivot is not None and not (
            -180 <= edit.pivot[0] <= 180 and -90 <= edit.pivot[1] <= 90
        ):
            problems.append(f"{where}: the pivot is not on the globe")
    elif action == "shear":
        if edit.anchor is None:
            problems.append(f"{where}: a shear needs the end it holds (anchor)")
        by_drag = given >= {"distance", "bearing"} and not given & {"course", "speed"}
        by_leg = given >= {"course", "speed"} and not given & {"distance", "bearing"}
        if not (by_drag or by_leg):
            problems.append(
                f"{where}: a shear needs either a distance and a bearing, or a course and a speed"
            )
        if given & {"angle", "pivot"}:
            problems.append(f"{where}: a shear has no angle or pivot")
    else:
        if edit.anchor is None:
            problems.append(f"{where}: a stretch needs the end it holds (anchor)")
        if edit.speed is None:
            problems.append(f"{where}: a stretch needs a speed")
        elif edit.speed.value <= 0:
            problems.append(f"{where}: a stretch's speed must be more than nothing")
        if given & {"distance", "bearing", "course", "angle", "pivot"}:
            problems.append(f"{where}: a stretch has only an anchor and a speed")
    if edit.distance is not None and edit.distance.value < 0:
        problems.append(f"{where}: the distance cannot be negative")
    if edit.speed is not None and edit.speed.value < 0:
        problems.append(f"{where}: the speed cannot be negative")
    return problems


def view_problems(view: g.PlotView | None, where: str = "view") -> list[str]:
    """Rules for the plot's island (its view) that JSON Schema cannot express."""
    if view is None:
        return []
    return (
        _time_range_problems(f"{where} time window", view.time_window)
        + tote_view_problems(view.tote, f"{where} tote")
        + export_log_problems(view.exports, f"{where} exports")
    )


def export_log_problems(exports: list[g.ImageExport] | None, where: str = "exports") -> list[str]:
    """Rules for the plot's export log (SUB-25): each image recorded once, its time
    within its window and its area on the globe."""
    problems = []
    for n, export in enumerate(exports or []):
        at = f"{where}[{n}]"
        if export.time is not None:
            problems += _time_range_problems(f"{at} time", export.time.range)
            if not export.time.range.start <= export.time.current <= export.time.range.end:
                problems.append(f"{at} time: current time is outside the range")
        if export.viewport is not None:
            problems += _bbox_problems(f"{at} viewport", export.viewport.bbox)
    twice = sorted(i for i, n in Counter(e.id for e in exports or []).items() if n > 1)
    problems += [f"{where}: image {i} is recorded more than once" for i in twice]
    return problems


def load_view(source: dict[str, Any] | None) -> g.PlotView | None:
    """Validate a plot's view (its island) on its own, as JSON Schema and the rules do
    for a whole plot. None for no view. Raises DocumentValidationError."""
    if source is None:
        return None
    validator = _class_validator("PlotView")
    errors = sorted(validator.iter_errors(source), key=lambda e: list(e.path))
    if errors:
        raise DocumentValidationError(
            [f"view/{'/'.join(map(str, e.path))}: {e.message}" for e in errors]
        )
    view = g.PlotView.model_validate(source)
    problems = view_problems(view)
    if problems:
        raise DocumentValidationError(problems)
    return view


def step_problems(step: g.HistoryStep | g.Delta, raw: dict[str, Any]) -> list[str]:
    """Rules for one change, a history step or a delta of the earlier layout."""
    return _delta_problems(step, raw)


def load_history_step(raw: dict[str, Any]) -> g.HistoryStep:
    """Validate one step of a plot file's history on its own: JSON Schema and the
    step's rules. The history checks only steps it has not checked before, rather
    than the whole history each time the file changes. Raises DocumentValidationError."""
    errors = _schema_errors("HistoryStep", raw)
    if errors:
        raise DocumentValidationError(errors)
    step = g.HistoryStep.model_validate(raw)
    problems = _delta_problems(step, raw)
    if problems:
        raise DocumentValidationError(problems)
    return step


def dump_history_step(step: g.HistoryStep) -> dict[str, Any]:
    """A step as JSON, as it is written in the plot file. Validated: JSON Schema, where
    features already checked (as part of the content the step makes) are not checked
    again, and all the step's rules."""
    document = step.model_dump(mode="json", by_alias=True, exclude_none=True)
    _feature_geometry(document, ("added", "modified"))
    problems = _schema_errors("HistoryStep", document)
    problems += _delta_problems(step, document)
    if problems:
        raise DocumentValidationError(problems)
    return document


def _feature_geometry(document: dict[str, Any], names: Iterable[str]) -> None:
    for name in names:
        for feature in document.get(name, []):
            for member in _NULLABLE_REQUIRED_FEATURE_MEMBERS:
                feature.setdefault(member, None)


def _delta_problems(delta: g.Delta | g.HistoryStep, raw: dict[str, Any]) -> list[str]:
    problems = ["after must come before seq"] if delta.after >= delta.seq else []
    problems += _raw_feature_problems(raw.get("added"), "added feature")
    problems += _raw_feature_problems(raw.get("modified"), "modified feature")
    for feature in (delta.added or []) + (delta.modified or []):
        problems += _feature_problems(feature, None)
    features = (delta.added or []) + (delta.modified or [])
    problems += [
        f"{f.id}: a delta never records the plot's view, which is outside its history"
        for f in features
        if f.properties.kind == "plot" and f.properties.view is not None
    ]
    ids = Counter([f.id for f in features] + list(delta.deleted_ids or []))
    problems += [
        f"feature {i!r} appears more than once in the delta" for i in sorted(ids) if ids[i] > 1
    ]
    return problems


def _history_head_problems(head: g.HistoryHead, raw: dict[str, Any]) -> list[str]:
    problems = []
    if head.current > head.latest:
        problems.append("current is beyond latest")
    abandoned = list(head.abandoned or [])
    if any(not 1 <= seq <= head.latest for seq in abandoned):
        problems.append("abandoned names a delta that does not exist")
    if head.current in abandoned:
        problems.append("current is an abandoned delta")
    return problems


_RULES: dict[DocumentKind, Callable[[Any, dict[str, Any]], list[str]]] = {
    DocumentKind.PLOT: _plot_problems,
    DocumentKind.STAC_ITEM: _stac_item_problems,
    DocumentKind.STAC_CATALOG: lambda catalog, raw: [],
    DocumentKind.TOOL_DECLARATION: _tool_declaration_problems,
    DocumentKind.TOOL_RESULT: _tool_result_problems,
    DocumentKind.SHARED_STATE: lambda state, raw: _state_problems(state),
    DocumentKind.FORMAT_SETTINGS: _format_settings_problems,
    DocumentKind.USER_CONFIG: _user_config_problems,
    DocumentKind.WEBVIEW_MESSAGE: _webview_message_problems,
    DocumentKind.DELTA: _delta_problems,
    DocumentKind.HISTORY_HEAD: _history_head_problems,
}


# --- Shape differences between JSON and the generated models ------------------


def _to_model_shape(kind: DocumentKind, document: dict[str, Any]) -> dict[str, Any]:
    """STAC asset keys live outside each asset in JSON, inside it in the model."""
    if kind is DocumentKind.STAC_ITEM and isinstance(document.get("assets"), dict):
        document = copy.copy(document)
        document["assets"] = {
            key: {**asset, "key": key} if isinstance(asset, dict) else asset
            for key, asset in document["assets"].items()
        }
    return document


def _to_json_shape(kind: DocumentKind, document: dict[str, Any]) -> dict[str, Any]:
    if kind is DocumentKind.STAC_ITEM:
        for asset in document.get("assets", {}).values():
            asset.pop("key", None)
        document.setdefault("geometry", None)
        document["properties"].setdefault("datetime", None)
    feature_lists = {
        DocumentKind.PLOT: ("features",),
        DocumentKind.TOOL_RESULT: ("new_features", "modified_features"),
        DocumentKind.DELTA: ("added", "modified"),
    }.get(kind, ())
    _feature_geometry(document, feature_lists)
    if kind is DocumentKind.PLOT and isinstance(document.get(HISTORY_MEMBER), dict):
        for step in document[HISTORY_MEMBER].get("steps", []):
            _feature_geometry(step, ("added", "modified"))
    return document


# --- Public API -----------------------------------------------------------------


# Hashes of texts that passed layers 2 and 3, by kind. Bounded: when full it
# is emptied, so a long session only ever validates some text again.
_PASSED: set[tuple[DocumentKind, bytes]] = set()
_PASSED_MAX = 512


def _validate(
    kind: DocumentKind,
    document: Any,
    text: str | bytes | None,
    build: bool,
    model: BaseModel | None = None,
) -> Any:
    """Check a document, unless its text has passed before. Returns its model if build is set.

    model, when given, is the model the document was dumped from: the rules run on
    it rather than on a model built again from the document, which for a large plot
    takes longer than every other check together. The JSON Schema check still runs
    on the document, so whatever the model holds is checked as it would be written.
    """
    _check_version(kind, document)
    key = None
    if text is not None:
        data = text.encode() if isinstance(text, str) else text
        key = (kind, hashlib.sha256(data).digest())
        if key in _PASSED:
            return _MODELS[kind].model_validate(_to_model_shape(kind, document)) if build else None

    errors = _schema_errors(_MODELS[kind].__name__, document, _validator(kind))
    if errors:
        raise DocumentValidationError(errors)

    if model is None:
        model = _MODELS[kind].model_validate(_to_model_shape(kind, document))
    problems = _RULES[kind](model, document)
    if problems:
        raise DocumentValidationError(problems)
    if key is not None:
        if len(_PASSED) >= _PASSED_MAX:
            _PASSED.clear()
        _PASSED.add(key)
    return model


def load_document(kind: DocumentKind | str, source: str | bytes | dict[str, Any]) -> Any:
    """Parse and fully validate a document. Never returns a partially loaded one."""
    kind = DocumentKind(kind)
    text = source if isinstance(source, (str, bytes)) else None
    document = json.loads(source) if text is not None else source
    return _validate(kind, document, text, build=True)


def dump_document(kind: DocumentKind | str, model: BaseModel) -> str:
    """Serialise a document, validating it first so an invalid file is never written.

    Every layer runs, but features that have passed JSON Schema before (in the plot
    as read, or in a step of its history) are not checked against it again, so a
    large plot changed by one note, or rebuilt by replaying its steps, is quick to
    write.
    """
    kind = DocumentKind(kind)
    document = _to_json_shape(kind, model.model_dump(mode="json", by_alias=True, exclude_none=True))
    text = dump_json(document)
    # The rules run on the model given when it is of the kind's own class.
    given = model if type(model) is _MODELS[kind] else None
    _validate(kind, document, text, build=False, model=given)
    return text


def load_plot(source: str | bytes | dict[str, Any]) -> g.DebriefFeatureCollection:
    return load_document(DocumentKind.PLOT, source)


def dump_plot(plot: g.DebriefFeatureCollection) -> str:
    return dump_document(DocumentKind.PLOT, plot)
