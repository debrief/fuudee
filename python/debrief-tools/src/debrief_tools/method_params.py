"""The parameters of the tool service's debrief/ methods, each a Params model (methods.py).

Each field's Refusal is what the service says when that field is wrong, in the words it
has always used; the first field found wrong says it. Members a method passes on as they
are (an annotation, a track edit, a TMA request) are checked here only for being objects:
the catalogue reads them and says what is wrong in its own words. Their schema is the
schema's own model (AnnotationSpec, TrackEdit, TmaRequest, NarrativeSpec, ToteView,
PlotView), for Method.input_schema.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    BeforeValidator,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    WithJsonSchema,
    model_validator,
)

from debrief_kernel.time import parse_utc
from debrief_kernel.units import IncompatibleUnitsError
from debrief_kernel.units import Quantity as UnitQuantity
from debrief_schemas import models
from debrief_schemas.documents import DocumentValidationError, load_view
from debrief_stac import frequencies
from debrief_tools.methods import Params, Refusal, Refused, shaped

QUANTITY = {
    "type": "object",
    "required": ["value", "unit"],
    "properties": {"value": {"type": "number"}, "unit": {"type": "string"}},
}

# Shapes the methods share.

Features = list[StrictStr]
SomeIds = Annotated[list[StrictStr], Field(min_length=1)]
QuantityObject = Annotated[dict[str, Any], WithJsonSchema(QUANTITY)]


def _a_period(value: Any) -> tuple[str, str] | None:
    """A period given as {start, end}, UTC times; None if not given."""
    if value is None:
        return None
    if not (
        isinstance(value, dict)
        and isinstance(value.get("start"), str)
        and isinstance(value.get("end"), str)
    ):
        raise ValueError("not a period")
    return value["start"], value["end"]


Period = Annotated[
    tuple[str, str] | None,
    BeforeValidator(_a_period, json_schema_input_type=models.TimeRange | None),
    Refusal("period must be {start, end}, each a UTC time"),
]


def _a_speed(value: Any) -> UnitQuantity | None:
    """A speed given as {value, unit}; None if not given."""
    if value is None:
        return None
    try:
        quantity = UnitQuantity(float(value["value"]), str(value["unit"]))
        quantity.to("m/s")
    except (KeyError, TypeError, ValueError, IncompatibleUnitsError):
        raise ValueError("not a speed") from None
    return quantity


Speed = Annotated[
    UnitQuantity | None,
    BeforeValidator(_a_speed, json_schema_input_type=QuantityObject | None),
    Refusal('threshold must be a speed, such as {"value": 30, "unit": "[kn_i]"}'),
]


def _a_time(value: Any) -> int | None:
    """A UTC time given as text, in milliseconds; None if not given."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("not text")
    return parse_utc(value)


def _a_time_said(value: Any) -> int:
    """A UTC time given as text, in milliseconds; when the text is not one, why."""
    if not isinstance(value, str):
        raise ValueError("not text")
    try:
        return parse_utc(value)
    except ValueError as error:
        raise Refused(f"time: {error}") from None


UtcTime = Annotated[
    int | None,
    BeforeValidator(_a_time, json_schema_input_type=str | None),
    Refusal("{field} must be a UTC time, such as 2026-10-11T09:30:00.000Z"),
]


def _a_file(value: Any) -> str:
    if not isinstance(value, str) or not Path(value).is_file():
        raise Refused(f"{value} is not a file.")
    return value


# A file the method reads: left out, None is not a file either.
File = Annotated[str, BeforeValidator(_a_file, json_schema_input_type=str)]


# debrief/ methods that take parameters of their own, in the order METHODS registers them.


class ToolsForSelection(Params):
    kinds: Annotated[Features, Refusal("kinds must be a list of feature kinds")]


def _not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("blank")
    return value


