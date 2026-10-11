"""Read and write Debrief documents against the data-file schema.

Validation runs in three layers, in order:

1. Schema version (SUB-14), for file kinds: a file written against another
   schema version is refused before anything else is read.
2. JSON Schema generated from LinkML: the same check the TypeScript side runs.
3. Rules LinkML cannot express, such as parallel arrays matching the
   geometry. These live here only, in Python (PRN-03).
"""

from __future__ import annotations

import copy
import json
import re
from collections.abc import Callable, Iterable
from enum import StrEnum
from functools import cache
from importlib.resources import files
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft201909Validator
from pydantic import BaseModel

from debrief_schemas.generated import debrief as g
from debrief_schemas.generated.schema_version import SCHEMA_VERSION


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
}

# Members that GeoJSON and STAC require to be present even when null.
_NULLABLE_REQUIRED_FEATURE_MEMBERS = ("geometry",)

_UTC_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z")

UNITS_BY_KIND: dict[str, set[str]] = {
    "length": {u.value for u in g.LengthUnitEnum},
    "speed": {u.value for u in g.SpeedUnitEnum},
    "angle": {u.value for u in g.AngleUnitEnum},
    "duration": {u.value for u in g.DurationUnitEnum},
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
def _validator(kind: DocumentKind) -> Draft201909Validator:
    schema = _json_schema()
    root = {
        "$schema": schema["$schema"],
        "$defs": schema["$defs"],
        "$ref": f"#/$defs/{_MODELS[kind].__name__}",
    }
    return Draft201909Validator(root)


# --- Layer 1: schema version ---------------------------------------------------


def _recorded_version(kind: DocumentKind, document: dict[str, Any]) -> object:
    if kind is DocumentKind.PLOT:
        return document.get("schema_version")
    if kind is DocumentKind.STAC_ITEM:
        properties = document.get("properties")
        return properties.get("debrief:schema_version") if isinstance(properties, dict) else None
    if kind is DocumentKind.STAC_CATALOG:
        return document.get("debrief:schema_version")
    raise AssertionError(kind)


def _check_version(kind: DocumentKind, document: Any) -> None:
    if kind not in (DocumentKind.PLOT, DocumentKind.STAC_ITEM, DocumentKind.STAC_CATALOG):
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


def _feature_problems(feature: Any, track_ids: set[str] | None) -> list[str]:
    """track_ids is None where the containing plot is not known, as in a tool result."""
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

    elif props.kind == "annotation":
        if feature.geometry is None and props.time is None and props.time_range is None:
            problems.append(f"{where}: an annotation without geometry needs a time or time range")
        problems += _time_range_problems(where, props.time_range)

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
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    problems += [f"feature id {i!r} is used more than once" for i in duplicates]
    track_ids = {f.id for f in plot.features if f.properties.kind == "track"}
    for feature in plot.features:
        problems += _feature_problems(feature, track_ids)
    known = set(ids)
    for named_set in plot.named_sets or []:
        missing = [i for i in named_set.feature_ids if i not in known]
        if missing:
            problems.append(f"named set {named_set.id}: unknown features {missing}")
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
    return problems


def _value_matches(kind: str, quantity_kind: Any, value: Any) -> bool:
    quantity_types = {
        "length": g.Length,
        "speed": g.Speed,
        "angle": g.Angle,
        "duration": g.Duration,
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
    names = [p.name for p in tool.parameters or []]
    problems += [
        f"parameter {n!r} is declared more than once"
        for n in sorted(set(names))
        if names.count(n) > 1
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
    return problems


def _state_problems(state: g.SharedState | g.SharedStateChange) -> list[str]:
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


# The newest per-user configuration layout this build understands.
CONFIG_VERSION = 1


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


# Members each webview message kind must carry (CON-08). Shared with TypeScript
# through schemas/vectors/webview-messages.json, which a test checks matches.
MESSAGE_MEMBERS: dict[str, tuple[str, ...]] = {
    "ready": (),
    "show_plot": ("plot", "plot_title", "selection"),
    "set_selection": ("selection",),
    "selection_changed": ("selection",),
    "viewport_changed": ("viewport",),
    "show_form": ("tool", "selected_names"),
    "run_tool": ("tool_name", "parameters"),
    "cancel": (),
    "form_busy": ("message",),
    "form_error": ("message",),
    "show_results": ("result_title", "result"),
}


def _webview_message_problems(message: g.WebviewMessage, raw: dict[str, Any]) -> list[str]:
    kind = str(message.kind)
    needed = MESSAGE_MEMBERS[kind]
    problems = [f"{kind} needs {member}" for member in needed if member not in raw]
    problems += [
        f"{kind} does not carry {member}" for member in sorted(set(raw) - {"kind", *needed})
    ]
    if message.plot is not None:
        problems += _plot_problems(message.plot, raw["plot"])
    if message.result is not None:
        problems += _tool_result_problems(message.result, raw["result"])
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
    }.get(kind, ())
    for name in feature_lists:
        for feature in document.get(name, []):
            for member in _NULLABLE_REQUIRED_FEATURE_MEMBERS:
                feature.setdefault(member, None)
    return document


# --- Public API -----------------------------------------------------------------


def load_document(kind: DocumentKind | str, source: str | bytes | dict[str, Any]) -> Any:
    """Parse and fully validate a document. Never returns a partially loaded one."""
    kind = DocumentKind(kind)
    document = json.loads(source) if isinstance(source, (str, bytes)) else source
    _check_version(kind, document)

    errors = sorted(_validator(kind).iter_errors(document), key=lambda e: list(e.path))
    if errors:
        raise DocumentValidationError(
            [f"{'/'.join(map(str, e.path)) or '<root>'}: {e.message}" for e in errors]
        )

    model = _MODELS[kind].model_validate(_to_model_shape(kind, document))
    problems = _RULES[kind](model, document)
    if problems:
        raise DocumentValidationError(problems)
    return model


def dump_document(kind: DocumentKind | str, model: BaseModel) -> str:
    """Serialise a document, validating it first so an invalid file is never written."""
    kind = DocumentKind(kind)
    document = _to_json_shape(kind, model.model_dump(mode="json", by_alias=True, exclude_none=True))
    load_document(kind, document)
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def load_plot(source: str | bytes | dict[str, Any]) -> g.DebriefFeatureCollection:
    return load_document(DocumentKind.PLOT, source)


def dump_plot(plot: g.DebriefFeatureCollection) -> str:
    return dump_document(DocumentKind.PLOT, plot)
