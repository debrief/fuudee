"""Read and write plot files against the data-file schema.

Validation runs in three layers, in order:

1. Schema version (SUB-14): a newer file is refused before anything else is read.
2. JSON Schema generated from LinkML: the same check the TypeScript side runs.
3. Rules LinkML cannot express, such as parallel arrays matching the geometry.
   These live here only, in Python (PRN-03).
"""

from __future__ import annotations

import json
from functools import cache
from importlib.resources import files
from typing import Any

from jsonschema import Draft201909Validator

from debrief_schemas.generated.debrief import DebriefFeatureCollection
from debrief_schemas.generated.schema_version import SCHEMA_VERSION


class SchemaVersionError(ValueError):
    """The file was written against a schema version this build cannot open."""

    def __init__(self, found: str | None, supported: str = SCHEMA_VERSION):
        self.found = found
        self.supported = supported
        if found is None:
            message = "The file does not record a data-file schema version."
        elif _parse_version(found) > _parse_version(supported):
            message = (
                f"This plot needs data-file schema {found}; this version of Debrief "
                f"supports up to {supported}. Update Debrief to open it."
            )
        else:
            message = (
                f"This plot uses data-file schema {found}, which this version of Debrief "
                f"cannot migrate. It supports {supported}."
            )
        super().__init__(message)


class PlotValidationError(ValueError):
    """The file does not conform to the data-file schema."""

    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("; ".join(problems))


def _parse_version(version: str) -> tuple[int, int, int]:
    major, minor, patch = (int(part) for part in version.split("."))
    return major, minor, patch


@cache
def _validator() -> Draft201909Validator:
    schema_text = files("debrief_schemas.generated").joinpath("debrief.schema.json").read_text()
    return Draft201909Validator(json.loads(schema_text))


def _check_version(document: Any) -> None:
    found = document.get("schema_version") if isinstance(document, dict) else None
    if not isinstance(found, str):
        raise SchemaVersionError(None)
    try:
        parsed = _parse_version(found)
    except ValueError:
        raise PlotValidationError([f"schema_version {found!r} is not a semantic version"]) from None
    # Before 1.0.0 there is no migration guarantee (SUB-13), so only an exact match opens.
    if parsed != _parse_version(SCHEMA_VERSION):
        raise SchemaVersionError(found)


def _semantic_problems(plot: DebriefFeatureCollection) -> list[str]:
    problems = []
    for feature in plot.features:
        positions = feature.geometry.coordinates
        for index, (longitude, latitude) in enumerate(positions):
            if not -180 <= longitude <= 180:
                problems.append(f"{feature.id}: longitude {longitude} at position {index}")
            if not -90 <= latitude <= 90:
                problems.append(f"{feature.id}: latitude {latitude} at position {index}")
        props = feature.properties
        series = {
            "times": props.times,
            "speeds": props.speeds.values if props.speeds else None,
            "courses": props.courses.values if props.courses else None,
        }
        for name, values in series.items():
            if values is not None and len(values) != len(positions):
                problems.append(
                    f"{feature.id}: {name} has {len(values)} entries for {len(positions)} positions"
                )
    return problems


def load_plot(source: str | bytes | dict[str, Any]) -> DebriefFeatureCollection:
    """Parse and fully validate a plot. Never returns a partially loaded plot."""
    document = json.loads(source) if isinstance(source, (str, bytes)) else source
    _check_version(document)

    schema_errors = sorted(_validator().iter_errors(document), key=lambda e: list(e.path))
    if schema_errors:
        raise PlotValidationError(
            [f"{'/'.join(map(str, e.path)) or '<root>'}: {e.message}" for e in schema_errors]
        )

    plot = DebriefFeatureCollection.model_validate(document)
    problems = _semantic_problems(plot)
    if problems:
        raise PlotValidationError(problems)
    return plot


def dump_plot(plot: DebriefFeatureCollection) -> str:
    """Serialise a plot, validating it first so an invalid file is never written."""
    document = plot.model_dump(mode="json", exclude_none=True)
    load_plot(document)
    return json.dumps(document, indent=2) + "\n"