class CreateCatalogue(Params):
    location: Annotated[StrictStr, Refusal("create_catalogue needs a location and a title")]
    title: Annotated[
        StrictStr,
        AfterValidator(_not_blank),
        Refusal("create_catalogue needs a location and a title"),
    ]


class Import(Params):
    # path, store and agent are read in turn by the handler, the store first.
    modes: Annotated[
        StrictStr | dict[str, Any] | None,
        Refusal("modes is otg or dr, or one of them for each track."),
    ] = None
    remembered: Annotated[
        StrictStr | None, Refusal("modes is otg or dr, or one of them for each track.")
    ] = None


class RepTracks(Params):
    path: File = Field(None, validate_default=True)


class PreviewNarrative(Params):
    path: File = Field(None, validate_default=True)
    item: Annotated[StrictStr | None, Refusal("item is the plot's id")] = None


class PreviewSensor(Params):
    path: File = Field(None, validate_default=True)
    item: Annotated[StrictStr, Refusal("preview_sensor needs the plot (store and item)")]


def _a_tote(value: Any) -> Any:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise Refused("tote must be {primary, secondaries, measure_group}")
    try:
        return load_view({"tote": value}).tote
    except DocumentValidationError as error:
        raise Refused("; ".join(error.problems)) from None


class Tote(Params):
    item: Annotated[StrictStr, Refusal("tote needs a store, an item and a time")]
    time: Annotated[
        int,
        BeforeValidator(_a_time_said, json_schema_input_type=str),
        Refusal("tote needs a store, an item and a time"),
    ]
    tote: Annotated[
        Any, BeforeValidator(_a_tote, json_schema_input_type=models.ToteView | None)
    ] = None


class Goto(Params):
    step: Annotated[StrictInt, Refusal("goto needs the step to return to")]


class Restyle(Params):
    features: Annotated[Features, Refusal("{method} needs the features to change")]


class SetColour(Restyle):
    colour: Annotated[StrictStr, Refusal("set_colour needs a colour, such as #e01c3e")]
    colour_name: Annotated[
        StrictStr | None, Refusal("set_colour needs a colour, such as #e01c3e")
    ] = None


class SetHidden(Restyle):
    hidden: Annotated[StrictBool, Refusal("set_hidden needs hidden, true or false")]


class SetTrackFrequencies(Restyle):
    # Each a duration ({value, unit}, seconds, or text such as "10 min"), "off", or null
    # for the default; read by debrief_stac.frequencies.
    label_interval: Any = None
    symbol_interval: Any = None
    arrow_interval: Any = None

    @model_validator(mode="after")
    def _some(self) -> SetTrackFrequencies:
        if not self.model_fields_set & set(frequencies.FIELDS):
            raise Refused(
                "set_track_frequencies needs label_interval, symbol_interval or "
                'arrow_interval: a duration such as "10 min", "off", or null for the default'
            )
        return self


class SetView(Params):
    view: Annotated[
        Annotated[dict[str, Any], shaped(models.PlotView)] | None,
        Refusal("set_view needs the view and the hash last read"),
    ] = None
    hash: Annotated[StrictStr, Refusal("set_view needs the view and the hash last read")]


class AddAnnotation(Params):
    annotation: Annotated[
        dict[str, Any],
        shaped(models.AnnotationSpec),
        Refusal("add_annotation needs the annotation to add"),
    ]


class EditAnnotation(Params):
    feature: Annotated[StrictStr, Refusal("edit_annotation needs the feature and its changes")]
    annotation: Annotated[
        dict[str, Any],
        shaped(models.AnnotationSpec),
        Refusal("edit_annotation needs the feature and its changes"),
    ]


class DeleteAnnotations(Params):
    features: Annotated[Features, Refusal("delete_annotations needs the features to delete")]


class SetNorthArrow(Params):
    shown: Annotated[StrictBool, Refusal("set_north_arrow needs shown, true or false")]


class AddNarrative(Params):
    entry: Annotated[
        dict[str, Any],
        shaped(models.NarrativeSpec),
        Refusal("add_narrative needs the entry to add"),
    ]


