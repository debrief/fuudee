# debrief-stac

Debrief catalogues: plots and their sources in static, file-based STAC catalogues (SUB-05 to SUB-11, SUB-15 to SUB-17, SUB-23, SUB-35).

```
catalog.json               the catalogue, declaring the data-file schema version it holds
<item>/<item>.json         one STAC item per plot, with its extent in space and time
<item>/plot.geojson        the plot
<item>/sources/<file>      imported sources: copied in, read-only, hashed once
<item>/media/<file>        supporting files: video, imagery, acoustic files
<item>/payloads/<file>     observation payloads, such as Parquet bearings (CON-02)
```

```python
from debrief_stac import Catalogue

catalogue = Catalogue.create(path, "exercise-2026", "Exercise 2026", "Serials from Exercise 2026")
catalogue.create_plot("serial-01", "Serial 1")
source = catalogue.add_source("serial-01", Path("serial-01.rep"))  # SourceRef for provenance
bearings = catalogue.add_payload(
    "serial-01", Path("bearings.parquet"), media_type="application/vnd.apache.parquet"
)
plot = catalogue.read_plot("serial-01")
catalogue.write_plot("serial-01", plot)  # atomic
catalogue.verify_sources("serial-01")  # [] when unchanged
```

- **Items are found by walking the folders.** An item counts when its parent link points at the catalogue. The catalogue's child links are written but never trusted (SUB-23).
- **Saves are atomic.** Each is written to a temporary file and renamed, so a failure leaves the original intact (NFR-11).
- **Sources never change.** They are copied in read-only and never overwritten. Each content hash is computed once on import. `verify_sources` checks only the sources asked about, and re-hashes a file only when its size or modification time has changed since it was last verified (SUB-10, SUB-11).
- **Newer schemas are flagged.** Writing a newer-schema file into a catalogue raises `NewerSchemaError` unless the caller passes `allow_newer_schema=True`; the interface asks the analyst first (SUB-35).
- **Storage sits behind `Store`.** `FileStore` is the only implementation, so a database backend could replace it (SUB-09).
- **`CompositeCatalogue` shows several catalogues as one**, with each item's source catalogue (SUB-17).

Access control is the filesystem's (PRN-05, SEC-01). An item's bounding box is a plain longitude and latitude range, so a plot crossing the antimeridian gets a box spanning the globe; that is good enough for search.
