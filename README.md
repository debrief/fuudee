# fuudee
Future-debrief (5?)

Debrief v4. Requirements and plans are in [docs/](docs/README.md); identifiers such as SUB-01 refer to the SRD.

## Layout

| Path | Contents |
| --- | --- |
| `schemas/linkml/` | LinkML source for every boundary type (PRN-04) |
| `schemas/generated/` | JSON Schema generated from LinkML |
| `schemas/fixtures/` | Golden fixtures shared by Python and TypeScript tests |
| `python/debrief-schemas/` | Generated Pydantic models and plot validation |
| `ts/schemas/` | Generated TypeScript types and plot validation |
| `scripts/` | Generators and the cross-language round trip |

## Development

Requires [uv](https://docs.astral.sh/uv/) and Node 22.

```bash
uv sync
npm ci --prefix ts/schemas

# After editing schemas/linkml/debrief.yaml
uv run python scripts/generate_schemas.py
npm run --prefix ts/schemas generate

# Tests
uv run pytest
npm test --prefix ts/schemas
scripts/cross_language_roundtrip.sh
```

Never edit generated files; CI fails if they differ from a fresh generation.
