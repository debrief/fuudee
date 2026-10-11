# debrief-sample

The Debrief sample data (DEP-08): real open AIS traffic as the background picture, with an invented exercise on top. Three serials, each a plot in one STAC catalogue, each carrying its own provenance as a worked example of SUB-18.

```bash
uv run python -m debrief_sample build OUT_DIR            # seed 1995
uv run python -m debrief_sample build OUT_DIR --seed 7   # a different exercise, same AIS
```

```python
from debrief_sample import build

report = build(Path("sample"))
report.plots  # {"serial-1": {"tracks": 10, "background_tracks": 8, "bearings": 428, ...}, ...}
```

## What is in it

| Serial | Time (15 Jun 2023) | Story |
| --- | --- | --- |
| 1 | 08:00Z to 12:00Z | BLUE ONE searches, gains RED ONE and holds it as it heads south-west |
| 2 | 12:00Z to 17:00Z | RED ONE heads west for the shipping lane; BLUE ONE changes legs to resolve range |
| 3 | 17:00Z to 23:00Z | BLUE ONE sprints and drifts, losing contact while sprinting; RED ONE evades |

Each plot holds:

- **Background traffic**: 8 to 10 AIS tracks from the committed extract, grey, with the vessel type as platform class. See [data/README.md](data/README.md) for the origin, licence and reduction.
- **Blue and red**: BLUE ONE (a surface ship) and RED ONE (a submarine, with depths), one fix a minute, synthesised from scripted legs with realistic turns and small seeded errors. They are written as REP files and imported through debrief-io, so each is a hashed, read-only source.
- **Sensor layer**: BLUE ONE's bow sonar bearings on RED ONE every 30 s, while within 8 nmi and not sprinting, with a 1.5° standard error. Held as a Parquet payload with its envelope (CON-02).
- **Narrative**: a plain-text log with Zulu times, 26 to 33 entries per serial, kept as a supporting file and read into time-only note annotations. Entries come from the script, the ordered legs, contacts gained and lost, half-hourly bearing reports, and closest approaches.
- **Exercise area** as a shape annotation, and two named sets: *Exercise* and *Background traffic*.

Everything but the AIS is fiction. The platform names are exercise designators, not real ships.

## Provenance

Each plot's history records, in order:

1. `debrief-sample` (tool): synthesised the two REP files, with the seed and the serial's window and area, and the hash of each file written.
2. `debrief-io.rep` (import), twice: one record per REP source, with its hash.
3. `debrief-sample.ais` (import): the AIS extract, with its hash and the AIS vessels not present in the serial.
4. `debrief-sample.bearings` (tool): the bearings, with the seed, interval, error and detection range as parameters, the two REP sources it used and the payload's hash.
5. `debrief-sample.narrative` (import): the narrative file and its hash.

## Determinism

The same seed gives byte-identical catalogues (SUB-20). Random draws come from generators seeded from the seed, the serial and the purpose. Provenance times come from a fixed clock starting at `--recorded-at` (default `2026-10-11T00:00:00.000Z`) and ticking one second per reading, so they are nominal, not the time of the build. debrief-io's `build_plot` and `import_rep` take a `clock` for this.

## Remaking the AIS extract

```bash
curl -O https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_06_15.zip
uv run python -m debrief_sample reduce-ais AIS_2023_06_15.zip data/ais-2023-06-15-chesapeake-approaches.csv
```

The archive is 330 MB and is not kept. A new extract changes every plot's AIS source hash.
