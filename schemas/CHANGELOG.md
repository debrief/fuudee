# Data-file schema changelog

The data-file schema is versioned independently of Debrief (SUB-12). Before 1.0.0 there is no migration guarantee (SUB-13).

## 0.0.5 (11 Oct 2026)

- Per-user configuration (`UserConfig`): the stores Debrief knows about, read and changed by Python and TypeScript (SEC-06). It carries its own `config_version`, not the data-file schema version.

## 0.0.4 (11 Oct 2026)

- Track style: an optional colour (and the legacy REP symbology it came from) on each track, for display (DEV-07, SUB-22).
- Track depths: an optional depth series, positive down, with its unit (EXT-01).

## 0.0.3 (11 Oct 2026)

- Display formatting settings (`FormatSettings`), shared by the Python and TypeScript formatting services (SUB-04).

## 0.0.2 (11 Oct 2026)

- Split into modules: core, geojson, prov, features, stac, state, tools.
- Plot features: annotations (point, line, polygon or time-only) and sensor observations with an opaque payload envelope, alongside tracks. Named sets.
- Quantities with units (length, speed, angle, duration) and parameter values.
- Provenance records the parameters an operation ran with, and schema migrations.
- STAC catalogues, items, assets and links, with `debrief:schema_version`.
- Shared state: time, selection, viewport.
- Tool declarations and tool results.

## 0.0.1 (11 Oct 2026)

- LinkML spike: tracks with unit-carrying speed and course series, provenance, schema version.
