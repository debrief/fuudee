# Data-file schema

Every type that crosses a process or language boundary is defined here in LinkML and generated into Python, JSON Schema and TypeScript (PRN-04, CON-01). Never hand-write a boundary type, and never edit the generated files.

## Modules

| Module | Contents | SRD |
| --- | --- | --- |
| `core.yaml` | Timestamps, schema version, content hash; quantities with units; time ranges; parameter values | SUB-01, SUB-02, SUB-11, SUB-12 |
| `geojson.yaml` | Point, LineString and Polygon geometries | SUB-05, CON-04 |
| `prov.yaml` | Provenance records, tools, agents, sources, catalogue items drawn from | SUB-18 to SUB-20, SUB-24, CAP-12 |
| `features.yaml` | Plot features (tracks and their TMA solution tags, annotations with their shapes and appearance, sensors and their cuts, sensor observations), a TMA solution's first guess (`TmaRequest`), payload envelopes, named sets, the plot itself; an annotation as a form describes it (`AnnotationSpec`) | SUB-05, CAP-03, CAP-04, CAP-21, CAP-22, CON-02, TL-11 |
| `stac.yaml` | Catalogues, items, assets, links; an item's arrival, revision, coverage and what it drew from | SUB-06, SUB-15 to SUB-17, SUB-23, SUB-35, CAP-08 to CAP-12 |
| `state.yaml` | Current time, selection and viewport | SUB-26, SUB-27, TL-10 |
| `tools.yaml` | Tool declarations, parameter declarations, tool results | TL-04 to TL-13, CAP-24 |
| `formatting.yaml` | The analyst's display formatting settings | SUB-04 |
| `collation.yaml` | What the catalogue browser shows while collating: a plot's coverage, platforms and their sources, periods, items marked as new data, review flags | CAP-05, CAP-08 to CAP-12 |
| `figures.yaml` | Exported images: an image's ID and its short form, the plot's export log (`ImageExport`, in its island), what the map is asked to draw and draws, an earlier revision shown read-only, a plot an image came from | SUB-25, EXT-05, OUT-04 |
| `tma.yaml` | What the Bearings view shows: a sensor's cuts listed, TMA solutions, a solution's residuals and RMS | CAP-21 |
| `history.yaml` | A plot's history, kept in its plot file (`PlotHistory`, `HistoryStep`), and the earlier history-folder layout (`Delta`, `HistoryHead`) | SUB-19 to SUB-21, NFR-10, NFR-11 |
| `messages.yaml` | Messages between the extension host and its webviews: one class per kind (`ShowPlotMessage`, `TmaPanesMessage`, ...), each naming the members it carries and needs; `WebviewMessage` is their union, told apart by `kind` | CON-08, PAR-13 |
| `debrief.yaml` | Root: imports the modules and holds the schema version | SUB-12 |

## External standards (CON-04)

| Standard | Classification | Notes |
| --- | --- | --- |
| GeoJSON (RFC 7946) | Imported | Point, LineString and Polygon only. Features are Debrief's own classes; `properties.kind` names the feature type. GeoJSON has no curves: a circle or an ellipse is a polygon approximating it, with its exact centre and size as properties. |
| STAC 1.1 | Imported, Debrief subset | Catalogue, item, asset and link. Item properties and assets accept and preserve extension fields; everything else is strict. Debrief's own fields use the `debrief:` prefix. |
| PROV | Imported, Debrief subset | An activity record per operation, with agent and used entities. Serialised as Debrief's PROV array, not PROV-JSON. |
| Arrow, Parquet | Trusted as external | Payload formats only (CON-02). The payload's columns are described by `PayloadRef`, its inner schema by name and version. |

## Conventions

- **Units travel with values.** A quantity is `{"value": 5.0, "unit": "m"}` and a series is `{"unit": "m/s", "values": [...]}`, using UCUM codes. Each quantity kind has its own unit enum, so a unit of the wrong kind fails validation in both languages. GeoJSON positions are exempt: they are always degrees.
- **Times** are UTC with exactly three decimal places: `2026-10-11T09:30:00.000Z`.
- **Feature kinds** form the taxonomy that tools declare against (TL-06): `track`, `annotation`, `sensor`, `sensor_cut`, `sensor_observations`.
- **Strict by default.** Undeclared properties are rejected except where STAC expects extension fields.
- **Schema version.** Plots record `schema_version`; STAC items and catalogues record `debrief:schema_version`. Change the version in `debrief.yaml` and note it in `CHANGELOG.md` whenever the schema changes.

## Validation layers

1. **Schema version** (files only), before anything else is read. A newer file is refused, naming the version it needs (SUB-14). An older file opens only if a chain of registered migrations leads from its version to the current one, and is refused otherwise, naming its version (SUB-13). The registry is the same in both languages (`debrief_schemas.migrations`, `MIGRATIONS` in `ts/schemas`) and is empty: before 1.0.0 there is no migration guarantee, so today only an exact match opens. A migration is a function from a file's JSON at one version to its JSON at the next; the registry sets the version after each step and records each migration applied to a plot in its provenance, as an activity of kind `migration` naming both versions and what changed. In Python a plot that carries its history also gains a step holding those records, so its hash chain stays whole; earlier steps are not rewritten. Writing never migrates.
2. **Structure**: the generated JSON Schema, run identically in Python and TypeScript. A union told apart by a member (`WebviewMessage`, by `kind`) carries OpenAPI's `discriminator`: both languages check a message against the one class its kind names, so its problems are that class's.
3. **Rules** LinkML cannot express, in Python only (PRN-03). Examples: parallel arrays match the geometry, track times are in order, polygon rings are closed, a time-only annotation has a time, an annotation's shape has its geometry, a circle's polygon matches its centre and radius, a parameter's default matches its kind, a plot's history is an unbroken hash chain whose current step matches its content. The webview message rules are the one exception: the hosts check them on receipt too (`vscode/webview/messagecheck.ts`), and a test asserts both languages refuse every `webview_message/invalid/semantic` fixture.

## Fixtures

`fixtures/<kind>/valid`, `invalid/schema` and `invalid/semantic`, where kind is a document kind (`plot`, `stac_item`, `stac_catalog`, `tool_declaration`, `tool_result`, `shared_state`, `format_settings`, `user_config`, `webview_message`, and `delta` and `history_head` of the earlier history layout). Plot fixtures named `history-*` carry a history in the plot file: its hash chain, numbering, pointers and content hash. Tests in both languages read them. A semantic fixture must pass JSON Schema; a test enforces this.

## Workflow

```bash
uv run python scripts/generate_schemas.py      # LinkML -> Pydantic, JSON Schema
npm run --prefix ts/schemas generate           # JSON Schema -> TypeScript
uv run pytest && npm test --prefix ts/schemas && scripts/cross_language_roundtrip.sh
```

To bump the version, never by hand:

```bash
uv run python scripts/bump_schema.py X.Y.Z --dry-run   # list what would change
uv run python scripts/bump_schema.py X.Y.Z             # rewrite, then regenerate
```

It rewrites the version in every fixture and every test that writes it as a `schema_version` member, seals plot fixtures' histories again (the version is part of the content hash), adds a stub to `CHANGELOG.md` for you to fill in, changes `debrief.yaml` last, and runs both generators. Run again, it changes nothing. `bump_schema.py --check`, run by a test, fails if any committed file names the current version in a form a bump would miss.

The generators work around several LinkML defects; see `docs/spikes/linkml.md`.
