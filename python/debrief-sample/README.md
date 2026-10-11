# debrief-sample

The Debrief sample data (DEP-08): real open AIS traffic as the background picture, with an invented exercise on top. Three serials, each a plot in one STAC catalogue, each carrying its own provenance as a worked example of SUB-18.

```bash
uv run python -m debrief_sample build OUT_DIR            # seed 1995
uv run python -m debrief_sample build OUT_DIR --seed 7   # a different exercise, same AIS
```

```python
from debrief_sample import build

report = build(Path("sample"))
report.plots  # {"serial-1": {"tracks": 10, "background_tracks": 8, "bearings": 261, ...}, ...}
```

## What is in it

| Serial | Time (15 Jun 2023) | Story |
| --- | --- | --- |
| 1 | 08:00Z to 12:00Z | BLUE ONE gains RED ONE, classifies it and follows it south-west, losing and regaining it |
| 2 | 12:00Z to 17:00Z | RED ONE heads west for the shipping lane; BLUE ONE zigzags astern of it to resolve range |
| 3 | 17:00Z to 23:00Z | BLUE ONE sprints and drifts; RED ONE evades, and is not regained after the first sprint |

Each plot holds:

- **Background traffic**: 8 to 10 AIS tracks from the committed extract, grey, with the vessel type as platform class. See [data/README.md](data/README.md) for the origin, licence and reduction.
- **Blue and red**: BLUE ONE (a surface ship) and RED ONE (a submarine, with depths), one fix a minute, synthesised from scripted legs with realistic turns and small seeded errors. The area is on the continental shelf, mostly 10 to 35 m deep, so RED ONE's depths of 15 to 25 m are notional. They are written as REP files and imported through debrief-io, so each is a hashed, read-only source.
- **Sensor layer**: BLUE ONE's bow sonar bearings on RED ONE every 30 s, with a 1.5° standard error. Contact is possible only within 4.5 nmi, outside the baffles (40° either side of dead astern) and while not sprinting; within those limits each 30 s sample gains a target not held with probability 0.05 and loses one held with probability 0.015. Held as a Parquet payload with its envelope (CON-02). With the default seed the sonar holds RED ONE for 130 of 240 minutes in serial 1, 174 of 300 in serial 2 and 88 of 360 in serial 3.
- **Narrative**: a plain-text log with Zulu times, 33 to 37 entries per serial, kept as a supporting file and read into time-only note annotations. Entries come from the script, the ordered legs, and what the sonar held: first contact, classification as RED ONE after 8 minutes' contact, contacts lost and regained (gaps under 3 minutes and contacts under a minute go unlogged), a target not regained after a sprint, half-hourly bearing reports, and closest approaches. A bearing report's drift comes from a regression over the last 10 minutes and is called steady unless the rate exceeds twice its standard error. Scripted lines that depend on holding RED ONE, such as a simulated attack, are left out when the sonar did not hold it.
- **Exercise area** as a shape annotation, and two named sets: *Exercise* (blue, red, bearings, area and narrative) and *Background traffic*.

Everything but the AIS is fiction. The platform names are exercise designators, not real ships. The area was chosen because open AIS covers it, not for any naval use.

## Provenance

Each plot's history records, in order:

1. `debrief-sample` (tool): synthesised the two REP files, with the seed, the serial's window and area, the sonar-off periods, a digest of the serial's script (legs, sonar-off periods and narrative lines) and how each random generator is seeded, and the hash of each file written.
2. `debrief-io.rep` (import), twice: one record per REP source, with its hash.
3. `debrief-sample.ais` (import): the AIS extract, with its hash and the AIS vessels not present in the serial.
4. `debrief-sample.bearings` (tool): the bearings, with the seed and the whole sonar model as parameters (interval, error, detection range, baffles, gain and loss probabilities, sonar-off periods, generator seeding), the two REP sources it used and the payload's hash.
5. `debrief-sample.narrative` (import): the narrative file and its hash, with the script digest.
6. `debrief-sample.area` (tool): the exercise area.
7. `debrief-sample.named-sets` (tool): the two named sets.

## Determinism

The same seed gives byte-identical catalogues from the same lockfile (SUB-20). The lockfile matters because pyarrow writes its own version into each Parquet file, so a different pyarrow gives different payload bytes and hashes, though the same bearings. Random draws come from generators seeded from the seed, the serial and the purpose. Provenance times come from a fixed clock starting at `--recorded-at` (default `2026-10-11T00:00:00.000Z`) and ticking one second per reading, so they are nominal, not the time of the build. debrief-io's `build_plot` and `import_rep` take a `clock` for this.

## Remaking the AIS extract

```bash
curl -O https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_06_15.zip
uv run python -m debrief_sample reduce-ais AIS_2023_06_15.zip data/ais-2023-06-15-chesapeake-approaches.csv
```

The archive is 330 MB and is not kept. A new extract changes every plot's AIS source hash.
