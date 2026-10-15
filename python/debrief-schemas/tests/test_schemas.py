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


def test_text_that_passed_is_not_checked_again(monkeypatch) -> None:
    from debrief_schemas import documents

    checked: list[DocumentKind] = []
    real = documents._validator

    def counting(kind):
        checked.append(kind)
        return real(kind)

    fixture = (FIXTURES / "plot" / "valid" / "mixed-features.json").read_text()
    text = dump_document(DocumentKind.PLOT, load_document(DocumentKind.PLOT, fixture))
    monkeypatch.setattr(documents, "_validator", counting)
    monkeypatch.setattr(documents, "_PASSED", set())
    plot = load_document(DocumentKind.PLOT, text)
    again = load_document(DocumentKind.PLOT, text)
    assert checked == [DocumentKind.PLOT] and again == plot and again is not plot
    # Written out just as it was read: the same text, so not checked again either.
    assert dump_document(DocumentKind.PLOT, plot) == text
    assert checked == [DocumentKind.PLOT]
    # A changed text is checked in full, and one that fails is never remembered.
    broken = text.replace('"Feature"', '"Thing"', 1)
    for _ in range(2):
        with pytest.raises(DocumentValidationError):
            load_document(DocumentKind.PLOT, broken)
    assert checked == [DocumentKind.PLOT] * 3
    # The schema version is still checked every time.
    monkeypatch.setattr(documents, "SCHEMA_VERSION", "9.9.9")
    with pytest.raises(SchemaVersionError):
        load_document(DocumentKind.PLOT, text)


# --- Features checked one at a time, and only once ------------------------------------


@pytest.mark.parametrize("case", _cases("invalid/schema"), ids=_id)
def test_schema_problems_are_those_of_checking_the_document_whole(
    case: tuple[DocumentKind, Path],
) -> None:
    """Feature lists are checked one feature at a time: the problems found, and their
    order, are those of checking the whole document at once."""
    from debrief_schemas import documents

    kind, path = case
    document = json.loads(path.read_text())
    whole = documents._class_validator(_MODELS[kind].__name__)
    expected = [
        f"{'/'.join(map(str, e.path)) or '<root>'}: {e.message}"
        for e in sorted(whole.iter_errors(document), key=lambda e: list(e.path))
    ]
    try:
        load_document(kind, document)
    except SchemaVersionError:
        return
    except DocumentValidationError as error:
        assert error.problems == expected
    else:
        pytest.fail("accepted")


def test_a_feature_that_passed_is_not_checked_again(monkeypatch) -> None:
    """A plot of tens of megabytes changed by one note has only that note checked
    against JSON Schema; a feature that fails is never remembered."""
    from debrief_schemas import documents

    checked: list[str] = []
    real = documents._feature_errors

    def counting(check, item):
        checked.append(item.get("id"))
        return real(check, item)

    fixture = (FIXTURES / "plot" / "valid" / "mixed-features.json").read_text()
    text = dump_document(DocumentKind.PLOT, load_document(DocumentKind.PLOT, fixture))
    monkeypatch.setattr(documents, "_feature_errors", counting)
    monkeypatch.setattr(documents, "_FEATURES_PASSED", set())
    monkeypatch.setattr(documents, "_PASSED", set())
    plot = load_document(DocumentKind.PLOT, text)  # as Debrief wrote it
    assert checked == [f.id for f in plot.features]
    checked.clear()
    note = generated.AnnotationFeature(
        type="Feature",
        id="note-new",
        geometry=None,
        properties=generated.AnnotationProperties(
            kind="annotation", style="note", name="New", time="2026-10-11T09:30:00.000Z"
        ),
    )
    bigger = plot.model_copy(update={"features": [*plot.features, note]})
    dump_document(DocumentKind.PLOT, bigger)
    assert checked == ["note-new"]
    checked.clear()
    raw = json.loads(text)
    raw["features"][0]["properties"]["kind"] = "nonsense"
    for _ in range(2):
        with pytest.raises(DocumentValidationError, match="^features/0: "):
            load_document(DocumentKind.PLOT, raw)
    assert checked == [raw["features"][0]["id"]] * 2


def test_the_quick_check_of_narrative_entries_is_never_more_lenient_than_the_schema() -> None:
    """Sixty thousand entries are checked by hand, not by the JSON Schema library
    (NFR-06); every entry the quick check passes, the schema passes too."""
    from debrief_schemas import documents

    good = {
        "type": "Feature",
        "id": "narrative-0001",
        "geometry": None,
        "properties": {
            "kind": "narrative",
            "time": "2026-10-11T09:30:00.000Z",
            "source": "BLUE ONE",
            "entry_type": "Sonar",
            "text": "Contact.",
            "track_id": "track-blue-one",
        },
    }

    def variant(path: tuple[str, ...], value: object) -> dict:
        item = json.loads(json.dumps(good))
        where = item
        for key in path[:-1]:
            where = where[key]
        if value is KeyError:
            where.pop(path[-1])
        else:
            where[path[-1]] = value
        return item

    variants = [good]
    for key in ("type", "id", "geometry", "properties"):
        variants += [variant((key,), KeyError), variant((key,), 7), variant((key,), "x")]
    for key in ("kind", "time", "source", "entry_type", "text", "track_id"):
        variants += [
            variant(("properties", key), KeyError),
            variant(("properties", key), None),
            variant(("properties", key), 7),
            variant(("properties", key), ["a"]),
        ]
    variants += [
        variant(("properties", "time"), "2026-10-11T09:30:00Z"),
        variant(("properties", "time"), "2026-10-11T09:30:00.000Z\n"),
        variant(("properties", "kind"), "annotation"),
        variant(("properties", "colour"), "#ffffff"),
        variant(("extra",), 1),
        variant(("geometry",), {"type": "Point", "coordinates": [0, 0]}),
        variant(("properties", "provenance"), []),
    ]
    schema = documents._class_validator("NarrativeFeature")
    for item in [*variants, None, [], "x"]:
        if documents._plain_narrative(item):
            assert schema.is_valid(item), item
    assert documents._plain_narrative(good)


def test_many_features_are_checked_for_duplicate_ids_quickly() -> None:
    """Counting each id across the list made a plot of 50,000 notes take half a minute."""
    import time

    from debrief_schemas.documents import _plot_problems

    notes = [
        generated.AnnotationFeature(
            type="Feature",
            id=f"n{i}",
            geometry=None,
            properties=generated.AnnotationProperties(
                kind="annotation", style="note", name="N", time="2026-10-11T09:30:00.000Z"
            ),
        )
        for i in range(20_000)
    ]
    plot = generated.DebriefFeatureCollection(
        type="FeatureCollection",
        schema_version=SCHEMA_VERSION,
        features=[*notes, notes[0]],
        provenance=[],
    )
    started = time.perf_counter()
    problems = _plot_problems(plot, {"features": []})
    assert time.perf_counter() - started < 2
    assert problems == ["feature id 'n0' is used more than once"]
