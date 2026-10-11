# Spike: LinkML end to end (Phase 0)

**Question (delivery plan, Phase 0; PRN-04).** Can a non-trivial model, a track with units and provenance, be defined once in LinkML and generated into Pydantic, JSON Schema and TypeScript that agree with each other?

**Verdict: pass, with three workarounds.** The hand-written JSON Schema fallback in PRN-04 is not needed for any type tried so far. One finding (units) changes how SUB-02 is implemented and needs a decision.

## What was built

| Piece | Location |
| --- | --- |
| LinkML source, schema 0.0.1 | `schemas/linkml/debrief.yaml` |
| Generator (LinkML to Pydantic and JSON Schema), with `--check` | `scripts/generate_schemas.py` |
| Generator (JSON Schema to TypeScript), with `--check` | `ts/schemas/scripts/generate.mjs` |
| Python package: models, `load_plot`, `dump_plot` | `python/debrief-schemas` |
| TypeScript package: types, `parsePlot`, `serialisePlot` | `ts/schemas` |
| Golden fixtures: valid, invalid by schema, invalid by rule | `schemas/fixtures` |
| Cross-language round trip | `scripts/cross_language_roundtrip.sh` |
| CI running all of the above | `.github/workflows/ci.yml` |

The model covers a GeoJSON FeatureCollection of tracks (LineString geometry, parallel arrays of times, speeds and courses), a PROV array at collection and feature level with tool version, agent and model, seed, and sources with content hashes (SUB-11, SUB-18, SUB-20, SUB-24), and the schema version (SUB-12). Newer schema versions are refused before anything else is read, on both sides (SUB-14).

## Test strategy (carried over from the tracer plan)

1. **Golden fixtures.** Every valid fixture loads in Python and TypeScript; every `invalid/schema` fixture is rejected by both; every `invalid/semantic` fixture is rejected by Python.
2. **Round trip.** Each valid fixture survives Python to TypeScript to Python unchanged, and each language's own load-dump cycle is lossless.
3. **Schema comparison.** Pydantic models and JSON Schema definitions declare the same fields and the same required set for every class. TypeScript is generated from that JSON Schema, so it cannot drift.
4. **Staleness.** CI regenerates all outputs and fails if the committed copies differ.

## Findings

| # | Finding | Effect | Response |
| --- | --- | --- | --- |
| 1 | LinkML's TypeScript generator emits `number` for arrays, `string` for enum-typed fields, and drops custom-type constraints. | Unusable for boundary types. | TypeScript is generated from the LinkML-generated JSON Schema with `json-schema-to-typescript`. LinkML stays the single source, so PRN-04 holds. |
| 2 | Pydantic enforces patterns declared on a slot but not on a type. A microsecond `UtcTimestamp` passed Pydantic while failing JSON Schema. | Python and TypeScript would disagree on SUB-01. | The generator copies each type's pattern onto the slots that use it before generating. A fixture guards it. |
| 3 | Units (`unit.ucum_code`) survive only as Pydantic field metadata. JSON Schema and TypeScript carry no unit. | SUB-02's "arithmetic across incompatible units shall be prevented" cannot come from the generated types alone. | Proposed: each quantity field stores one fixed canonical unit declared in LinkML (m/s, degrees and so on); the kernel reads that metadata and wraps values in a units library for arithmetic; conversion happens only in the formatting service (SUB-04). **Needs a decision.** |
| 4 | LinkML arrays express GeoJSON's nested coordinates (`[[lon, lat], ...]`) well in Pydantic and JSON Schema, but cannot constrain each axis separately. | Latitude 95 is structurally valid. | Range check in the Python rule layer. An early attempt to model a position as an object was rejected because it breaks plain GeoJSON (PRN-07). |
| 5 | Cross-field rules (parallel arrays the same length as the geometry) cannot be expressed in LinkML. | TypeScript validation is structural only. | Rules live in Python (PRN-03). Files reaching TypeScript are written by Python, so this is acceptable while the extension never writes plot data itself. |
| 6 | Geometry unions (`any_of` Point, LineString, null) generate correctly in Pydantic and JSON Schema. | GeoJSON can be imported into LinkML (CON-04), including null geometry for time-only annotations (CAP-04). | Next model increment. |
| 7 | Optional fields accept explicit `null`; serialisation drops them. | A file holding `"speeds": null` does not round-trip byte for byte. | Writers omit absent fields; fixtures contain no nulls. |
| 8 | Generated schemas forbid unknown properties. | Strict, but rejects GeoJSON foreign members and STAC extension fields written by other tools. | Open: decide per class whether to allow extra members when STAC items are modelled. |

## Decisions needed

1. **Units (finding 3).** Adopt fixed canonical units per field, enforced by a kernel units layer reading LinkML metadata? Recommended.
2. **Foreign members (finding 8).** Allow unknown properties on GeoJSON and STAC classes, or stay strict?

## Not yet covered

STAC items and catalogues, opaque Arrow or Parquet payloads (CON-02), shared state (SUB-26), tool declarations (TL-04, CAP-24). These are the rest of the Phase 0 Schemas workstream.
