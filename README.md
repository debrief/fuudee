# fuudee
Future-debrief (5?)

Debrief v4. Requirements and plans are in [docs/](docs/README.md); identifiers such as SUB-01 refer to the SRD.

## Layout

| Path | Contents |
| --- | --- |
| `schemas/linkml/` | LinkML source for every boundary type (PRN-04); see [schemas/README.md](schemas/README.md) |
| `schemas/generated/` | JSON Schema generated from LinkML |
| `schemas/fixtures/` | Golden fixtures shared by Python and TypeScript tests |
| `python/debrief-schemas/` | Generated Pydantic models and document validation |
| `python/debrief-kernel/` | Time, units, geodesy and display formatting (SUB-01 to SUB-04); see [its README](python/debrief-kernel/README.md) |
| `ts/schemas/` | Generated TypeScript types and document validation |
| `ts/kernel/` | Unit conversion and display formatting for TypeScript views, held to the vectors shared with the Python kernel |
| `schemas/vectors/` | Test vectors both languages must agree on |
| `scripts/` | Generators and the cross-language round trip |

## Development

Requires [uv](https://docs.astral.sh/uv/) and Node 22.

```bash
uv sync
npm ci --prefix ts/schemas
npm ci --prefix ts/kernel

# After editing schemas/linkml/debrief.yaml
uv run python scripts/generate_schemas.py
npm run --prefix ts/schemas generate

# Tests
uv run pytest
npm test --prefix ts/schemas
npm run --prefix ts/schemas build && npm test --prefix ts/kernel
scripts/cross_language_roundtrip.sh
```

Never edit generated files; CI fails if they differ from a fresh generation.
