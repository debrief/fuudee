# debrief-kernel

The substrate kernel (SUB-01 to SUB-04), shared by every capability and tool.

| Module | Provides | SRD |
| --- | --- | --- |
| `time` | UTC instants as integer epoch milliseconds; strict parsing and writing of `2026-10-11T09:30:00.000Z`; truncation of finer legacy times with a flag for provenance | SUB-01, EXT-14 |
| `units` | `Quantity` with kind-checked arithmetic (adding metres to knots raises); conversions between the schema's UCUM units; speed × duration and length ÷ duration; bearing wrap-around | SUB-02, NFR-04 |
| `geodesy` | Range and bearing, destination, interpolation and drawing points along geodesics; tracks interpolated over time; closest point of approach | SUB-03 |
| `formatting` | The one place values are written for people: quantities, three-figure bearings, positions (decimal degrees, degrees and minutes, degrees, minutes and seconds) and times (Zulu, date-time, DTG, optional display zone) | SUB-04 |

## Geodesy

All measurement uses Karney's geodesic algorithms on WGS84 (`geographiclib`, pure Python, so it also runs under Pyodide). It is independent of the display projection. The acceptance tests are published reference values: one degree along the equator and the meridian, and Karney's Wellington–Salamanca example, each to 1 mm and 10⁻⁶ degrees. Closest approach is checked against brute-force sampling.

A range-and-bearing call takes about 50 µs and an interpolation about 75 µs, so a Tote update with five secondaries needs well under 1 ms of computation.

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

`FormatSettings` is a Python-only type for now. Before a TypeScript view formats anything, either it moves into the LinkML schema with shared test vectors for a TypeScript implementation, or views call this service (open question; see the pull request).
