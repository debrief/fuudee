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
    for cls in view.all_classes().values():
        for att in (cls.attributes or {}).values():
            if att.pattern or not att.range or att.range not in view.all_types():
                continue
            pattern = view.induced_type(att.range).pattern
            if pattern:
                att.pattern = pattern
    view.set_modified()


def generate() -> dict[Path, str]:
    view = SchemaView(str(SOURCE))
    _push_type_patterns_to_slots(view)
    schema = view.schema

    json_schema = JsonSchemaGenerator(schema, mergeimports=True).serialize()
    # Stable, diff-friendly output.
    json_schema = json.dumps(json.loads(json_schema), indent=2, sort_keys=True) + "\n"

    pydantic = PydanticGenerator(schema, mergeimports=True).serialize()

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
