# Data-file schema

Every type that crosses a process or language boundary is defined here in LinkML and generated into Python, JSON Schema and TypeScript (PRN-04, CON-01). Never hand-write a boundary type, and never edit the generated files.

## Modules

| Module | Contents | SRD |
| --- | --- | --- |
| `core.yaml` | Timestamps, schema version, content hash; quantities with units; time ranges; parameter values | SUB-01, SUB-02, SUB-11, SUB-12 |
| `geojson.yaml` | Point, LineString and Polygon geometries | SUB-05, CON-04 |
| `prov.yaml` | Provenance records, tools, agents, sources | SUB-18 to SUB-20, SUB-24 |
| `features.yaml` | Plot features (tracks, annotations, sensor observations), payload envelopes, named sets, the plot itself | SUB-05, CAP-03, CAP-04, CAP-22, CON-02, TL-11 |
| `stac.yaml` | Catalogues, items, assets, links | SUB-06, SUB-15 to SUB-17, SUB-23, SUB-35 |
| `state.yaml` | Current time, selection and viewport | SUB-26, SUB-27, TL-10 |
| `tools.yaml` | Tool declarations, parameter declarations, tool results | TL-04 to TL-13, CAP-24 |
| `formatting.yaml` | The analyst's display formatting settings | SUB-04 |
| `history.yaml` | A plot's history, kept in its plot file (`PlotHistory`, `HistoryStep`), and the earlier history-folder layout (`Delta`, `HistoryHead`) | SUB-19 to SUB-21, NFR-10, NFR-11 |
| `debrief.yaml` | Root: imports the modules and holds the schema version | SUB-12 |

## External standards (CON-04)

| Standard | Classification | Notes |
| --- | --- | --- |
| GeoJSON (RFC 7946) | Imported | Point, LineString and Polygon only. Features are Debrief's own classes; `properties.kind` names the feature type. |
| STAC 1.1 | Imported, Debrief subset | Catalogue, item, asset and link. Item properties and assets accept and preserve extension fields; everything else is strict. Debrief's own fields use the `debrief:` prefix. |
| PROV | Imported, Debrief subset | An activity record per operation, with agent and used entities. Serialised as Debrief's PROV array, not PROV-JSON. |
| Arrow, Parquet | Trusted as external | Payload formats only (CON-02). The payload's columns are described by `PayloadRef`, its inner schema by name and version. |

## Conventions

- **Units travel with values.** A quantity is `{"value": 5.0, "unit": "m"}` and a series is `{"unit": "m/s", "values": [...]}`, using UCUM codes. Each quantity kind has its own unit enum, so a unit of the wrong kind fails validation in both languages. GeoJSON positions are exempt: they are always degrees.
- **Times** are UTC with exactly three decimal places: `2026-10-11T09:30:00.000Z`.
- **Feature kinds** form the taxonomy that tools declare against (TL-06): `track`, `annotation`, `sensor_observations`.
- **Strict by default.** Undeclared properties are rejected except where STAC expects extension fields.
- **Schema version.** Plots record `schema_version`; STAC items and catalogues record `debrief:schema_version`. Change the version in `debrief.yaml` and note it in `CHANGELOG.md` whenever the schema changes.

## Validation layers

1. **Schema version** (files only): a file with a different version is refused before it is read (SUB-14). Before 1.0.0 there is no migration, so only an exact match opens.
2. **Structure**: the generated JSON Schema, run identically in Python and TypeScript.
3. **Rules** LinkML cannot express, in Python only (PRN-03). Examples: parallel arrays match the geometry, track times are in order, polygon rings are closed, a time-only annotation has a time, a parameter's default matches its kind, a plot's history is an unbroken hash chain whose current step matches its content.

## Fixtures

`fixtures/<kind>/valid`, `invalid/schema` and `invalid/semantic`, where kind is a document kind (`plot`, `stac_item`, `stac_catalog`, `tool_declaration`, `tool_result`, `shared_state`, `format_settings`, `user_config`, `webview_message`, and `delta` and `history_head` of the earlier history layout). Plot fixtures named `history-*` carry a history in the plot file: its hash chain, numbering, pointers and content hash. Tests in both languages read them. A semantic fixture must pass JSON Schema; a test enforces this.

## Workflow

```bash
uv run python scripts/generate_schemas.py      # LinkML -> Pydantic, JSON Schema
npm run --prefix ts/schemas generate           # JSON Schema -> TypeScript
uv run pytest && npm test --prefix ts/schemas && scripts/cross_language_roundtrip.sh
```

The generators work around several LinkML defects; see `docs/spikes/linkml.md`.