class EditNarrative(Params):
    feature: Annotated[StrictStr, Refusal("edit_narrative needs the feature and its changes")]
    entry: Annotated[
        dict[str, Any],
        shaped(models.NarrativeSpec),
        Refusal("edit_narrative needs the feature and its changes"),
    ]


class DeleteNarrative(Params):
    features: Annotated[Features, Refusal("delete_narrative needs the entries to delete")]


class ImportNarrative(Params):
    # With the analyst's choices (types, within_period, tracks, platform), read by
    # debrief_io.Choices, and duplicates.
    path: Annotated[StrictStr, Refusal("import_narrative needs the path of the file to read")]


NARRATIVE_LIMIT = 1000


class NarrativeQuery(Params):
    text: Annotated[StrictStr | None, Refusal("text must be text to find")] = None
    offset: Annotated[
        StrictInt,
        Field(ge=0),
        Refusal("offset and limit must be whole numbers, not negative"),
    ] = 0
    limit: Annotated[
        StrictInt,
        Field(ge=0),
        Refusal("offset and limit must be whole numbers, not negative"),
    ] = NARRATIVE_LIMIT
    sources: Annotated[Features | None, Refusal("{field} must be a list of names")] = None
    types: Annotated[Features | None, Refusal("{field} must be a list of names")] = None
    start: UtcTime = None
    end: UtcTime = None
    at: UtcTime = None


def _a_window(value: Any) -> tuple[int, int] | None:
    period = _a_period(value)
    if period is None:
        return None
    try:
        return parse_utc(period[0]), parse_utc(period[1])
    except ValueError as error:
        raise Refused(f"period: {error}") from None


class SensorQuery(Params):
    sensor_ids: Annotated[Features | None, Refusal("sensor_ids must be a list of sensor ids")] = (
        None
    )
    cuts: Annotated[StrictBool, Refusal("cuts is true or false")] = False
    period: Annotated[
        tuple[int, int] | None,
        BeforeValidator(_a_window, json_schema_input_type=models.TimeRange | None),
        Refusal("period must be {start, end}, each a UTC time"),
    ] = None


# What debrief/resolve_ambiguity passes to debrief_stac.sensors, which checks it and says
# what is wrong in its own words.
RESOLVE_ASKED = ("keep", "cut_ids", "other_cut_ids", "clear_cut_ids", "sensor_ids", "period")


class ImportSensor(Params):
    path: Annotated[StrictStr, Refusal("import_sensor needs the path of the file to read")]
    hosts: Annotated[
        dict[str, StrictStr | None] | None,
        Refusal("hosts gives, for a track name, a track's id, or null"),
    ] = None
    again: Annotated[StrictBool, Refusal("again is true or false")] = False


class SetArrayOffset(Params):
    sensor_ids: Annotated[SomeIds, Refusal("set_array_offset needs sensor_ids")]
    offset: Annotated[
        QuantityObject | None, Refusal("offset is {value, unit}, or null for none")
    ] = None
    # worm_in_hole (legacy's default) or plain, read by debrief_stac.sensors.
    mode: Any = "worm_in_hole"


class DeleteCuts(Params):
    cut_ids: Annotated[SomeIds, Refusal("delete_cuts needs cut_ids")]


class TmaResiduals(Params):
    feature: Annotated[StrictStr, Refusal("tma_residuals needs the solution (feature)")]


class TmaCreate(Params):
    # Left out, the request is read from the params themselves (TmaRequest's members).
    request: Annotated[
        dict[str, Any],
        shaped(models.TmaRequest),
        Refusal("tma_create takes the request as an object"),
    ] = None  # type: ignore[assignment]  # left out only: null is refused


# What debrief/tma_create reads from its params when no request object is given.
TMA_ASKED = frozenset(models.TmaRequest.model_fields)


class TmaSolution(Params):
    feature: Annotated[StrictStr, Refusal("{name} needs the solution (feature)")]


