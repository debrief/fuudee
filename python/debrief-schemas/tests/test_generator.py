"""The generator's own passes over LinkML's output (scripts/generate_schemas.py), on a
schema small enough to read: a discriminated union, and type patterns on slots."""

import importlib.util
import json
from pathlib import Path

import pytest
from jsonschema import Draft201909Validator
from linkml.generators.jsonschemagen import JsonSchemaGenerator
from linkml.generators.pydanticgen import PydanticGenerator
from linkml_runtime.utils.schemaview import SchemaView

ROOT = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location(
    "generate_schemas", ROOT / "scripts/generate_schemas.py"
)
generator = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(generator)

SCHEMA = """
id: https://example.org/t
name: t
prefixes: {linkml: https://w3id.org/linkml/}
default_prefix: t
default_range: string
imports: [linkml:types]
types:
  Stamp: {typeof: string, pattern: "^\\\\d{4}$"}
enums:
  KindEnum: {permissible_values: {a: {}, b: {}, c: {}}}
slots:
  name: {}
  stamp: {range: Stamp}
classes:
  Base:
    abstract: true
    annotations: {union: Message, discriminator: kind}
    attributes:
      kind: {range: KindEnum, required: true}
  AMessage:
    is_a: Base
    slots: [name, stamp]
    slot_usage:
      kind: {equals_string: a}
      name: {required: true}
  BcMessage:
    is_a: Base
    slot_usage:
      kind: {equals_string_in: [b, c]}
"""


def _view(tmp_path: Path, text: str = SCHEMA) -> SchemaView:
    path = tmp_path / "t.yaml"
    path.write_text(text)
    view = SchemaView(str(path))
    view.merge_imports()
    generator._push_type_patterns_to_slots(view)
    return view


def test_union_in_json_schema(tmp_path: Path) -> None:
    view = _view(tmp_path)
    schema = json.loads(JsonSchemaGenerator(view.schema, mergeimports=True).serialize())
    generator._union_in_json_schema(view, schema)
    defs = schema["$defs"]
    assert defs["Message"]["oneOf"] == [
        {"$ref": "#/$defs/AMessage"},
        {"$ref": "#/$defs/BcMessage"},
    ]
    assert defs["Message"]["discriminator"] == {"propertyName": "kind"}
    # Each member's kind is its own values alone, not the enum's $ref beside them.
    assert defs["AMessage"]["properties"]["kind"] == {"type": "string", "const": "a"}
    assert defs["BcMessage"]["properties"]["kind"] == {"type": "string", "enum": ["b", "c"]}
    check = Draft201909Validator({"$defs": defs, "$ref": "#/$defs/Message"})
    assert check.is_valid({"kind": "a", "name": "x"})
    assert check.is_valid({"kind": "c"})
    assert not check.is_valid({"kind": "a"})
    assert not check.is_valid({"kind": "b", "name": "x"})


def test_union_in_pydantic(tmp_path: Path) -> None:
    view = _view(tmp_path)
    source = generator._union_in_pydantic(
        view, PydanticGenerator(view.schema, mergeimports=True).serialize()
    )
    module: dict = {}
    exec(compile(source, "t.py", "exec"), module)  # noqa: S102
    message = module["Message"]
    assert type(message.model_validate({"kind": "a", "name": "x"}).root) is module["AMessage"]
    assert type(message.model_validate({"kind": "b"}).root) is module["BcMessage"]
    for refused in ({"kind": "a"}, {"kind": "b", "name": "x"}, {"kind": "d"}):
        with pytest.raises(ValueError):
            message.model_validate(refused)
    # The type's pattern reaches a schema-level slot, so Pydantic enforces it too.
    with pytest.raises(ValueError):
        message.model_validate({"kind": "a", "name": "x", "stamp": "12345"})


@pytest.mark.parametrize(
    ("kinds", "problem"),
    [
        ("[c]", "named by none: ['b']"),
        ("[a, b, c]", "by more than one, or not in the enum: ['a']"),
        ("[b, c, d]", "by more than one, or not in the enum: ['d']"),
    ],
)
def test_every_kind_names_one_class(tmp_path: Path, kinds: str, problem: str) -> None:
    text = SCHEMA.replace("equals_string_in: [b, c]", f"equals_string_in: {kinds}")
    with pytest.raises(ValueError) as refused:
        generator._unions(_view(tmp_path, text))
    assert problem in str(refused.value)
