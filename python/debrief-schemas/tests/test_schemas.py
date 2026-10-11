"""Schema tests: golden fixtures, round trip, and Pydantic/JSON Schema agreement.

Fixtures live in schemas/fixtures/<kind>/ as valid/, invalid/schema/ (rejected
by JSON Schema, so by both languages) and invalid/semantic/ (structurally
valid, rejected by the Python rules only).
"""

import json
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft201909Validator

from debrief_schemas import (
    SCHEMA_VERSION,
    DocumentKind,
    DocumentValidationError,
    SchemaVersionError,
    dump_document,
    load_document,
    load_plot,
)
from debrief_schemas.documents import _MODELS, _to_model_shape
from debrief_schemas.generated import debrief as generated

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "schemas" / "fixtures"
SCHEMA_SOURCE = ROOT / "schemas" / "linkml" / "debrief.yaml"
JSON_SCHEMA = ROOT / "schemas" / "generated" / "debrief.schema.json"


def _cases(folder: str) -> list[tuple[DocumentKind, Path]]:
    return [
        (kind, path)
        for kind in DocumentKind
        for path in sorted((FIXTURES / kind.value / folder).glob("*.json"))
    ]


def _id(case: tuple[DocumentKind, Path]) -> str:
    return f"{case[0].value}/{case[1].stem}"


def test_every_kind_has_valid_and_invalid_fixtures() -> None:
    for kind in DocumentKind:
        assert list((FIXTURES / kind.value / "valid").glob("*.json")), kind
        assert list((FIXTURES / kind.value / "invalid" / "schema").glob("*.json")), kind


@pytest.mark.parametrize("case", _cases("valid"), ids=_id)
def test_valid_fixture_loads_and_round_trips(case: tuple[DocumentKind, Path]) -> None:
    kind, path = case
    original = json.loads(path.read_text())
    assert json.loads(dump_document(kind, load_document(kind, original))) == original


@pytest.mark.parametrize("case", _cases("invalid/schema"), ids=_id)
def test_schema_fixture_rejected_by_both_validators(case: tuple[DocumentKind, Path]) -> None:
    kind, path = case
    document = json.loads(path.read_text())
    try:
        load_document(kind, document)
    except SchemaVersionError:
        return  # refused before either validator runs
    except DocumentValidationError:
        pass
    else:
        pytest.fail("accepted")
    # Pydantic must agree with JSON Schema on every structural rejection.
    with pytest.raises(ValueError):
        _MODELS[kind].model_validate(_to_model_shape(kind, document))


@pytest.mark.parametrize("case", _cases("invalid/semantic"), ids=_id)
def test_semantic_fixture_passes_json_schema_but_is_rejected(
    case: tuple[DocumentKind, Path],
) -> None:
    kind, path = case
    document = json.loads(path.read_text())
    schema = json.loads(JSON_SCHEMA.read_text())
    validator = Draft201909Validator(
        {"$defs": schema["$defs"], "$ref": f"#/$defs/{_MODELS[kind].__name__}"}
    )
    assert not list(validator.iter_errors(document)), "belongs in invalid/schema"
    with pytest.raises(DocumentValidationError):
        load_document(kind, document)


def test_newer_schema_refused_with_version_named() -> None:
    document = json.loads((FIXTURES / "plot" / "valid" / "minimal-track.json").read_text())
    document["schema_version"] = "99.0.0"
    with pytest.raises(SchemaVersionError, match="99.0.0"):
        load_plot(document)


def test_schema_version_matches_linkml_source() -> None:
    source = yaml.safe_load(SCHEMA_SOURCE.read_text())
    assert source["version"] == SCHEMA_VERSION


def test_fixtures_use_current_schema_version() -> None:
    for kind in (DocumentKind.PLOT, DocumentKind.STAC_ITEM, DocumentKind.STAC_CATALOG):
        for path in (FIXTURES / kind.value / "valid").glob("*.json"):
            assert SCHEMA_VERSION in path.read_text(), path


def test_pydantic_and_json_schema_declare_same_fields() -> None:
    """Every class has the same fields and required set in both generated outputs."""
    defs = json.loads(JSON_SCHEMA.read_text())["$defs"]
    for name, definition in defs.items():
        if "properties" not in definition or name.endswith("__identifier_optional"):
            continue  # enums, and JSON Schema's keyed-map variant of a class
        model = getattr(generated, name)
        fields = {(f.alias or n): f for n, f in model.model_fields.items() if n != "linkml_meta"}
        assert set(fields) == set(definition["properties"]), name
        required = {n for n, f in fields.items() if f.is_required()}
        assert required == set(definition.get("required", [])), name


def test_webview_message_members_match_shared_table() -> None:
    from debrief_schemas.documents import MESSAGE_MEMBERS

    table = json.loads((ROOT / "schemas" / "vectors" / "webview-messages.json").read_text())
    assert table["members"] == {k: list(v) for k, v in MESSAGE_MEMBERS.items()}
    assert set(table["members"]) == {k.value for k in generated.WebviewMessageKindEnum}
