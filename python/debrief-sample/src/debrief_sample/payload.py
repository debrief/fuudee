"""Sonar bearings as a Parquet payload with its envelope (CON-02).

The payload's inner schema is Debrief's own "bearings" table: one row per
observation, with the time, the measured true bearing and its standard
error. The envelope in the plot names the format, the inner schema and its
version, each column's units, the CRS and the time reference.
"""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from debrief_sample.synth import Bearing
from debrief_schemas import models

MEDIA_TYPE = "application/vnd.apache.parquet"
INNER_SCHEMA = models.InnerSchemaRef(name="debrief.bearings", version="0.0.1")

SCHEMA = pa.schema(
    [
        pa.field("time", pa.timestamp("ms", tz="UTC"), nullable=False),
        pa.field("bearing", pa.float64(), nullable=False),
        pa.field("bearing_error", pa.float64(), nullable=False),
    ]
)

COLUMNS = [
    models.PayloadColumn(name="time"),
    models.PayloadColumn(name="bearing", quantity_kind="angle", unit="deg"),
    models.PayloadColumn(name="bearing_error", quantity_kind="angle", unit="deg"),
]


def write_bearings(bearings: list[Bearing], bearing_error_deg: float, path: Path) -> None:
    """Write bearings to Parquet. The same rows always give the same bytes."""
    table = pa.table(
        {
            "time": [b.time_ms for b in bearings],
            "bearing": [b.bearing_deg for b in bearings],
            "bearing_error": [bearing_error_deg] * len(bearings),
        },
        schema=SCHEMA,
    )
    pq.write_table(table, path, compression="zstd")


def read_bearings(path: Path) -> list[Bearing]:
    table = pq.read_table(path)
    times = table.column("time").cast(pa.int64()).to_pylist()
    return [Bearing(t, b) for t, b in zip(times, table.column("bearing").to_pylist(), strict=True)]


def envelope(href: str, content_hash: str) -> models.PayloadRef:
    return models.PayloadRef(
        href=href,
        format="parquet",
        inner_schema=INNER_SCHEMA,
        columns=COLUMNS,
        crs="OGC:CRS84",
        time_reference="UTC",
        content_hash=content_hash,
    )
