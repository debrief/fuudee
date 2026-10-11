# fuudee
Future-debrief (5?)

Debrief v4. Requirements and plans are in [docs/](docs/README.md); identifiers such as SUB-01 refer to the SRD.

## Layout

| Path | Contents |
| --- | --- |
| `schemas/linkml/` | LinkML source for every boundary type (PRN-04); see [schemas/README.md](schemas/README.md) |
| `schemas/generated/` | JSON Schema generated from LinkML |
| `schemas/fixtures/` | Golden fixtures shared by Python and TypeScript tests |
| `python/debrief-schemas/` | Generated Pydantic models and plot validation |
| `ts/schemas/` | Generated TypeScript types and plot validation |
| `scripts/` | Generators and the cross-language round trip |
| `site/` | Development blog and guides (style guide, interaction models, tool-author guide, glossary), published to GitHub Pages |

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

### Blog and guides

```bash
uv run --group docs mkdocs serve --config-file site/mkdocs.yml
```

Every pull request says whether it needs a blog post and confirms nothing sensitive is included (see the pull-request template). Extend the guides in the same pull request as the feature that needs them.
