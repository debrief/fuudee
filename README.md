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
| `python/debrief-config/` | Per-user configuration: the stores an analyst knows about (SEC-06); see [its README](python/debrief-config/README.md) |
| `python/debrief-io/` | Importers: REP files into catalogued plots with provenance; see [its README](python/debrief-io/README.md) |
| `python/debrief-stac/` | File-based STAC catalogues of plots and sources; see [its README](python/debrief-stac/README.md) |
| `python/debrief-sample/` | Sample data: open AIS with a synthesised exercise on top, built into a catalogue (DEP-08); see [its README](python/debrief-sample/README.md) |
| `python/debrief-tools/` | Tool framework, the MCP tool service and the core tools; see [its README](python/debrief-tools/README.md) |
| `python/debrief-kernel/` | Time, units, geodesy and display formatting (SUB-01 to SUB-04); see [its README](python/debrief-kernel/README.md) |
| `ts/schemas/` | Generated TypeScript types and document validation |
| `ts/kernel/` | Unit conversion and display formatting for TypeScript views, held to the vectors shared with the Python kernel |
| `ts/config/` | The same per-user configuration for the VS Code extension, held to the location rules shared with Python |
| `vscode/` | The VS Code extension: catalogues, map, outline, tools; see [its README](vscode/README.md) |
| `schemas/vectors/` | Test vectors both languages must agree on |
| `scripts/` | Generators and the cross-language round trip |
| `site/` | Development blog and guides (style guide, interaction models, tool-author guide, glossary), published to GitHub Pages from the `gh-pages` branch |

## Development

Requires [uv](https://docs.astral.sh/uv/) and Node 22.

```bash
uv sync
npm ci --prefix ts/schemas
npm ci --prefix ts/kernel
npm ci --prefix ts/config

# After editing schemas/linkml/debrief.yaml
uv run python scripts/generate_schemas.py
npm run --prefix ts/schemas generate

# Tests
uv run pytest
npm test --prefix ts/schemas
npm run --prefix ts/schemas build && npm test --prefix ts/kernel && npm test --prefix ts/config
scripts/cross_language_roundtrip.sh
```

Never edit generated files; CI fails if they differ from a fresh generation.

### Blog and guides

```bash
uv run --group docs mkdocs serve --config-file site/mkdocs.yml
```

Every pull request says whether it needs a blog post and confirms nothing sensitive is included (see the pull-request template). Extend the guides in the same pull request as the feature that needs them.
