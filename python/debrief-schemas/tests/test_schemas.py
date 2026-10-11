"""Schema tests: golden fixtures, round trip, and Pydantic/JSON Schema agreement."""

import json
from pathlib import Path

import pytest
import yaml

from debrief_schemas import (
    SCHEMA_VERSION,
    DebriefFeatureCollection,
    PlotValidationError,
    SchemaVersionError,
    dump_plot,
    load_plot,
)
from debrief_schemas.generated import debrief as generated

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "schemas" / "fixtures"
SCHEMA_SOURCE = ROOT / "schemas" / "linkml" / "debrief.yaml"
JSON_SCHEMA = ROOT / "schemas" / "generated" / "debrief.schema.json"


def _fixtures(folder: str) -> list[Path]:
    paths = sorted((FIXTURES / folder).glob("*.json"))
    assert paths, f"no fixtures in {folder}"
    return paths


@pytest.mark.parametrize("path", _fixtures("valid"), ids=lambda p: p.stem)
def test_valid_fixture_loads(path: Path) -> None:
    plot = load_plot(path.read_text())
    assert plot.schema_version == SCHEMA_VERSION


@pytest.mark.parametrize(
    "path", _fixtures("invalid/schema") + _fixtures("invalid/semantic"), ids=lambda p: p.stem
)
def test_invalid_fixture_rejected(path: Path) -> None:
    with pytest.raises((PlotValidationError, SchemaVersionError)):
        load_plot(path.read_text())


@pytest.mark.parametrize("path", _fixtures("invalid/schema"), ids=lambda p: p.stem)
def test_pydantic_alone_rejects_schema_fixtures(path: Path) -> None:
    """Pydantic and JSON Schema must agree on everything JSON Schema rejects."""
    document = json.loads(path.read_text())
    if "schema_version" not in document:
        pytest.skip("caught by the version check before either validator")
    with pytest.raises(ValueError):
        DebriefFeatureCollection.model_validate(document)


@pytest.mark.parametrize("path", _fixtures("valid"), ids=lambda p: p.stem)
def test_round_trip_is_lossless(path: Path) -> None:
    original = json.loads(path.read_text())
    assert json.loads(dump_plot(load_plot(original))) == original


def test_newer_schema_refused_with_version_named() -> None:
    document = json.loads((FIXTURES / "valid" / "minimal-track.json").read_text())
    document["schema_version"] = "99.0.0"
    with pytest.raises(SchemaVersionError, match="99.0.0"):
        load_plot(document)


def test_schema_version_matches_linkml_source() -> None:
    source = yaml.safe_load(SCHEMA_SOURCE.read_text())
    assert source["version"] == SCHEMA_VERSION


def test_pydantic_and_json_schema_declare_same_fields() -> None:
    """Every class has the same fields and required set in both generated outputs."""
    defs = json.loads(JSON_SCHEMA.read_text())["$defs"]
    for name, definition in defs.items():
        if "properties" not in definition:
            continue  # enums
        model = getattr(generated, name)
        fields = {n for n in model.model_fields if n != "linkml_meta"}
        required = {n for n, f in model.model_fields.items() if f.is_required()}
        assert fields == set(definition["properties"]), name
        assert required == set(definition.get("required", [])), name
