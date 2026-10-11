"""Generate boundary types from the LinkML schema (PRN-04).

LinkML is the single source. This script writes:

- schemas/generated/debrief.schema.json  (JSON Schema, also the input for TypeScript)
- python/debrief-schemas/src/debrief_schemas/generated/debrief.py  (Pydantic)
- python/debrief-schemas/src/debrief_schemas/generated/schema_version.py
- python/debrief-schemas/src/debrief_schemas/generated/debrief.schema.json  (packaged copy)

TypeScript is generated from the JSON Schema by `npm run generate` in ts/schemas,
because LinkML's own TypeScript generator drops arrays and enum types
(see docs/spikes/linkml.md).

Run with --check to fail if any committed output is stale.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from linkml.generators.jsonschemagen import JsonSchemaGenerator
from linkml.generators.pydanticgen import PydanticGenerator
from linkml_runtime.utils.schemaview import SchemaView

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "schemas" / "linkml" / "debrief.yaml"
JSON_SCHEMA = ROOT / "schemas" / "generated" / "debrief.schema.json"
PY_GENERATED = ROOT / "python" / "debrief-schemas" / "src" / "debrief_schemas" / "generated"
PYDANTIC = PY_GENERATED / "debrief.py"
PY_VERSION = PY_GENERATED / "schema_version.py"

HEADER = (
    "# Generated from schemas/linkml/debrief.yaml by scripts/generate_schemas.py. Do not edit.\n"
)


def _push_type_patterns_to_slots(view: SchemaView) -> None:
    """Copy each type's pattern onto the attributes that use it.

    gen-pydantic only enforces slot-level patterns, so without this a
    UtcTimestamp with microseconds would pass Pydantic validation while
    failing JSON Schema validation.
    """
    for cls in view.schema.classes.values():
        for att in (cls.attributes or {}).values():
            if att.pattern or not att.range or att.range not in view.all_types():
                continue
            pattern = view.induced_type(att.range).pattern
            if pattern:
                att.pattern = pattern
    view.set_modified()


def _class_ranges(view: SchemaView, name: str) -> set[str]:
    """Classes referenced by a class's attributes, including any_of alternatives."""
    classes = view.all_classes()
    found = set()
    for att in (classes[name].attributes or {}).values():
        ranges = [att.range] + [option.range for option in att.any_of or []]
        found.update(r for r in ranges if r in classes)
    return found


def _allow_extra_in_pydantic(view: SchemaView, pydantic: str) -> str:
    """Let classes with extra_slots allowed accept undeclared properties.

    gen-pydantic forbids extra properties on every class, ignoring
    extra_slots, while gen-json-schema honours it. Without this, Pydantic
    would reject STAC extension fields that JSON Schema accepts. Each changed
    class, then every class containing it, is rebuilt innermost first so the
    change reaches nested models.
    """
    classes = view.all_classes()
    extra = sorted(n for n, c in classes.items() if c.extra_slots and c.extra_slots.allowed)
    if not extra:
        return pydantic

    affected = set(extra)
    while True:
        more = {n for n in classes if _class_ranges(view, n) & affected} - affected
        if not more:
            break
        affected |= more

    ordered: list[str] = []

    def visit(name: str) -> None:
        if name in ordered:
            return
        for dependency in sorted(_class_ranges(view, name) & affected - {name}):
            visit(dependency)
        ordered.append(name)

    for name in sorted(affected):
        visit(name)

    lines = [
        "",
        "",
        "# Classes that accept undeclared properties (extra_slots), added by the generator.",
    ]
    lines += [f'{name}.model_config["extra"] = "allow"' for name in extra]
    lines += [f"{name}.model_rebuild(force=True)" for name in ordered]
    return pydantic.rstrip("\n") + "\n".join(lines) + "\n"


def _strip_null_array_items(view: SchemaView, json_schema: dict) -> None:
    """Optional LinkML array slots get nullable items in JSON Schema.

    gen-json-schema marks the elements nullable instead of the slot, so
    [null, null, null, null] would pass as a bbox while Pydantic rejects it.
    """

    def strip(node: dict) -> None:
        items = node.get("items")
        if not isinstance(items, dict):
            return
        if isinstance(items.get("type"), list) and "null" in items["type"]:
            kept = [t for t in items["type"] if t != "null"]
            items["type"] = kept[0] if len(kept) == 1 else kept
        strip(items)

    for class_name, cls in view.schema.classes.items():
        for att_name, att in (cls.attributes or {}).items():
            if att.array is not None:
                strip(json_schema["$defs"][class_name]["properties"][att.alias or att_name])


def generate() -> dict[Path, str]:
    view = SchemaView(str(SOURCE))
    # Fold the modules into one schema so edits below reach every class.
    view.merge_imports()
    _push_type_patterns_to_slots(view)
    schema = view.schema
    # Record the source relative to the repo so output is the same on every machine.
    schema.source_file = SOURCE.relative_to(ROOT).as_posix()

    json_schema = JsonSchemaGenerator(schema, mergeimports=True).serialize()
    # Stable, diff-friendly output.
    json_schema = json.loads(json_schema)
    _strip_null_array_items(view, json_schema)
    json_schema = json.dumps(json_schema, indent=2, sort_keys=True) + "\n"

    pydantic = PydanticGenerator(schema, mergeimports=True).serialize()
    pydantic = _allow_extra_in_pydantic(view, pydantic)

    version = schema.version
    return {
        JSON_SCHEMA: json_schema,
        PYDANTIC: HEADER + pydantic,
        PY_VERSION: HEADER + f'SCHEMA_VERSION = "{version}"\n',
        PY_GENERATED / "__init__.py": HEADER,
        PY_GENERATED / "debrief.schema.json": json_schema,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if outputs are stale")
    args = parser.parse_args()

    stale = []
    for path, content in generate().items():
        current = path.read_text() if path.exists() else None
        if current == content:
            continue
        if args.check:
            stale.append(path.relative_to(ROOT))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
            print(f"wrote {path.relative_to(ROOT)}")

    if stale:
        print("Generated files are stale; run scripts/generate_schemas.py:", file=sys.stderr)
        for path in stale:
            print(f"  {path}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
