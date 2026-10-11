# Spike: Pyodide (Phase 0)

**Question (delivery plan, Phase 0; CON-09).** Do the libraries chosen for tools and the kernel run in the browser, so the standalone web build can run the Python tools with no server?

**Verdict: pass.** Under Pyodide, the schema and kernel packages produce output identical to CPython: all 77 fixture checks, geodesic reference values to the millimetre, closest approach to the millisecond, and every formatted string. Pyodide becomes a CI job, so every later library choice is checked against it.

## Method

`spikes/pyodide/run.sh` builds wheels for `debrief-schemas` and `debrief-kernel`, then runs `smoke.py` twice:

- under CPython;
- under Pyodide in Node, loading Pyodide's own builds of the compiled dependencies (pydantic-core, rpds-py) and our wheels plus `geographiclib` from local files.

It fails unless both reports are identical and every check passed. The smoke test:

- loads, validates and round-trips every valid fixture of every document kind;
- confirms every invalid fixture is rejected;
- computes geodesic reference values, a closest approach, and formatted quantities, bearings, positions and times.

## Results

| | CPython 3.12 | Pyodide 314.0.7 (Python 3.14.2) | Pyodide 0.29.5 (Python 3.13.2) |
| --- | --- | --- | --- |
| Fixture checks | 77/77 | 77/77 | 77/77 |
| Report identical to CPython | n/a | Yes | Yes |
| All fixtures (load, validate, round trip) | 118 ms | 220 ms | 223 ms |
| One range-and-bearing call | 63 µs | 125 µs | 124 µs |
| Pyodide start | n/a | 1.9 s | 1.6 s |
| Ready (packages and wheels installed) | n/a | 2.9 s | 2.7 s |

Timings are in Node on the development container, with packages already cached. A browser adds the download: about 16 MB uncompressed (Pyodide core 13 MB, packages 2.6 MB, our wheels and geographiclib under 0.2 MB), less over a compressed connection.

## Findings

| # | Finding | Response |
| --- | --- | --- |
| 1 | **pydantic 2.11 is the real minimum.** With pydantic 2.10, files still round-trip, because loading uses aliases. But building a model in code by its Python field names (`debrief_schema_version=...`) fails, because the generated `validate_by_name` setting only exists from 2.11. Tools build models in code. | `debrief-schemas` now requires `pydantic>=2.11` (it said `>=2.7`). Pyodide 0.29.5 and 314.x ship 2.12.5; 0.29.0 ships 2.10.6 and is not supported. |
| 2 | Geodesic calls run about twice as slowly in Pyodide. | Fine for the web demo; well inside interactive budgets (about 0.75 ms per Tote update with five secondaries). |
| 3 | Pyodide's Python (3.13, 3.14) is newer than CI's (3.12), and results are identical. | Keep `requires-python >=3.12`; the Pyodide job covers the newer interpreters. |
| 4 | Libraries likely needed later are in Pyodide 314.0.7: numpy 2.4, pandas 3.0, pyarrow 22, pyproj 3.7, shapely 2.1, scipy 1.18, polars 1.33, duckdb 1.5, lxml 6.1. Absent: python-docx, pypdf, pdfminer.six (all pure Python, so installable from wheels). | pyarrow covers the Parquet and Arrow payloads (CON-02) in the browser. A narrative importer (CAP-19) can still run there using pure-Python document libraries; otherwise CON-10 applies. |
| 5 | `uv build` writes a `.gitignore` into its output folder. | The runner installs only `.whl` files. |

## Constraint from here on

Every library a tool or the kernel uses shall be pure Python or in the Pyodide distribution, unless the tool is declared unavailable in the web build under CON-10. The `pyodide` CI job enforces this for the packages it loads. Pin Pyodide to 314.0.7 for the web build until a deliberate upgrade.