class TmaSplitLeg(TmaSolution):
    at: Annotated[StrictStr, Refusal("tma_split_leg needs the time (at), and join true or false")]
    join: Annotated[
        StrictBool, Refusal("tma_split_leg needs the time (at), and join true or false")
    ] = False
    side: Annotated[
        Literal["before", "after"] | None,
        Refusal(
            'side is "before" or "after": the fix at at starts the new leg, or ends the earlier one'
        ),
    ] = None


class TmaExcludeCut(TmaSolution):
    cut_ids: Annotated[SomeIds, Refusal("tma_exclude_cut needs cut_ids")]
    excluded: Annotated[StrictBool, Refusal("excluded is true or false")] = True


class EditTrack(Params):
    feature: Annotated[StrictStr, Refusal("edit_track needs the feature and the edit")]
    edit: Annotated[
        dict[str, Any],
        shaped(models.TrackEdit),
        Refusal("edit_track needs the feature and the edit"),
    ]
    current_time: Annotated[StrictStr | None, Refusal("current_time must be a UTC time")] = None


class SplitTrack(Params):
    feature: Annotated[StrictStr, Refusal("split_track needs the feature and the time (at)")]
    at: Annotated[StrictStr, Refusal("split_track needs the feature and the time (at)")]
    names: Annotated[
        Annotated[list[StrictStr], Field(min_length=2, max_length=2)] | None,
        Refusal("names must be two names, one for each part"),
    ] = None


class MergeTracks(Params):
    features: Annotated[Features, Refusal("merge_tracks needs the tracks to merge")]
    name: Annotated[StrictStr | None, Refusal("name must be text")] = None


class Cleaning(Params):
    feature: Annotated[StrictStr, Refusal("{method} needs the track (feature)")]
    period: Period = None


class FindJumps(Cleaning):
    threshold: Speed = None


class RemoveJumps(Cleaning):
    times: Annotated[Features, Refusal("remove_jumps needs the times of the fixes to remove")]
    threshold: Speed = None


class Smoothing(Cleaning):
    window: Annotated[StrictInt, Refusal("{method} needs the window: an odd number of fixes")]


class MarkFix(Cleaning):
    time: Annotated[StrictStr, Refusal("mark_fix needs the time of the fix and its changes")]
    # colour, label, comment, show_label, show_symbol, read by debrief_stac.
    changes: Annotated[
        dict[str, Any], Refusal("mark_fix needs the time of the fix and its changes")
    ]
    colour_name: Annotated[StrictStr | None, Refusal("colour_name must be text")] = None


def _source_said(message: str, *members: str) -> AfterValidator:
    """A source with these members as text, or refused with the message."""

    def check(source: dict[str, Any]) -> dict[str, Any]:
        if not all(isinstance(source.get(m), str) for m in members):
            raise Refused(message)
        return source

    return AfterValidator(check)


SOURCE = Refusal("{method} needs the source: its catalogue and item")


class TakeNewData(Params):
    source: Annotated[
        dict[str, Any],
        _source_said("take_new_data needs source {catalogue, item}", "catalogue", "item"),
        SOURCE,
    ]


class DismissNewData(Params):
    source: Annotated[
        dict[str, Any],
        _source_said(
            "dismiss_new_data needs source {catalogue, item, revision}",
            "catalogue",
            "item",
            "revision",
        ),
        SOURCE,
    ]


class TrackSource(Params):
    source: Annotated[dict[str, Any], SOURCE]
    feature: Annotated[StrictStr, Refusal("{method} needs the plot's track (feature)")]


class SetSourcePreference(TrackSource):
    period: Annotated[
        Annotated[dict[str, Any], shaped(models.TimeRange)],
        Refusal("set_source_preference needs the period"),
    ]


class LinkTracks(TrackSource):
    linked: Annotated[StrictBool, Refusal("link_tracks needs linked, true or false")]
