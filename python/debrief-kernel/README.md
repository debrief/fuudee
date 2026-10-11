# debrief-kernel

The substrate kernel (SUB-01 to SUB-04), shared by every capability and tool.

| Module | Provides | SRD |
| --- | --- | --- |
| `time` | UTC instants as integer epoch milliseconds; strict parsing and writing of `2026-10-11T09:30:00.000Z`; truncation of finer legacy times with a flag for provenance | SUB-01, EXT-14 |
| `units` | `Quantity` with kind-checked arithmetic (adding metres to knots raises); conversions between the schema's UCUM units; speed × duration and length ÷ duration; bearing wrap-around | SUB-02, NFR-04 |
| `geodesy` | Range and bearing, destination, interpolation and drawing points along geodesics; tracks interpolated over time; closest point of approach | SUB-03 |
| `geodesy_arrays` | The same geodesics over numpy arrays (pyproj): range and bearing, destination, track positions at many times, bearing residuals. For anything over hundreds of points, such as TMA residuals during a drag | SUB-03, NFR-04 |
| `formatting` | With its TypeScript twin in `ts/kernel`, the one place values are written for people: quantities, three-figure bearings, positions (decimal degrees, degrees and minutes, degrees, minutes and seconds) and times (Zulu, date-time, DTG, optional display zone) | SUB-04 |

## Geodesy

All measurement uses Karney's geodesic algorithms on WGS84 (`geographiclib`, pure Python, so it also runs under Pyodide). It is independent of the display projection. The acceptance tests are published reference values: one degree along the equator and the meridian, and Karney's Wellington–Salamanca example, each to 1 mm and 10⁻⁶ degrees. Closest approach is checked against brute-force sampling.

A range-and-bearing call takes about 50 µs and an interpolation about 75 µs, so a Tote update with five secondaries needs well under 1 ms of computation.

Calculations over many points use `geodesy_arrays` instead: PROJ's C implementation of the same algorithm, about fifty times faster per point. Residuals for a 2,160-bearing TMA drag take about 2 ms rather than 200 ms (decision 11 Oct; `docs/spikes/tote-latency.md`). Tests hold it to the per-point functions to a micrometre and 10⁻⁹ degrees, and pin pyproj's azimuth order: it returns forward azimuth, back azimuth, distance, and the back azimuth looks plausible but is about 180° out. Both numpy and pyproj are in Pyodide, and the Pyodide CI job runs this module. They add about 1.6 s to the web build's start-up.

### Difference from legacy Debrief

Legacy Debrief measured on a flat-earth model: mid-latitude sailing on a sphere, with one degree of arc equal to 60 nautical miles. v4 does not reproduce it (decision 11 Oct: geodesic only; legacy kernel tests are not ported). Analysts comparing v3 and v4 figures should expect these differences, measured as the worst case over all bearings:

| Latitude | Range | Worst range difference | Worst bearing difference |
| --- | --- | --- | --- |
| 0° | 10 nmi | 0.49% (91 m) | 0.19° |
| 50° | 1 nmi | 0.37% (7 m) | 0.09° |
| 50° | 10 nmi | 0.37% (70 m) | 0.16° |
| 50° | 50 nmi | 0.37% (347 m) | 0.52° |
| 70° | 50 nmi | 0.47% (433 m) | 1.14° |

The bearing differences matter most for TMA: residuals computed by v4 will not match those of a solution built in v3. A legacy plot imported under EXT-14 keeps its positions; only measurements made on them change.

## Formatting defaults

Knots to one decimal, nautical miles to two, three-figure true bearings (`045.0°T`), degrees and decimal minutes (`50°20.120'N 004°07.210'W`), Zulu time (`09:30:05Z`). Month names are fixed English, never the machine's locale. These are provisional until the style guide's language section (DEV-07) settles them.

### One specification, two implementations

TypeScript views format values without a call to Python (decision 11 Oct). The design has four parts:

- **Settings:** `FormatSettings` is a LinkML type (`schemas/linkml/formatting.yaml`), so both languages read the same settings document. Defaults are in `schemas/vectors/format-defaults.json`.
- **TypeScript:** `ts/kernel` is the TypeScript formatter. It mirrors this module operation for operation, so unit conversions are bit-identical.
- **Shared vectors:** `schemas/vectors/formatting.json` holds 39 cases. Both test suites run every one and must produce the same string. To change the formatting, change the vectors first.
- **Rounding:** half away from zero, on the exact stored value (`2.5` → `3`, `0.125` → `0.13`, `1.005` → `1.00`). This is what JavaScript's `toFixed` does; Python's own formatting rounds half to even, so `fixed()` implements the shared rule. A value that rounds to zero has no sign.
- **Local display zones:** shown as an offset from UTC (`10:30:05 UTC+1`), not an abbreviation such as `BST`. Abbreviations vary between runtimes.
