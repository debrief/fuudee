"""Pyodide spike smoke test (CON-09).

Exercises the schema and kernel packages and prints a JSON report. The same
script runs under CPython and Pyodide; the spike passes when both reports
match exactly and every check passed.

    python smoke.py FIXTURES_DIR
"""

import json
import sys
import time
from pathlib import Path

from debrief_kernel import geodesy_arrays
from debrief_kernel.formatting import format_bearing, format_position, format_quantity, format_time
from debrief_kernel.geodesy import Position, TrackPath, closest_approach, destination, range_bearing
from debrief_kernel.time import parse_utc
from debrief_kernel.units import angle, duration, length, speed
from debrief_schemas import SCHEMA_VERSION, DocumentKind, dump_document, load_document


def main(fixtures: Path) -> dict:
    report: dict = {"schema_version": SCHEMA_VERSION, "documents": {}, "kernel": {}}
    timings: dict = {}

    # Schemas: every valid fixture loads, validates and round-trips; invalid ones are rejected.
    started = time.perf_counter()
    for kind in DocumentKind:
        for path in sorted((fixtures / kind.value / "valid").glob("*.json")):
            original = json.loads(path.read_text())
            again = json.loads(dump_document(kind, load_document(kind, original)))
            report["documents"][f"{kind.value}/{path.name}"] = again == original
        for folder in ("invalid/schema", "invalid/semantic"):
            for path in sorted((fixtures / kind.value / folder).glob("*.json")):
                try:
                    load_document(kind, path.read_text())
                    rejected = False
                except ValueError:
                    rejected = True
                report["documents"][f"{kind.value}/{folder}/{path.name}"] = rejected
    timings["all_fixtures_ms"] = (time.perf_counter() - started) * 1000

    # Kernel: geodesy, units and formatting give identical answers.
    wellington, salamanca = Position(174.81, -41.32), Position(-5.50, 40.96)
    rng, brg = range_bearing(wellington, salamanca)
    a = TrackPath(
        [0, 3_600_000],
        [Position(0, 0), destination(Position(0, 0), angle(45), length(12, "[nmi_i]"))],
    )
    b_start = destination(Position(0, 0), angle(90), length(6, "[nmi_i]"))
    b = TrackPath(
        [0, 3_600_000], [b_start, destination(b_start, angle(330), length(10, "[nmi_i]"))]
    )
    cpa = closest_approach(a, b)
    lons = [174.81, 0.0, -4.12, 179.9]
    lats = [-41.32, 0.0, 50.35, 0.0]
    vec = geodesy_arrays.range_bearing(
        lons, lats, [-5.50, 1.0, -3.5, -179.9], [40.96, 0.0, 50.9, 0.0]
    )
    track_positions = geodesy_arrays.positions_at(a, [0, 1_800_000, 3_600_000])
    report["kernel_arrays"] = {
        "range_m": [round(float(v), 3) for v in vec.range_m],
        "bearing_deg": [round(float(v), 9) for v in vec.bearing_deg],
        "track_lat": [round(float(v), 9) for v in track_positions.latitude],
        "residuals": [
            round(float(v), 9)
            for v in geodesy_arrays.bearing_residuals([10, 350, 180], [350, 10, 0])
        ],
        "matches_per_point": abs(float(vec.range_m[0]) - rng.value) < 1e-6,
    }
    report["kernel"] = {
        "wellington_salamanca_m": round(rng.value, 3),
        "wellington_salamanca_deg": round(brg.value, 9),
        "cpa_time_ms": cpa.time_ms,
        "cpa_range": format_quantity(cpa.range),
        "cpa_position": format_position(cpa.position_a),
        "bearing": format_bearing(angle(7.25)),
        "speed": format_quantity(length(10, "[nmi_i]") / duration(1, "h")),
        "time": format_time(parse_utc("2026-10-11T09:30:05.250Z")),
        "derived": format_quantity(speed(12, "[kn_i]") * duration(30, "min")),
    }

    started = time.perf_counter()
    for _ in range(200):
        range_bearing(wellington, salamanca)
    timings["range_bearing_us"] = (time.perf_counter() - started) / 200 * 1e6

    return {"report": report, "timings": timings}


if __name__ == "__main__":
    print(json.dumps(main(Path(sys.argv[1])), indent=2, sort_keys=True))
